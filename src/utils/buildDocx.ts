import JSZip from 'jszip';
import type { AcceptedFix, AutoAppliedChange } from '../types';

export async function buildDocx(
  originalArchive: JSZip,
  acceptedFixes: AcceptedFix[],
  autoAppliedChanges: AutoAppliedChange[] = []
): Promise<Blob> {
  // Deep-clone the archive: re-serialize to arraybuffer then reload into a fresh
  // JSZip instance so the original parsedDoc.zipArchive is never mutated.
  const clonedBuffer = await originalArchive.generateAsync({ type: 'arraybuffer' });
  const zip = await JSZip.loadAsync(clonedBuffer);

  // Separate fixes by type for safe ordering
  const metaFixes = acceptedFixes.filter(f => f.targetField?.startsWith('metadata.'));
  const bodyFixes = acceptedFixes.filter(
    f => f.ruleId.startsWith('LINK-003') || f.ruleId.startsWith('FORMAT-') || f.ruleId === 'LINK-006'
  );
  const imgFixes = acceptedFixes.filter(f => f.targetField?.startsWith('image.'));
  const noteFixes = acceptedFixes.filter(f => f.ruleId === 'NOTE-003');
  const emailChanges = autoAppliedChanges.filter(
    c => c.targetField === 'email.mailto' && c.value
  );
  const hasDoublespaceFix = autoAppliedChanges.some(
    c => c.targetField === 'text.doublespace'
  );

  // Apply metadata patches
  if (metaFixes.length > 0) {
    await applyMetadataFixes(zip, metaFixes);
  }

  // Apply body patches (links, format)
  if (bodyFixes.length > 0 || imgFixes.length > 0) {
    await applyDocumentBodyFixes(zip, [...bodyFixes, ...imgFixes]);
  }

  // Apply auto-applied email mailto patches
  if (emailChanges.length > 0) {
    await applyEmailMailtoFixes(zip, emailChanges.map(c => c.value as string));
  }

  // Apply double-space collapse
  if (hasDoublespaceFix) {
    await applyDoublespaceFix(zip);
  }

  // Apply note fixes (two-file operation)
  if (noteFixes.length > 0) {
    await applyNoteFixes(zip);
  }

  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function applyMetadataFixes(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const coreXmlFile = zip.file('docProps/core.xml');
  if (!coreXmlFile) return;

  const xmlStr = await coreXmlFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  for (const fix of fixes) {
    if (!fix.value || !fix.targetField) continue;

    if (fix.targetField === 'metadata.author') {
      const creator = xmlDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0];
      if (creator) {
        creator.textContent = fix.value;
      }
    } else if (fix.targetField === 'metadata.subject') {
      const subject = xmlDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'subject')[0];
      if (subject) {
        subject.textContent = fix.value;
      }
    } else if (fix.targetField === 'metadata.keywords') {
      const keywords = xmlDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'keywords')[0];
      if (keywords) {
        keywords.textContent = fix.value;
      }
    }
  }

  const serializer = new XMLSerializer();
  zip.file('docProps/core.xml', serializer.serializeToString(xmlDoc));
}

async function applyDocumentBodyFixes(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  for (const fix of fixes) {
    if (!fix.value) continue;

    if (fix.ruleId === 'IMG-001' && fix.targetField?.startsWith('image.docPr.')) {
      // targetField is "image.docPr.{id}" where id is the wp:docPr id attribute.
      // Match by id so we apply alt text to the exact element, not the first
      // element with an empty descr (which would be wrong for multiple missing images).
      const docPrId = fix.targetField.replace('image.docPr.', '');
      const docPrElements = Array.from(xmlDoc.getElementsByTagName('wp:docPr'));
      const target = docPrElements.find(el => el.getAttribute('id') === docPrId);
      if (target) {
        target.setAttribute('descr', fix.value ?? '');
      }
    }

    // LINK-006: retarget internal bookmark anchor
    // targetField: "link.bookmark.{old_anchor}", value: "{new_anchor}"
    if (fix.ruleId === 'LINK-006' && fix.targetField?.startsWith('link.bookmark.')) {
      const oldAnchor = fix.targetField.replace('link.bookmark.', '');
      const newAnchor = fix.value;
      const normalizedNewAnchor = newAnchor.trim().replace(/^#/, '');
      if (!normalizedNewAnchor) {
        continue;
      }
      const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
      for (const el of hyperlinks) {
        if (el.getAttribute('w:anchor') === oldAnchor) {
          el.setAttribute('w:anchor', normalizedNewAnchor);
        }
      }
    }

    // LINK-003: update link text
    if (fix.ruleId === 'LINK-003' && fix.targetField?.startsWith('link.')) {
      // Production implementation: match by relationship ID stored in the issue
    }
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

/**
 * CLEAN-004: Collapse runs of two or more spaces to a single space in body text.
 *
 * Skips (mirroring the HTML-scan exclusions in CLEAN-004.ts):
 *  - <w:t> elements inside table cells (<w:tc>)
 *  - <w:t> elements in heading paragraphs (pStyle starts with "Heading")
 *  - <w:t> elements in code/preformatted paragraphs (pStyle contains "Code",
 *    or equals "Pre" / "Preformatted" / "HTMLPreformatted")
 *
 * Note: double spaces spanning adjacent <w:t> node boundaries are not corrected —
 * this is a known limitation of per-run processing.
 */
async function applyDoublespaceFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const wTElements = Array.from(xmlDoc.getElementsByTagName('w:t'));
  for (const wT of wTElements) {
    const text = wT.textContent ?? '';
    if (!/ {2,}/.test(text)) continue;

    // Skip if inside a table cell
    if (findAncestorByLocalName(wT, 'tc')) continue;

    // Skip if in an excluded paragraph (heading or code-like style)
    const wP = findAncestorByLocalName(wT, 'p');
    if (wP && isExcludedParagraph(wP)) continue;

    wT.textContent = text.replace(/ {2,}/g, ' ');
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

function findAncestorByLocalName(el: Element, localName: string): Element | null {
  let current: Element | null = el.parentElement;
  while (current) {
    if (current.localName === localName) return current;
    current = current.parentElement;
  }
  return null;
}

function isExcludedParagraph(wP: Element): boolean {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return false;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return false;
  const styleVal = pStyle.getAttribute('w:val') ?? '';
  // Headings
  if (styleVal.startsWith('Heading')) return true;
  // Code / preformatted styles
  if (
    styleVal.includes('Code') ||
    styleVal === 'Pre' ||
    styleVal === 'Preformatted' ||
    styleVal === 'HTMLPreformatted'
  ) return true;
  return false;
}

async function applyNoteFixes(_zip: JSZip): Promise<void> {
  // NOTE-003: convert footnotes to endnotes
  // This is handled during rule execution as an auto-applied change
  // The actual XML mutation should be done in NOTE-003 rule
}

/**
 * LINK-008: Wrap plain-text email runs in <w:hyperlink> elements.
 *
 * For each email address:
 *  1. Add a relationship entry to word/_rels/document.xml.rels
 *  2. Find <w:t> elements whose exact text matches the email
 *  3. Wrap the parent <w:r> in a <w:hyperlink r:id="..."> element
 *  4. Ensure the run has <w:rStyle w:val="Hyperlink"/> in its <w:rPr>
 */
async function applyEmailMailtoFixes(zip: JSZip, emails: string[]): Promise<void> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const HYPERLINK_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

  // ── Relationships file ────────────────────────────────────────────────────
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;

  const relsStr = await relsFile.async('string');
  const parser = new DOMParser();
  const relsDoc = parser.parseFromString(relsStr, 'application/xml');
  const relsRoot = relsDoc.documentElement;

  // Find max existing numeric rId to avoid collisions and map existing mailto relationships
  const existingMailtoRelIds: Map<string, string> = new Map();
  const existingIds: number[] = [];
  const existingRelationships = Array.from(
    relsRoot.getElementsByTagNameNS(RELS_NS, 'Relationship')
  );
  for (const el of existingRelationships) {
    const id = el.getAttribute('Id') ?? '';
    const m = id.match(/^rId(\d+)$/);
    if (m?.[1]) {
      existingIds.push(parseInt(m[1], 10));
    }

    const typeAttr = el.getAttribute('Type');
    const targetAttr = el.getAttribute('Target');
    if (
      typeAttr === HYPERLINK_TYPE &&
      targetAttr &&
      targetAttr.startsWith('mailto:')
    ) {
      const email = targetAttr.substring('mailto:'.length);
      if (email && !existingMailtoRelIds.has(email)) {
        existingMailtoRelIds.set(email, id);
      }
    }
  }
  let nextId = Math.max(0, ...existingIds, 0) + 1;

  // Map email → relId for use when patching document.xml
  const emailRelIds: Map<string, string> = new Map();

  for (const email of emails) {
    if (emailRelIds.has(email)) continue; // de-duplicate within this run

    // Reuse existing mailto relationship if present
    const existingRelId = existingMailtoRelIds.get(email);
    if (existingRelId) {
      emailRelIds.set(email, existingRelId);
      continue;
    }

    const relId = `rId${nextId++}`;
    emailRelIds.set(email, relId);

    const rel = relsDoc.createElementNS(RELS_NS, 'Relationship');
    rel.setAttribute('Id', relId);
    rel.setAttribute('Type', HYPERLINK_TYPE);
    rel.setAttribute('Target', `mailto:${email}`);
    rel.setAttribute('TargetMode', 'External');
    relsRoot.appendChild(rel);
  }

  const serializer = new XMLSerializer();
  zip.file(relsPath, serializer.serializeToString(relsDoc));

  // ── Document body ─────────────────────────────────────────────────────────
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  for (const [email, relId] of emailRelIds) {
    // Find <w:t> elements whose trimmed text exactly matches the email
    const wTElements = Array.from(xmlDoc.getElementsByTagName('w:t'));
    for (const wT of wTElements) {
      if ((wT.textContent ?? '').trim() !== email) continue;

      const wR = wT.parentElement;
      if (!wR || wR.localName !== 'r') continue;

      // Skip if already inside a hyperlink
      if (wR.parentElement?.localName === 'hyperlink') continue;

      const wP = wR.parentElement;
      if (!wP) continue;

      // Ensure <w:rPr> has <w:rStyle w:val="Hyperlink"/>
      let rPr = wR.getElementsByTagName('w:rPr')[0];
      if (!rPr) {
        rPr = xmlDoc.createElementNS(W, 'w:rPr');
        wR.insertBefore(rPr, wR.firstChild);
      }
      const existingStyle = rPr.getElementsByTagName('w:rStyle')[0];
      if (!existingStyle) {
        const rStyle = xmlDoc.createElementNS(W, 'w:rStyle');
        rStyle.setAttributeNS(W, 'w:val', 'Hyperlink');
        rPr.insertBefore(rStyle, rPr.firstChild);
      }

      // Create <w:hyperlink r:id="..." w:history="1">
      const hyperlink = xmlDoc.createElementNS(W, 'w:hyperlink');
      hyperlink.setAttributeNS(R, 'r:id', relId);
      hyperlink.setAttributeNS(W, 'w:history', '1');

      // Replace <w:r> with <w:hyperlink> containing <w:r>
      wP.insertBefore(hyperlink, wR);
      hyperlink.appendChild(wR);
    }
  }

  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}
