import JSZip from 'jszip';
import type { AcceptedFix, AutoAppliedChange } from '../types';
import { DGHT_STEP1_ANCHOR } from '../rules/opdiv/CLEAN-007-constants';
import { groupListParagraphs } from './listHelpers';

const BUILD_DOCX_DEBUG =
  (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env?.DEBUG_BUILD_DOCX === 'true';

export async function buildDocx(
  originalArchive: JSZip,
  acceptedFixes: AcceptedFix[],
  autoAppliedChanges: AutoAppliedChange[] = []
): Promise<Blob> {
  // Deep-clone the archive by explicitly copying each file with the appropriate
  // data type.  The prior approach (generateAsync → loadAsync round-trip) silently
  // corrupts or drops binary entries — images, fonts, theme files, and embedded
  // objects — in certain browser environments, producing an output ZIP that is
  // missing those files.  Reading XML parts as strings and binary parts as
  // Uint8Arrays and re-adding them individually avoids that path entirely.
  const zip = new JSZip();
  for (const filename of Object.keys(originalArchive.files)) {
    const entry = originalArchive.files[filename];
    if (!entry || entry.dir) continue;
    const isXml = filename.endsWith('.xml') || filename.endsWith('.rels');
    if (isXml) {
      zip.file(filename, await entry.async('string'));
    } else {
      zip.file(filename, await entry.async('uint8array'));
    }
  }

  // Separate fixes by type for safe ordering
  const metaFixes = acceptedFixes.filter(f => f.targetField?.startsWith('metadata.'));
  const bodyFixes = acceptedFixes.filter(
    f => f.ruleId.startsWith('LINK-003') || f.ruleId.startsWith('FORMAT-') || f.ruleId === 'LINK-006'
  );
  const imgFixes = acceptedFixes.filter(f => f.targetField?.startsWith('image.'));
  const emailChanges = autoAppliedChanges.filter(
    c => c.targetField === 'email.mailto' && c.value
  );
  const hasDoublespaceFix = autoAppliedChanges.some(
    c => c.targetField === 'text.doublespace'
  );
  const hasTaglineRelocate = autoAppliedChanges.some(
    c => c.targetField === 'struct.tagline.relocate'
  );
  const hasTaglineUnquote = autoAppliedChanges.some(
    c => c.targetField === 'text.tagline.unquote'
  );
  const hasRemoveBybHeading = autoAppliedChanges.some(
    c => c.targetField === 'struct.byb.removeheading'
  );
  const hasRemoveDghtScaffolding = autoAppliedChanges.some(
    c => c.targetField === 'struct.dght.removescaffolding'
  );
  const hasRemoveDghtInstructionBoxes = autoAppliedChanges.some(
    c => c.targetField === 'struct.dght.removeinstructionboxes'
  );
  const hasDateCorrection = autoAppliedChanges.some(
    c => c.targetField === 'format.date.correct'
  );
  const hasHeadingLeadingSpaceFix = autoAppliedChanges.some(
    c => c.targetField === 'heading.leadingspace'
  );
  const hasAcceptChanges = autoAppliedChanges.some(
    c => c.targetField === 'doc.acceptchanges'
  );
  const hasListPeriodFix = autoAppliedChanges.some(
    c => c.targetField === 'list.periodfix'
  );
  const hasChecklistFix = autoAppliedChanges.some(
    c => c.targetField === 'checklist.checkbox'
  );
  const hasPdfLabelFix = autoAppliedChanges.some(
    c => c.targetField === 'link.pdf.label'
  );
  const hasAsteriskedBoldFix = autoAppliedChanges.some(
    c => c.targetField === 'text.asterisked.bold'
  );
  const hasTimeCorrection = autoAppliedChanges.some(
    c => c.targetField === 'format.time.correct'
  );
  const hasBoldBulletFix = autoAppliedChanges.some(
    c => c.targetField === 'list.bullet.unbold'
  );
  const hasTrailingPeriodBoldFix = autoAppliedChanges.some(
    c => c.targetField === 'text.trailing.period.unbold'
  );
  const hasPartialHyperlinkFix = autoAppliedChanges.some(
    c => c.targetField === 'link.partial.fix'
  );
  const hasImportantPublicHeadingFix = autoAppliedChanges.some(
    c => c.targetField === 'table.importantpublic.heading'
  );
  const h2TitleCaseChanges = autoAppliedChanges.filter(
    c => c.targetField === 'heading.h2.titlecase' && c.value
  );
  const headingLevelFixes = acceptedFixes.filter(
    f => f.targetField?.startsWith('heading.level.H') && !!f.value
  );
  const headingTextFixes = acceptedFixes.filter(
    f => f.targetField?.startsWith('heading.text.H') && !!f.value
  );
  const autoLinkBookmarkChanges = autoAppliedChanges
    .filter(c => c.ruleId === 'LINK-006' && c.targetField?.startsWith('link.bookmark.') && !!c.value)
    .map(
      c =>
        ({
          issueId: `auto:${c.ruleId}:${c.targetField}`,
          ruleId: c.ruleId,
          targetField: c.targetField,
          value: c.value,
        } as AcceptedFix)
    );

  // Apply metadata patches
  if (metaFixes.length > 0) {
    await applyMetadataFixes(zip, metaFixes);
  }

  // Apply body patches (links, format) plus auto-applied bookmark retargets
  if (bodyFixes.length > 0 || imgFixes.length > 0 || autoLinkBookmarkChanges.length > 0) {
    await applyDocumentBodyFixes(zip, [...bodyFixes, ...imgFixes, ...autoLinkBookmarkChanges]);
  }

  // Apply auto-applied email mailto patches
  if (emailChanges.length > 0) {
    await applyEmailMailtoFixes(zip, emailChanges.map(c => c.value as string));
  }

  // Apply accepted heading level corrections (HEAD-003) — must run before any
  // transform that removes or reorders headings (applyRemoveDghtScaffolding,
  // applyRemoveBeforeYouBeginHeading) so that ordinal-index-based targeting
  // remains aligned with the heading structure check() observed.
  if (headingLevelFixes.length > 0) {
    await applyHeadingLevelCorrections(zip, headingLevelFixes);
  }

  // Apply accepted heading text corrections (HEAD-004)
  if (headingTextFixes.length > 0) {
    await applyHeadingTextCorrections(zip, headingTextFixes);
  }

  // Apply double-space collapse
  if (hasDoublespaceFix) {
    await applyDoublespaceFix(zip);
  }

  // Apply CDC/DGHT editorial scaffolding removal first — must precede tagline
  // relocation so that any tagline paragraph in the scaffolding preamble is
  // discarded rather than relocated into the body of the document.
  if (hasRemoveDghtScaffolding) {
    await applyRemoveDghtScaffolding(zip);
  }

  // Remove DGHT/DGHP instruction box tables (single-cell, BCD6F4 shading,
  // text starting with "DGHT-SPECIFIC INSTRUCTIONS" / "DGHP-SPECIFIC
  // INSTRUCTIONS") — runs after scaffolding removal so boxes in the preamble
  // are not double-processed.
  if (hasRemoveDghtInstructionBoxes) {
    await applyRemoveDghtInstructionBoxes(zip);
  }

  // Apply tagline relocation
  if (hasTaglineRelocate) {
    await applyTaglineRelocation(zip);
  }

  // Strip wrapping quotes from the tagline value (runs after relocation so
  // the tagline is in its final position before its content is modified)
  if (hasTaglineUnquote) {
    await applyTaglineUnquote(zip);
  }

  // Apply "Before You Begin" heading removal
  if (hasRemoveBybHeading) {
    await applyRemoveBeforeYouBeginHeading(zip);
  }

  // Apply date format corrections
  if (hasDateCorrection) {
    await applyDateFormatCorrections(zip);
  }

  // Apply heading leading-space removal
  if (hasHeadingLeadingSpaceFix) {
    await applyHeadingLeadingSpaceFix(zip);
  }

  // Apply H2 title-case corrections (runs after leading-space fix so OOXML
  // text matches the HTML-derived keys stored in the change value)
  if (h2TitleCaseChanges.length > 0) {
    await applyH2TitleCaseFix(zip, h2TitleCaseChanges);
  }

  // Accept tracked changes and remove comments
  if (hasAcceptChanges) {
    await applyAcceptTrackedChangesAndRemoveComments(zip);
  }

  // Add trailing periods to list items for consistency
  if (hasListPeriodFix) {
    await applyListPeriodFix(zip);
  }

  // Normalize application checklist checkboxes
  if (hasChecklistFix) {
    await applyChecklistCheckboxFix(zip);
  }

  // Add [PDF] labels to external PDF links
  if (hasPdfLabelFix) {
    await applyPdfLabelFix(zip);
  }

  // Move partial-word characters that are outside w:hyperlink into it
  if (hasPartialHyperlinkFix) {
    await applyPartialHyperlinkFix(zip);
  }

  // Bold "asterisked ( * )" in Approach / Program logic model sections
  if (hasAsteriskedBoldFix) {
    await applyAsteriskedBoldFix(zip);
  }

  // Apply time format corrections
  if (hasTimeCorrection) {
    await applyTimeFormatCorrections(zip);
  }

  // Remove bold from list item bullet/number characters
  if (hasBoldBulletFix) {
    await applyBoldBulletFix(zip);
  }

  // Remove bold from trailing periods preceded by non-bold text
  if (hasTrailingPeriodBoldFix) {
    await applyTrailingPeriodBoldFix(zip);
  }

  // Strip content controls — unconditional, silent (documented on the Download
  // page; no issue is surfaced to the user and no entry goes in the summary).
  // Runs before TABLE-004 so that tables wrapped in w:sdt are already unwrapped.
  await applyRemoveContentControls(zip);

  // Apply heading style to "Important: public information" in single-cell tables
  if (hasImportantPublicHeadingFix) {
    await applyImportantPublicHeadingFix(zip);
  }

  // Unconditionally enforce STORE compression for [Content_Types].xml and every
  // .rels file before calling generateAsync. The global compression: 'DEFLATE'
  // below would otherwise re-compress any infrastructure file that was loaded
  // from the original archive but not explicitly rewritten by a fix path —
  // producing DEFLATE-compressed infrastructure files that Word for iOS rejects.
  const infraPaths = [
    '[Content_Types].xml',
    ...Object.keys(zip.files).filter(name => name.endsWith('.rels')),
  ];
  for (const infraPath of infraPaths) {
    const infraFile = zip.file(infraPath);
    if (!infraFile) continue;
    zip.file(infraPath, await infraFile.async('arraybuffer'), { compression: 'STORE' });
  }

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Patterns for matching metadata field name prefixes in body paragraphs.
 * Each pattern matches the field name followed by a colon at the start of
 * the paragraph text, handling both the "Metadata X:" long form and the
 * plain "X:" short form.
 *
 * Known variants:
 *  metadata.author   — "Metadata author:" or "Author:"
 *  metadata.subject  — "Metadata subject:" or "Subject:"
 *  metadata.keywords — "Metadata keywords:" or "Keywords:"
 */
const METADATA_FIELD_PATTERNS = {
  'metadata.author':   /^(metadata\s+author|author)\s*:/i,
  'metadata.subject':  /^(metadata\s+subject|subject)\s*:/i,
  'metadata.keywords': /^(metadata\s+keywords|keywords)\s*:/i,
} as const;

type MetadataTargetField = keyof typeof METADATA_FIELD_PATTERNS;

/**
 * Returns true if paraText starts with any recognized field name variant for
 * the given targetField, followed by a colon. Used everywhere the metadata
 * block needs to be located (fixes, tagline relocation, etc.) so that both
 * the long form ("Metadata keywords:") and the short form ("Keywords:") are
 * recognized consistently.
 */
function matchesMetadataField(paraText: string, targetField: MetadataTargetField): boolean {
  return METADATA_FIELD_PATTERNS[targetField].test(paraText.trim());
}

/**
 * Apply accepted metadata fixes to the visible body paragraphs in
 * word/document.xml.
 *
 * Locates the paragraph whose text starts with the corresponding field name
 * prefix (case-insensitive, handles both "Metadata author:" and "Author:"
 * variants) and replaces the text after the colon with the accepted value.
 * The original field name prefix is preserved exactly as written in the
 * document — a paragraph that begins with "Author:" stays "Author:", not
 * "Metadata author:".
 *
 * docProps/core.xml is intentionally not modified.
 */
async function applyMetadataFixes(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));

  for (const fix of fixes) {
    if (!fix.value || !fix.targetField) continue;

    if (!(fix.targetField in METADATA_FIELD_PATTERNS)) continue;
    const targetField = fix.targetField as MetadataTargetField;

    // Find the body paragraph whose text starts with any recognized variant of
    // this field name followed by a colon
    const para = paragraphs.find(p => matchesMetadataField(getParaText(p), targetField));
    if (!para) continue;

    // Extract the prefix exactly as written (preserves "Author:" vs
    // "Metadata author:" etc.) by taking everything up to and including the
    // first colon in the paragraph text
    const paraText = getParaText(para).trim();
    const colonIdx = paraText.indexOf(':');
    const prefix = paraText.slice(0, colonIdx + 1);
    const newText = `${prefix} ${fix.value}`;

    // Collect all <w:t> elements across all runs in this paragraph
    const allWTs = Array.from(para.getElementsByTagName('w:t'));
    if (allWTs.length === 0) continue;

    // Write the full replacement text into the first <w:t>
    const firstWT = allWTs[0]!;
    firstWT.textContent = newText;
    if (newText !== newText.trim()) {
      firstWT.setAttribute('xml:space', 'preserve');
    } else {
      firstWT.removeAttribute('xml:space');
    }

    // Clear all subsequent <w:t> elements so no stale text fragments remain
    for (let i = 1; i < allWTs.length; i++) {
      allWTs[i]!.textContent = '';
    }
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

async function applyDocumentBodyFixes(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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

    // LINK-006: update link display text
    // targetField: "link.text.{anchor}", value: "{new link text}"
    // Trim is used only to validate non-emptiness; the original value is written
    // to OOXML so the user's accepted text (including any intentional spacing) is
    // preserved verbatim.
    if (fix.ruleId === 'LINK-006' && fix.targetField?.startsWith('link.text.')) {
      const anchor = fix.targetField.replace('link.text.', '');
      const newText = fix.value;
      if (anchor && newText?.trim()) {
        const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
        for (const el of hyperlinks) {
          // getAttribute('w:anchor') is the primary read path: jsdom (and some
          // browsers) store namespace-prefixed attributes under their qualified
          // name rather than as namespace-aware attributes, so getAttributeNS
          // returns null.  getAttributeNS is kept as a fallback for environments
          // that store attributes namespace-aware but not under the qualified name.
          const elAnchor = el.getAttribute('w:anchor') ?? el.getAttributeNS(W, 'anchor');
          if (elAnchor !== anchor) continue;

          // Collect only the direct-child <w:r> runs of this hyperlink (bookmarks
          // and other sibling nodes are left untouched).
          const runs = Array.from(el.childNodes).filter(
            (n): n is Element =>
              n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'r'
          );
          if (runs.length === 0) continue;

          // Write the new text into the first run's <w:t>, preserving its
          // <w:rPr> (hyperlink style, bold, etc.).
          const firstRun = runs[0]!;
          const allWTs = Array.from(firstRun.getElementsByTagName('w:t'));
          let wT = allWTs[0];
          if (!wT) {
            wT = xmlDoc.createElementNS(W, 'w:t');
            firstRun.appendChild(wT);
          }
          wT.textContent = newText;
          // xml:space="preserve" is required by the OOXML spec when the text
          // node contains leading or trailing whitespace characters.
          if (newText !== newText.trim()) {
            wT.setAttribute('xml:space', 'preserve');
          } else {
            wT.removeAttribute('xml:space');
          }
          // Remove any additional <w:t> nodes within the same run so the run
          // contains exactly one text node — the accepted replacement text.
          for (let i = 1; i < allWTs.length; i++) {
            allWTs[i]!.parentNode?.removeChild(allWTs[i]!);
          }

          // Remove the remaining runs entirely rather than zeroing their text,
          // so no empty <w:r> elements remain to cause spacing/formatting
          // artifacts in Word.
          for (let i = 1; i < runs.length; i++) {
            el.removeChild(runs[i]!);
          }

          // w:anchor is not changed by the text update — leave the attribute
          // untouched so XMLSerializer emits the original namespace-aware
          // attribute without any extra xmlns declarations.
        }
      }
    }

    // LINK-006: retarget internal bookmark anchor
    // targetField: "link.bookmark.{old_anchor}", value: "{new_anchor}"
    if (fix.ruleId === 'LINK-006' && fix.targetField?.startsWith('link.bookmark.')) {
      const oldAnchor = fix.targetField.replace('link.bookmark.', '');
      const normalizedNewAnchor = (fix.value ?? '').trim().replace(/^#/, '');
      if (normalizedNewAnchor) {
        const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
        for (const el of hyperlinks) {
          const elAnchor = el.getAttribute('w:anchor') ?? el.getAttributeNS(W, 'anchor');
          if (elAnchor === oldAnchor) {
            el.removeAttributeNS(W, 'anchor');
            el.removeAttributeNS(null, 'anchor');
            el.removeAttribute('w:anchor');
            el.setAttributeNS(W, 'w:anchor', normalizedNewAnchor);
          }
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

/**
 * Returns the canonical set of OOXML "story part" paths that carry document
 * body content: the main document, footnotes, endnotes, and any header/footer
 * parts present in the ZIP.
 *
 * Any function that needs to operate across all text-bearing parts should use
 * this helper so the set stays consistent in one place.
 */
function getStoryPartPaths(zip: JSZip): string[] {
  const fixed = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  const headerFooter = Object.keys(zip.files).filter(name =>
    /^word\/(header|footer)\d*\.xml$/.test(name)
  );
  return [...fixed, ...headerFooter];
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

// ─── Shared OOXML helpers ─────────────────────────────────────────────────────

/**
 * Concatenate the text content of all <w:t> descendants of a <w:p> element.
 */
function getParaText(para: Element): string {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const byNS = Array.from(para.getElementsByTagNameNS(W, 't'));
  const byTag = Array.from(para.getElementsByTagName('w:t'));
  const seen = new Set<Element>();
  const nodes: Element[] = [];
  for (const el of [...byNS, ...byTag]) {
    if (!seen.has(el)) { seen.add(el); nodes.push(el); }
  }
  return nodes.map(t => t.textContent ?? '').join('');
}

/**
 * Return true if a <w:p> element has a heading paragraph style
 * (w:pStyle value starts with "Heading").
 */
function isHeadingParagraph(wP: Element): boolean {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return false;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return false;
  return (pStyle.getAttribute('w:val') ?? '').startsWith('Heading');
}

// ─── CLEAN-005: Tagline relocation ───────────────────────────────────────────

/**
 * Move the standalone tagline paragraph to immediately after the keywords
 * paragraph in the document body. The keywords paragraph is matched by
 * either the long form ("Metadata keywords:") or the short form ("Keywords:").
 * Removes any duplicate tagline paragraphs found anywhere in the body.
 *
 * If either the tagline paragraph or the keywords paragraph is not found,
 * this function skips silently.
 */
async function applyTaglineRelocation(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  // Collect direct element children of <w:body>.
  const bodyElements = (): Element[] =>
    Array.from(body.childNodes).filter(
      n => n.nodeType === Node.ELEMENT_NODE
    ) as Element[];

  // Identify all standalone tagline <w:p> elements (direct body children).
  const taglineParagraphs = bodyElements().filter(el => {
    if (el.localName !== 'p') return false;
    const text = getParaText(el).trim();
    return /^tagline\s*:?/i.test(text);
  });

  if (taglineParagraphs.length === 0) return;

  const primary = taglineParagraphs[0]!;

  // Remove all tagline paragraphs (primary and any duplicates) from the body.
  for (const el of taglineParagraphs) {
    body.removeChild(el);
  }

  // Find the keywords paragraph (matches "Metadata keywords:" or "Keywords:")
  // to use as the insertion anchor.
  const updatedChildren = bodyElements();
  const keywordsPara = updatedChildren.find(
    el =>
      el.localName === 'p' &&
      matchesMetadataField(getParaText(el), 'metadata.keywords')
  );

  if (!keywordsPara) return;

  // Insert the tagline immediately after the "Metadata keywords:" paragraph.
  const nextSibling = keywordsPara.nextSibling;
  if (nextSibling) {
    body.insertBefore(primary, nextSibling);
  } else {
    body.appendChild(primary);
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

// ─── CLEAN-014: Strip wrapping quotes from tagline value ─────────────────────

/**
 * Find the tagline paragraph and strip wrapping straight or smart double
 * quotes from its value. Leaves the "Tagline:" prefix and spacing intact.
 * Re-verifies that wrapping quotes are present before modifying so the
 * function is safe to call even if the autoApplied trigger fired spuriously.
 */
async function applyTaglineUnquote(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  const paragraphs = Array.from(body.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'p'
  ) as Element[];

  const taglinePara = paragraphs.find(el => /^tagline\s*:/i.test(getParaText(el).trim()));
  if (!taglinePara) return;

  const fullText = getParaText(taglinePara).trim();
  const colonIdx = fullText.indexOf(':');
  if (colonIdx === -1) return;

  let openingQuoteIdx = colonIdx + 1;
  while (
    openingQuoteIdx < fullText.length &&
    /\s/.test(fullText.charAt(openingQuoteIdx))
  ) {
    openingQuoteIdx++;
  }

  let closingQuoteIdx = fullText.length - 1;
  while (
    closingQuoteIdx > openingQuoteIdx &&
    /\s/.test(fullText.charAt(closingQuoteIdx))
  ) {
    closingQuoteIdx--;
  }

  if (openingQuoteIdx >= closingQuoteIdx) return;

  const openingQuote = fullText.charAt(openingQuoteIdx);
  const closingQuote = fullText.charAt(closingQuoteIdx);
  const isOuterQuotePair =
    (openingQuote === '"' && closingQuote === '"') ||
    (openingQuote === '\'' && closingQuote === '\'') ||
    (openingQuote === '“' && closingQuote === '”') ||
    (openingQuote === '‘' && closingQuote === '’');
  if (!isOuterQuotePair) return;

  // Strip only the outer quote pair (straight or smart), preserving all other spacing.
  const newText =
    fullText.slice(0, openingQuoteIdx) +
    fullText.slice(openingQuoteIdx + 1, closingQuoteIdx) +
    fullText.slice(closingQuoteIdx + 1);
  const allWTs = Array.from(taglinePara.getElementsByTagName('w:t'));
  if (allWTs.length === 0) return;

  allWTs[0]!.textContent = newText;
  if (newText !== newText.trim()) {
    allWTs[0]!.setAttribute('xml:space', 'preserve');
  } else {
    allWTs[0]!.removeAttribute('xml:space');
  }
  for (let i = 1; i < allWTs.length; i++) {
    allWTs[i]!.textContent = '';
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

// ─── CLEAN-006: Remove "Before You Begin" heading ────────────────────────────

/**
 * Remove any heading-style <w:p> elements whose text is exactly
 * "Before You Begin" (case-insensitive, whitespace-normalised).
 * Content following the heading is left intact.
 */
async function applyRemoveBeforeYouBeginHeading(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  const toRemove: Element[] = [];

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (el.localName !== 'p') continue;
    if (!isHeadingParagraph(el)) continue;

    const text = getParaText(el).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text === 'before you begin') {
      toRemove.push(el);
    }
  }

  if (toRemove.length === 0) return;

  for (const el of toRemove) {
    body.removeChild(el);
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

// ─── CLEAN-007: Remove CDC/DGHT editorial scaffolding ────────────────────────

/**
 * Remove all body-level elements (paragraphs and tables) that appear before
 * the first "Step 1: Review the Opportunity" heading paragraph. This strips
 * the editorial preamble (color-coding instructions, template notes,
 * content-guide reference table) that CDC/DGHT templates prepend before the
 * substantive NOFO content.
 *
 * The cut point is the first <w:p> with a heading style whose trimmed,
 * lowercased text exactly matches DGHT_STEP1_ANCHOR. If that heading is not
 * found, nothing is removed.
 */
async function applyRemoveDghtScaffolding(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  const bodyChildren = Array.from(body.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE
  ) as Element[];

  // Locate the first heading paragraph whose text exactly matches the anchor
  const step1Index = bodyChildren.findIndex(el => {
    if (el.localName !== 'p') return false;
    if (!isHeadingParagraph(el)) return false;
    return getParaText(el).trim().toLowerCase() === DGHT_STEP1_ANCHOR;
  });

  // Safety: if the anchor heading is not found, do not remove anything
  if (step1Index === -1) return;

  // Remove only body-level paragraphs and tables that precede the Step 1
  // heading; preserve structural nodes such as w:sectPr.
  for (const el of bodyChildren.slice(0, step1Index)) {
    if (el.localName === 'p' || el.localName === 'tbl') {
      body.removeChild(el);
    }
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

// ─── CLEAN-007 (instruction boxes): Remove DGHT/DGHP instruction box tables ──

/**
 * Remove all w:tbl elements from word/document.xml that match the DGHT/DGHP
 * instruction box pattern:
 *   1. Exactly one w:tc element in the table
 *   2. The cell has a w:shd element with w:fill="BCD6F4" (case-insensitive)
 *   3. The concatenated cell text starts with "DGHT-SPECIFIC INSTRUCTIONS" or
 *      "DGHP-SPECIFIC INSTRUCTIONS" (case-insensitive, after NBSP normalisation
 *      and trimming)
 */
async function applyRemoveDghtInstructionBoxes(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const lower = xmlStr.toLowerCase();
  if (!lower.includes('bcd6f4') || !lower.includes('specific instructions')) return;

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  let changed = false;
  for (const tbl of Array.from(xmlDoc.getElementsByTagName('w:tbl'))) {
    if (isInstructionBoxTbl(tbl)) {
      tbl.parentNode?.removeChild(tbl);
      changed = true;
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

function isInstructionBoxTbl(tbl: Element): boolean {
  const cells = Array.from(tbl.getElementsByTagName('w:tc'));
  if (cells.length !== 1) return false;

  const cell = cells[0]!;

  const shd = cell.getElementsByTagName('w:shd')[0];
  if (!shd) return false;
  if ((shd.getAttribute('w:fill') ?? '').toLowerCase() !== 'bcd6f4') return false;

  const cellText = Array.from(cell.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
  return (
    cellText.startsWith('dght-specific instructions') ||
    cellText.startsWith('dghp-specific instructions')
  );
}

// ─── CLEAN-008: Remove leading spaces from heading text ──────────────────────

/**
 * Strip leading space characters from the text content of all heading-style
 * paragraphs in word/document.xml.
 *
 * Walks through the <w:t> elements of each heading paragraph from front to
 * back, removing leading spaces from each text node until a non-space
 * character is reached. This handles the uncommon case where the leading
 * spaces span more than one adjacent <w:t> run.
 *
 * Only removes space characters (U+0020). Trailing spaces and internal spaces
 * are left intact. The xml:space="preserve" attribute is removed from any
 * text node that no longer contains leading or trailing whitespace after the
 * fix is applied.
 *
 * After all heading paragraphs are processed, any w:hyperlink elements whose
 * w:anchor value matched the old (leading-underscore) slug are updated to the
 * new (clean) slug in a second loop over hyperlinks within the same parsed XML
 * document, so no additional parse/serialize pass is required.
 */
async function applyHeadingLeadingSpaceFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  if (BUILD_DOCX_DEBUG) {
    console.log('[CLEAN-008] applyHeadingLeadingSpaceFix: starting');
    console.log('[CLEAN-008] Raw XML snippet (first 500 chars):', xmlStr.slice(0, 500));
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const dbg = (...args: Parameters<typeof console.log>) => {
    if (BUILD_DOCX_DEBUG) console.log(...args);
  };

  const paragraphsByNS = Array.from(xmlDoc.getElementsByTagNameNS(W, 'p'));
  const paragraphsByTag = Array.from(xmlDoc.getElementsByTagName('w:p'));
  const seenP = new Set<Element>();
  const paragraphs: Element[] = [];
  for (const el of [...paragraphsByNS, ...paragraphsByTag]) {
    if (!seenP.has(el)) { seenP.add(el); paragraphs.push(el); }
  }
  dbg(`[CLEAN-008] Total w:p elements found: ${paragraphs.length}`);
  let changed = false;
  // Maps old anchor slug → new anchor slug for every heading whose leading
  // space was removed.  Anchor slugs are the heading text with spaces replaced
  // by underscores — a leading space becomes a leading underscore.
  const anchorRemap = new Map<string, string>();

  for (const wP of paragraphs) {
    if (!isHeadingParagraph(wP)) continue;

    const allWTsByNS = Array.from(wP.getElementsByTagNameNS(W, 't'));
    const allWTsByTag = Array.from(wP.getElementsByTagName('w:t'));
    const seenT = new Set<Element>();
    const allWTs: Element[] = [];
    for (const el of [...allWTsByNS, ...allWTsByTag]) {
      if (!seenT.has(el)) { seenT.add(el); allWTs.push(el); }
    }
    if (allWTs.length === 0) continue;

    // Only process paragraphs whose full text starts with a space
    const paraText = getParaText(wP);
    if (paraText.length === 0 || paraText[0] !== ' ') continue;

    dbg(`[CLEAN-008] Found heading with leading space: "${paraText}"`);
    const oldAnchor = paraText.replace(/ /g, '_');
    dbg(`[CLEAN-008]   oldAnchor = "${oldAnchor}"`);

    // Walk <w:t> nodes from the front, stripping leading spaces until we hit
    // content. This correctly handles leading spaces spread across multiple runs.
    let stillTrimming = true;
    for (const wT of allWTs) {
      if (!stillTrimming) break;
      const text = wT.textContent ?? '';
      if (text.length === 0) continue;

      const trimmed = text.replace(/^ +/, '');
      if (trimmed === text) {
        // No leading spaces in this run — stop trimming
        stillTrimming = false;
        continue;
      }

      wT.textContent = trimmed;
      changed = true;

      if (trimmed.length === 0) {
        // Entire run was spaces — clear xml:space and continue to next run
        wT.removeAttribute('xml:space');
      } else {
        // Remaining content after trimming — remove preserve attr if unneeded
        if (trimmed === trimmed.trim()) {
          wT.removeAttribute('xml:space');
        }
        stillTrimming = false;
      }
    }

    // Record the anchor remapping now that the paragraph text has been updated.
    const newAnchor = getParaText(wP).replace(/ /g, '_');
    dbg(`[CLEAN-008]   newAnchor after fix = "${newAnchor}"`);
    if (newAnchor !== oldAnchor) {
      anchorRemap.set(oldAnchor, newAnchor);
      dbg(`[CLEAN-008]   Remap added: "${oldAnchor}" → "${newAnchor}"`);
    } else {
      dbg(`[CLEAN-008]   WARNING: oldAnchor === newAnchor ("${oldAnchor}"), no remap added`);
    }
  }

  dbg(`[CLEAN-008] anchorRemap size: ${anchorRemap.size}`);
  if (anchorRemap.size > 0) {
    dbg(`[CLEAN-008] anchorRemap entries:`, JSON.stringify([...anchorRemap.entries()]));
  }

  // Rewrite internal hyperlinks whose w:anchor referenced a heading that had
  // its leading space removed.  The anchor slug changes in lock-step with the
  // heading text; without this update the link would become a broken reference.
  //
  // Two-part update required:
  //  1. w:hyperlink w:anchor — the navigation target stored on the link element.
  //  2. w:bookmarkStart w:name — the bookmark Word resolves the anchor against.
  //     Updating the hyperlink without also updating the bookmark leaves the link
  //     pointing to a non-existent target, so the link is broken in Word.
  //
  // Three-layer attribute read to handle all serialization states:
  //  a. getAttribute('w:anchor') — primary: jsdom (and some browsers) store
  //     namespace-prefixed attributes under their qualified name, so getAttributeNS
  //     returns null even though the attribute is present.
  //  b. getAttributeNS(W, 'anchor') — fallback for namespace-aware DOM environments
  //     where the attribute is stored under the namespace URI, not the qualified name.
  //  c. getAttribute('anchor') — last resort for the uncommon case where a prior
  //     XMLSerializer pass stripped the namespace prefix from the attribute.
  //
  // getElementsByTagName('w:hyperlink') is used rather than getElementsByTagNameNS
  // because jsdom's XMLSerializer does not remap the 'w:' prefix, so the qualified
  // tag name lookup is reliable and avoids the complexity of the NS variant.
  if (anchorRemap.size > 0) {
    const allHyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    dbg(`[CLEAN-008] Scanning ${allHyperlinks.length} w:hyperlink elements for anchor update`);
    for (const link of allHyperlinks) {
      const anchorQual = link.getAttribute('w:anchor');
      const anchorNS = link.getAttributeNS(W, 'anchor');
      const anchorPlain = link.getAttribute('anchor');
      const anchor = anchorQual ?? anchorNS ?? anchorPlain;
      const matched = anchor ? anchorRemap.has(anchor) : false;
      dbg(
        `[CLEAN-008]   hyperlink: qualified="${anchorQual}", getAttributeNS="${anchorNS}", plain="${anchorPlain}"` +
        `, combined="${anchor}", inRemap=${matched}`
      );
      if (anchor && matched) {
        const newVal = anchorRemap.get(anchor)!;
        dbg(`[CLEAN-008]     → Updating anchor "${anchor}" to "${newVal}"`);
        link.removeAttribute('anchor');
        link.setAttributeNS(W, 'w:anchor', newVal);
      }
    }

    const allBookmarks = Array.from(xmlDoc.getElementsByTagName('w:bookmarkStart'));
    dbg(`[CLEAN-008] Scanning ${allBookmarks.length} w:bookmarkStart elements for name update`);
    for (const bm of allBookmarks) {
      const nameQual = bm.getAttribute('w:name');
      const nameNS = bm.getAttributeNS(W, 'name');
      const namePlain = bm.getAttribute('name');
      const name = nameQual ?? nameNS ?? namePlain;
      const matched = name ? anchorRemap.has(name) : false;
      dbg(
        `[CLEAN-008]   bookmark: qualified="${nameQual}", getAttributeNS="${nameNS}", plain="${namePlain}"` +
        `, combined="${name}", inRemap=${matched}`
      );
      if (name && matched) {
        const newVal = anchorRemap.get(name)!;
        dbg(`[CLEAN-008]     → Updating bookmark name "${name}" to "${newVal}"`);
        bm.removeAttribute('name');
        bm.setAttributeNS(W, 'w:name', newVal);
      }
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    const outXml = serializer.serializeToString(xmlDoc);
    dbg('[CLEAN-008] Serialized output snippet (first 800 chars):', outXml.slice(0, 800));
    zip.file('word/document.xml', outXml);
  } else {
    dbg('[CLEAN-008] No heading text changes detected; file not rewritten');
  }
}

// ─── HEAD-001: H2 title-case auto-fix ────────────────────────────────────────

/**
 * Return the numeric heading level of a <w:p> element (1–6), or 0 if the
 * paragraph is not a heading. Matches both "Heading2" and "Heading 2" styles.
 */
function getHeadingLevel(wP: Element): number {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return 0;
  const val = pStyle.getAttribute('w:val') ?? '';
  const m = val.match(/^Heading\s*(\d+)$/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

/**
 * HEAD-001: Retarget H2 heading paragraphs that were detected as sentence case
 * to the corrected title-case text.
 *
 * Each AutoAppliedChange carries a JSON-encoded array of {old, new} pairs.
 * For each Heading 2 paragraph whose concatenated text matches an "old" value,
 * the correction is applied character-by-character across the paragraph's
 * <w:t> runs. Because title case only uppercases some letters (never inserts,
 * removes, or reorders characters), the character positions are preserved
 * exactly — a simple positional diff is sufficient.
 */
async function applyH2TitleCaseFix(zip: JSZip, changes: AutoAppliedChange[]): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  // Build old → new lookup from all change entries
  const fixMap = new Map<string, string>();
  for (const change of changes) {
    try {
      const parsed = JSON.parse(change.value!);
      if (!Array.isArray(parsed)) continue;
      for (const pair of parsed) {
        if (
          pair !== null &&
          typeof pair === 'object' &&
          typeof pair.old === 'string' &&
          typeof pair.new === 'string'
        ) {
          fixMap.set(pair.old, pair.new);
        }
      }
    } catch {
      // Malformed JSON — skip entry so the rest of the download still succeeds
      continue;
    }
  }
  if (fixMap.size === 0) return;

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  let changed = false;

  for (const wP of paragraphs) {
    if (getHeadingLevel(wP) !== 2) continue;

    const paraText = getParaText(wP);
    const corrected = fixMap.get(paraText);
    if (!corrected || corrected === paraText) continue;

    const wTElements = Array.from(wP.getElementsByTagName('w:t'));
    if (wTElements.length === 0) continue;

    if (corrected.length !== paraText.length) {
      // Fall back to a full-run replacement when the corrected text no longer
      // aligns positionally with the original paragraph text. Preserve the
      // existing run structure by filling each run with a sequential slice of
      // the corrected text and placing any remainder in the last run.
      let remaining = corrected;
      for (let i = 0; i < wTElements.length; i++) {
        const wT = wTElements[i];
        if (!wT) continue;
        const originalText = wT.textContent ?? '';
        const isLastRun = i === wTElements.length - 1;
        const nextText = isLastRun
          ? remaining
          : remaining.slice(0, originalText.length);
        wT.textContent = nextText;
        remaining = isLastRun ? '' : remaining.slice(originalText.length);
      }
      changed = true;
      continue;
    }

    // Apply character-by-character case changes across <w:t> elements.
    // Title case only changes some lowercase letters to uppercase, so every
    // character position in corrected[] aligns with the same position in
    // the original paraText. We walk each run and patch diverging positions.
    let pos = 0;
    for (const wT of wTElements) {
      if (!wT) continue;
      const text = wT.textContent ?? '';
      const chars = text.split('');
      let runModified = false;
      for (let i = 0; i < chars.length; i++) {
        const globalPos = pos + i;
        if (globalPos < corrected.length && chars[i] !== corrected[globalPos]) {
          chars[i] = corrected[globalPos]!;
          runModified = true;
        }
      }
      if (runModified) {
        wT.textContent = chars.join('');
      }
      pos += text.length;
    }
    changed = true;
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── HEAD-003: Heading level corrections ─────────────────────────────────────

/**
 * HEAD-003: Change the heading level (w:pStyle) of paragraphs accepted by the
 * user.
 *
 * Each AcceptedFix carries:
 *   targetField: "heading.level.H{fromLevel}.{headingIndex}::{headingText}"
 *   value:       the confirmed target level as a string (e.g. "2")
 *
 * headingIndex is the 0-based ordinal position of the paragraph among all
 * heading paragraphs in document order — this uniquely identifies the target
 * even when multiple headings share the same text.
 *
 * This function must be called before any transform that removes or reorders
 * heading paragraphs so that headingCount stays aligned with the indices that
 * check() encoded. As a secondary guard, the paragraph text is verified
 * against the encoded headingText before the style change is applied.
 *
 * The patch replaces the trailing digit(s) of the existing w:pStyle w:val,
 * preserving whether the original used "Heading1" or "Heading 1" format.
 */
async function applyHeadingLevelCorrections(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  interface LevelFix { from: number; to: number; text: string }
  const fixesByIndex = new Map<number, LevelFix>();

  for (const fix of fixes) {
    if (!fix.targetField || !fix.value) continue;
    // Format: "heading.level.H{fromLevel}.{headingIndex}::{headingText}"
    const encoded = fix.targetField.replace('heading.level.H', '');
    const dotIdx = encoded.indexOf('.');
    if (dotIdx === -1) continue;
    const fromLevel = parseInt(encoded.slice(0, dotIdx), 10);
    const rest = encoded.slice(dotIdx + 1);
    const sepIdx = rest.indexOf('::');
    if (sepIdx === -1) continue;
    const headingIndex = parseInt(rest.slice(0, sepIdx), 10);
    const headingText = rest.slice(sepIdx + 2);
    const toLevel = parseInt(fix.value, 10);
    if (isNaN(fromLevel) || isNaN(headingIndex) || isNaN(toLevel) || toLevel < 1 || toLevel > 6) continue;
    fixesByIndex.set(headingIndex, { from: fromLevel, to: toLevel, text: headingText });
  }

  if (fixesByIndex.size === 0) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  let headingCount = 0;
  let changed = false;

  for (const wP of paragraphs) {
    const level = getHeadingLevel(wP);
    if (level === 0) continue;

    const currentIndex = headingCount++;
    const fix = fixesByIndex.get(currentIndex);
    if (!fix || fix.from !== level) continue;

    // Text guard: skip if the paragraph at this index doesn't match what
    // check() encoded — defence against index drift from unexpected transforms.
    if (getParaText(wP).trim() !== fix.text) continue;

    const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
    if (!pPr) continue;
    const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
    if (!pStyle) continue;

    const originalVal = pStyle.getAttribute('w:val') ?? pStyle.getAttributeNS(W, 'val') ?? '';
    const newVal = originalVal.replace(/\d+$/, String(fix.to));
    pStyle.setAttributeNS(W, 'w:val', newVal);
    changed = true;
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── HEAD-004: Update heading text while preserving level ────────────────────

/**
 * HEAD-004: Replace the text of a heading paragraph with a user-supplied
 * shorter version while leaving the paragraph style (Heading3, Heading4, …)
 * and all run formatting intact.
 *
 * Each AcceptedFix carries:
 *   targetField: "heading.text.H{level}.{headingIndex}::{originalText}"
 *   value:       the replacement heading text entered by the user
 *
 * headingIndex is the 0-based ordinal among ALL heading paragraphs in document
 * order (same convention as HEAD-003). Fixes whose value is identical to the
 * original text are skipped — no-op if the user accepted without editing.
 *
 * Only w:t text content is updated. w:pStyle, w:rPr, and all other formatting
 * elements are not touched.
 */
async function applyHeadingTextCorrections(zip: JSZip, fixes: AcceptedFix[]): Promise<void> {
  const fixesByIndex = new Map<number, string>();

  for (const fix of fixes) {
    if (!fix.targetField || !fix.value) continue;
    // Format: "heading.text.H{level}.{headingIndex}::{originalText}"
    const encoded = fix.targetField.replace('heading.text.H', '');
    const dotIdx = encoded.indexOf('.');
    if (dotIdx === -1) continue;
    const level = parseInt(encoded.slice(0, dotIdx), 10);
    const rest = encoded.slice(dotIdx + 1);
    const sepIdx = rest.indexOf('::');
    if (sepIdx === -1) continue;
    const headingIndex = parseInt(rest.slice(0, sepIdx), 10);
    const originalText = rest.slice(sepIdx + 2);
    if (isNaN(level) || isNaN(headingIndex)) continue;
    // Skip if value is unchanged — user accepted without editing
    if (fix.value.trim() === originalText.trim()) continue;
    fixesByIndex.set(headingIndex, fix.value.trim());
  }

  if (fixesByIndex.size === 0) return;

  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  let headingCount = 0;
  let changed = false;

  for (const wP of paragraphs) {
    const level = getHeadingLevel(wP);
    if (level === 0) continue;

    const currentIndex = headingCount++;
    const fix = fixesByIndex.get(currentIndex);
    if (fix === undefined) continue;

    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const allWTs = Array.from(wP.getElementsByTagNameNS(W_NS, 't'));
    if (allWTs.length === 0) {
      allWTs.push(...Array.from(wP.getElementsByTagName('w:t')));
    }
    if (allWTs.length === 0) continue;

    allWTs[0]!.textContent = fix;
    allWTs[0]!.removeAttribute('xml:space');
    for (let i = 1; i < allWTs.length; i++) {
      allWTs[i]!.textContent = '';
    }
    changed = true;
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── FORMAT-002: Date format corrections ─────────────────────────────────────

const DATE_MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Standard abbreviations — Sept before Sep so the longer form is preferred in alternation.
const DATE_MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sept', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const DATE_MONTH_NAME_MAP: Record<string, string> = {
  january: 'January', february: 'February', march: 'March', april: 'April',
  may: 'May', june: 'June', july: 'July', august: 'August',
  september: 'September', october: 'October', november: 'November', december: 'December',
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  jun: 'June', jul: 'July', aug: 'August', sep: 'September', sept: 'September',
  oct: 'October', nov: 'November', dec: 'December',
};

const DATE_MONTH_ALT = [...DATE_MONTHS_FULL, ...DATE_MONTHS_ABBR].join('|');

/**
 * Reformat non-standard dates within a single text string.
 * Returns the corrected string (unchanged if no non-standard dates found).
 *
 * Patterns corrected:
 *  A. YYYY-MM-DD                                           →  Month D, YYYY
 *  B. MM/DD/YYYY (4-digit year only)                      →  Month D, YYYY
 *  D. Month-style dates (any combination of the below)    →  Month D, YYYY
 *       - abbreviated month (Jan, Jan., etc.)
 *       - ordinal day suffix (1st, 2nd, 3rd, 16th, etc.)
 *       - leading-zero day (01–09)
 *       - missing comma between day and year
 *
 * MM/DD/YY (2-digit year) is intentionally not corrected — there is no
 * reliable way to determine the correct century.
 */
function applyDateFormatsToText(text: string): string {
  let result = text;

  // Pattern A: YYYY-MM-DD
  result = result.replace(
    /\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g,
    (_match, year, month, day) => {
      const monthName = DATE_MONTHS_FULL[parseInt(month, 10) - 1] ?? month;
      return `${monthName} ${parseInt(day, 10)}, ${year}`;
    }
  );

  // Pattern B: MM/DD/YYYY (4-digit year only — 2-digit years are not corrected
  // because there is no reliable way to determine the correct century).
  result = result.replace(
    /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\b/g,
    (_match, month, day, year) => {
      const monthName = DATE_MONTHS_FULL[parseInt(month, 10) - 1] ?? month;
      return `${monthName} ${parseInt(day, 10)}, ${year}`;
    }
  );

  // Pattern D: Month-style dates — handles abbreviated names, ordinal suffixes,
  // leading-zero days, and missing commas in a single unified pass.
  result = result.replace(
    new RegExp(
      `\\b(${DATE_MONTH_ALT})(\\.?)\\s+(0?[1-9]|[12]\\d|3[01])((?:st|nd|rd|th)?)(?:,\\s*|\\s+)(\\d{4})\\b`,
      'g'
    ),
    (_match, month, _abbPeriod, day, _ordinal, year) => {
      const fullMonth = DATE_MONTH_NAME_MAP[month.toLowerCase()] ?? month;
      return `${fullMonth} ${parseInt(day, 10)}, ${year}`;
    }
  );

  return result;
}

/**
 * Scan all <w:t> elements in body paragraphs and table cells, and reformat
 * any non-standard dates in their text content. Excludes headings and
 * code/preformatted paragraphs via isExcludedParagraph().
 */
async function applyDateFormatCorrections(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const wTElements = Array.from(xmlDoc.getElementsByTagName('w:t'));
  let changed = false;

  for (const wT of wTElements) {
    const text = wT.textContent ?? '';
    if (!text) continue;

    // Skip heading and code/preformatted paragraphs.
    const wP = findAncestorByLocalName(wT, 'p');
    if (wP && isExcludedParagraph(wP)) continue;

    const corrected = applyDateFormatsToText(text);
    if (corrected !== text) {
      wT.textContent = corrected;
      changed = true;
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

/**
 * LINK-008: Wrap plain-text email runs in <w:hyperlink> elements.
 *
 * For each email address:
 *  1. Add a relationship entry to word/_rels/document.xml.rels
 *  2. Find <w:t> elements whose text contains the email address
 *  3a. If the entire run text is the email, wrap the <w:r> in <w:hyperlink>
 *  3b. If the email is embedded in a longer run, split the run into
 *      before-text / hyperlinked-email / after-text segments
 *  4. The email run carries <w:rStyle w:val="Hyperlink"/> in its <w:rPr>
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
  zip.file(relsPath, serializer.serializeToString(relsDoc), { compression: 'STORE' });

  // ── Document body ─────────────────────────────────────────────────────────
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  for (const [email, relId] of emailRelIds) {
    const wTElements = Array.from(xmlDoc.getElementsByTagName('w:t'));
    for (const wT of wTElements) {
      const text = wT.textContent ?? '';
      const emailIdx = text.indexOf(email);
      if (emailIdx === -1) continue;

      const wR = wT.parentElement;
      if (!wR || wR.localName !== 'r') continue;

      // Skip if already inside a hyperlink
      if (wR.parentElement?.localName === 'hyperlink') continue;

      const wP = wR.parentElement;
      if (!wP) continue;

      const before = text.slice(0, emailIdx);
      const after = text.slice(emailIdx + email.length);
      const rPr = Array.from(wR.childNodes).find(
        n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'rPr'
      ) as Element | undefined;

      const hyperlink = xmlDoc.createElementNS(W, 'w:hyperlink');
      hyperlink.setAttributeNS(R, 'r:id', relId);
      hyperlink.setAttributeNS(W, 'w:history', '1');
      hyperlink.appendChild(l8MakeEmailRun(xmlDoc, W, rPr ?? null, email));

      if (before === '' && after === '') {
        // Whole run is exactly the email: swap it out
        wP.insertBefore(hyperlink, wR);
        wP.removeChild(wR);
      } else {
        // Email is embedded in a longer run (including whitespace-only surroundings):
        // split into before / hyperlink / after so surrounding text is preserved
        if (before !== '') {
          wP.insertBefore(l8MakeTextRun(xmlDoc, W, rPr ?? null, before), wR);
        }
        wP.insertBefore(hyperlink, wR);
        if (after !== '') {
          wP.insertBefore(l8MakeTextRun(xmlDoc, W, rPr ?? null, after), wR);
        }
        wP.removeChild(wR);
      }
    }
  }

  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

/** Create a <w:r> for the email address itself, with w:rStyle w:val="Hyperlink". */
function l8MakeEmailRun(xmlDoc: Document, W: string, rPr: Element | null, email: string): Element {
  const run = xmlDoc.createElementNS(W, 'w:r');
  const newRPr: Element = rPr
    ? (rPr.cloneNode(true) as Element)
    : xmlDoc.createElementNS(W, 'w:rPr');
  const existingStyle = Array.from(newRPr.childNodes).find(
    n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'rStyle'
  ) as Element | undefined;
  if (existingStyle) newRPr.removeChild(existingStyle);
  const rStyle = xmlDoc.createElementNS(W, 'w:rStyle');
  rStyle.setAttributeNS(W, 'w:val', 'Hyperlink');
  newRPr.insertBefore(rStyle, newRPr.firstChild);
  run.appendChild(newRPr);
  const wT = xmlDoc.createElementNS(W, 'w:t');
  wT.textContent = email;
  run.appendChild(wT);
  return run;
}

/** Create a <w:r> for a plain-text fragment, cloning the source run's rPr. */
function l8MakeTextRun(xmlDoc: Document, W: string, rPr: Element | null, text: string): Element {
  const run = xmlDoc.createElementNS(W, 'w:r');
  if (rPr) run.appendChild(rPr.cloneNode(true));
  const wT = xmlDoc.createElementNS(W, 'w:t');
  wT.textContent = text;
  if (text !== text.trim()) wT.setAttribute('xml:space', 'preserve');
  run.appendChild(wT);
  return run;
}

// ─── CLEAN-009: Accept tracked changes and remove comments ───────────────────

/**
 * Mutate an already-parsed XML document in place: accept all tracked changes
 * and remove all comment annotations.
 *
 *   w:ins, w:moveTo   → unwrap (keep children, remove the wrapper element)
 *   w:del, w:moveFrom → remove entirely (discard content)
 *   w:rPrChange, w:pPrChange, w:sectPrChange, w:tblPrChange
 *                     → remove entirely (formatting change records)
 *   w:commentRangeStart, w:commentRangeEnd → removed
 *   w:r containing w:commentReference      → entire run removed
 *
 * Returns true if any modifications were made.
 */
function applyTrackedChangesAndCommentsToXmlDoc(xmlDoc: Document): boolean {
  const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
  let changed = false;

  for (const el of allElements) {
    if (!el.parentNode) continue;

    const name = el.localName;

    // ── Remove entirely (discard element + all descendants) ────────────────
    if (
      name === 'del' ||
      name === 'moveFrom' ||
      name === 'rPrChange' ||
      name === 'pPrChange' ||
      name === 'sectPrChange' ||
      name === 'tblPrChange'
    ) {
      el.parentNode.removeChild(el);
      changed = true;
      continue;
    }

    // ── Unwrap (keep children, remove the tracked-change wrapper) ──────────
    if (name === 'ins' || name === 'moveTo') {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      changed = true;
      continue;
    }

    // ── Comment range markers ──────────────────────────────────────────────
    if (name === 'commentRangeStart' || name === 'commentRangeEnd') {
      el.parentNode.removeChild(el);
      changed = true;
      continue;
    }

    // ── Comment reference runs: remove the enclosing <w:r> ────────────────
    if (name === 'commentReference') {
      let run: Element | null = el.parentElement;
      while (run && run.localName !== 'r') {
        run = run.parentElement;
      }
      if (run?.parentNode) {
        run.parentNode.removeChild(run);
      } else {
        el.parentNode?.removeChild(el);
      }
      changed = true;
    }
  }

  return changed;
}

/**
 * Accept all tracked changes and remove all comment annotations from the
 * cloned DOCX archive. Processes document.xml, footnotes.xml, endnotes.xml,
 * and any header/footer parts found in the ZIP. Note: the rule (CLEAN-009)
 * only detects tracked changes in document.xml, footnotes.xml, and
 * endnotes.xml — changes that exist exclusively in headers/footers will still
 * be cleaned here if the rule triggered on any other part.
 *
 * ZIP-level cleanup:
 *   word/comments.xml           → removed if present
 *   word/commentsExtended.xml   → removed if present
 *   word/_rels/document.xml.rels → relationship entries for comments files removed
 */
async function applyAcceptTrackedChangesAndRemoveComments(zip: JSZip): Promise<void> {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  for (const path of getStoryPartPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlStr = await file.async('string');
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    const changed = applyTrackedChangesAndCommentsToXmlDoc(xmlDoc);
    if (changed) {
      zip.file(path, serializer.serializeToString(xmlDoc));
    }
  }

  // ── Remove comments files from the ZIP ────────────────────────────────────
  if (zip.file('word/comments.xml')) {
    zip.remove('word/comments.xml');
  }
  if (zip.file('word/commentsExtended.xml')) {
    zip.remove('word/commentsExtended.xml');
  }

  // ── Remove stale content type overrides for deleted comment parts ─────────
  const contentTypesPath = '[Content_Types].xml';
  const contentTypesFile = zip.file(contentTypesPath);
  if (contentTypesFile) {
    const contentTypesStr = await contentTypesFile.async('string');
    const contentTypesDoc = parser.parseFromString(contentTypesStr, 'application/xml');
    const TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
    const commentPartNames = new Set([
      '/word/comments.xml',
      '/word/commentsExtended.xml',
    ]);

    const overridesToRemove = Array.from(
      contentTypesDoc.getElementsByTagNameNS(TYPES_NS, 'Override')
    ).filter(el => {
      const partName = el.getAttribute('PartName') ?? '';
      return commentPartNames.has(partName);
    });

    if (overridesToRemove.length > 0) {
      for (const el of overridesToRemove) {
        el.parentNode?.removeChild(el);
      }
      zip.file(contentTypesPath, serializer.serializeToString(contentTypesDoc), { compression: 'STORE' });
    }
  }
  // ── Clean comment relationship entries ────────────────────────────────────
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;

  const relsStr = await relsFile.async('string');
  const relsDoc = parser.parseFromString(relsStr, 'application/xml');
  const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const commentRels = Array.from(
    relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship')
  ).filter(el => {
    const target = el.getAttribute('Target') ?? '';
    return (
      target === 'comments.xml' ||
      target === 'commentsExtended.xml' ||
      target.endsWith('/comments.xml') ||
      target.endsWith('/commentsExtended.xml')
    );
  });

  if (commentRels.length > 0) {
    for (const el of commentRels) {
      el.parentNode?.removeChild(el);
    }
    zip.file(relsPath, serializer.serializeToString(relsDoc), { compression: 'STORE' });
  }
}

// ─── CLEAN-010: Add trailing periods to list items for consistency ─────────────

/**
 * For each bulleted or numbered list (consecutive <w:p> elements sharing the
 * same w:numId) with 3 or more items: if at least one item already ends with a
 * period, append a period to every item that does not.
 *
 * "Ends with a period" means the last non-whitespace character of the
 * concatenated <w:t> text is '.'. The period is appended to the trimmed end of
 * the last <w:t> element that contains non-whitespace text.
 *
 * Items that already end with ':' or ';' are also skipped — only a missing
 * period triggers the fix (other terminal punctuation such as '?' or '!'
 * is treated the same as no period).
 *
 * Empty list items (no text content) are skipped.
 */
async function applyListPeriodFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  const groups = groupListParagraphs(paragraphs);
  let changed = false;

  for (const group of groups) {
    if (group.length < 3) continue;

    const texts = group.map(p => getParaText(p).trimEnd());
    const withPeriod = texts.filter(t => t.endsWith('.')).length;
    if (withPeriod === 0) continue;

    for (let i = 0; i < group.length; i++) {
      const text = texts[i]!;
      if (text.length === 0 || text.endsWith('.') || text.endsWith(':') || text.endsWith(';')) continue;

      // Find the last <w:t> with non-whitespace content and append '.'
      const wTs = Array.from(group[i]!.getElementsByTagName('w:t'));
      for (let j = wTs.length - 1; j >= 0; j--) {
        const wT = wTs[j]!;
        const content = wT.textContent ?? '';
        if (content.trim().length === 0) continue;

        const newContent = content.trimEnd() + '.';
        wT.textContent = newContent;
        if (newContent === newContent.trim()) {
          wT.removeAttribute('xml:space');
        }
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── FORMAT-003: Time format corrections ─────────────────────────────────────

const TIME_TZ_MAP: Record<string, string> = {
  est: 'ET', edt: 'ET', cst: 'CT', cdt: 'CT',
  mst: 'MT', mdt: 'MT', pst: 'PT', pdt: 'PT',
};

/**
 * Reformat non-standard time expressions within a single text string.
 * Returns the corrected string (unchanged if no non-standard times found).
 *
 * Steps applied in order:
 *  1. Normalize AM/PM variants → a.m. / p.m.
 *     Handles: AM, PM, A.M., P.M., A.M, P.M, am, pm (with or without space)
 *  2. Remove :00 from exact hours (e.g., 11:00 a.m. → 11 a.m.)
 *     Only fires when minutes are exactly 00; 3:30 p.m. is left unchanged.
 *  3. Normalize timezone abbreviations after time expressions:
 *     EST/EDT → ET, CST/CDT → CT, MST/MDT → MT, PST/PDT → PT
 *
 * Uses (?!\w) instead of trailing \b so that forms ending in "." (e.g., "A.M.")
 * are correctly bounded without requiring a word character at the boundary.
 */
function applyTimeFormatsToText(text: string): string {
  let result = text;

  // Step 1: Normalize non-standard AM/PM forms → a.m. / p.m.
  // Deliberately excludes already-correct a.m./p.m. to avoid re-processing.
  result = result.replace(
    /\b(\d{1,2}(?::\d{2})?)\s*(A\.M\.|P\.M\.|A\.M|P\.M|AM|PM|am|pm)(?!\w)/g,
    (_match, time, ampm) => {
      const normalized = /^[Aa]/.test(ampm) ? 'a.m.' : 'p.m.';
      return `${time} ${normalized}`;
    }
  );

  // Step 2: Remove :00 from exact hours, applied after Step 1 ensures
  // a.m./p.m. are in the correct lowercase form.
  result = result.replace(
    /\b(\d{1,2}):00\s+(a\.m\.|p\.m\.)(?!\w)/g,
    (_match, hour, ampm) => `${hour} ${ampm}`
  );

  // Step 3: Normalize timezone abbreviations that immediately follow a time
  // expression. Only fires after Step 1 normalizes the preceding AM/PM form.
  result = result.replace(
    /\b(a\.m\.|p\.m\.)\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi,
    (_match, ampm, tz) => `${ampm} ${TIME_TZ_MAP[tz.toLowerCase()]!}`
  );

  return result;
}

/**
 * Scan all <w:t> elements and reformat any non-standard time expressions.
 * Applies to all paragraph types — no exclusions for headings or code blocks.
 */
async function applyTimeFormatCorrections(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const wTElements = Array.from(xmlDoc.getElementsByTagName('w:t'));
  let changed = false;

  for (const wT of wTElements) {
    const text = wT.textContent ?? '';
    if (!text) continue;

    const corrected = applyTimeFormatsToText(text);
    if (corrected !== text) {
      wT.textContent = corrected;
      changed = true;
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── LINK-007: Add [PDF] label to external PDF links ─────────────────────────

/**
 * Append " [PDF]" to the link text of every external hyperlink whose
 * relationship target URL contains ".pdf" (case-insensitive) and whose current
 * link text does not already end with "[PDF]" (case-insensitive).
 *
 * Three cases are handled:
 *  1. Link text does not already end with "[PDF]" (case-insensitive)
 *     → " [PDF]" is appended to the link text.
 *  2. Link text already ends with "[PDF]" (case-insensitive) → no change.
 *  3. "[PDF]" appears as plain text in the run immediately following the
 *     hyperlink element → " [PDF]" is appended to the link text AND the
 *     adjacent plain-text run is removed.
 */
async function applyPdfLabelFix(zip: JSZip): Promise<void> {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

  // Build set of relationship IDs whose target URL contains .pdf
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;

  const relsStr = await relsFile.async('string');
  const parser = new DOMParser();
  const relsDoc = parser.parseFromString(relsStr, 'application/xml');

  const HYPERLINK_TYPE_URI = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

  const pdfRelIds = new Set<string>();
  for (const rel of Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'))) {
    const type = rel.getAttribute('Type') ?? '';
    const targetMode = rel.getAttribute('TargetMode') ?? '';
    const target = rel.getAttribute('Target') ?? '';

    // Only process external hyperlinks to http(s) URLs containing ".pdf".
    // This guards against non-hyperlink relationships and non-HTTP(S) targets
    // (e.g. mailto:, relative paths, or other relationship types) that happen
    // to contain ".pdf" in their Target string.
    if (type !== HYPERLINK_TYPE_URI) continue;
    if (targetMode !== 'External') continue;
    if (!/^https?:\/\//i.test(target)) continue;
    if (!target.toLowerCase().includes('.pdf')) continue;

    const id = rel.getAttribute('Id') ?? '';
    if (id) pdfRelIds.add(id);
  }

  if (pdfRelIds.size === 0) return;

  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  let changed = false;

  for (const hyperlink of Array.from(xmlDoc.getElementsByTagName('w:hyperlink'))) {
    const rId = hyperlink.getAttributeNS(R, 'id');
    if (!rId || !pdfRelIds.has(rId)) continue;

    // Collect text from direct-child <w:r> runs only
    const runs = Array.from(hyperlink.childNodes).filter(
      (n): n is Element => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'r'
    );
    const allWTs = runs.flatMap(r => Array.from(r.getElementsByTagName('w:t')));
    const linkText = allWTs.map(t => t.textContent ?? '').join('');

    // Case 2: already ends with [PDF] → skip
    if (/\[pdf\]$/i.test(linkText.trim())) continue;

    // Case 3: check if the run immediately after the hyperlink is plain "[PDF]"
    let adjacentPdfRun: Element | null = null;
    const nextSib = hyperlink.nextSibling;
    if (nextSib?.nodeType === Node.ELEMENT_NODE) {
      const nextEl = nextSib as Element;
      if (nextEl.localName === 'r') {
        const nextText = Array.from(nextEl.getElementsByTagName('w:t'))
          .map(t => t.textContent ?? '').join('').trim();
        if (/^\[pdf\]$/i.test(nextText)) {
          adjacentPdfRun = nextEl;
        }
      }
    }

    // Find the last <w:t> with non-empty content and append " [PDF]"
    let lastWT: Element | null = null;
    for (let i = allWTs.length - 1; i >= 0; i--) {
      if ((allWTs[i]!.textContent ?? '').length > 0) {
        lastWT = allWTs[i]!;
        break;
      }
    }
    if (!lastWT && allWTs.length > 0) lastWT = allWTs[allWTs.length - 1]!;
    if (!lastWT) continue;

    lastWT.textContent = (lastWT.textContent ?? '') + ' [PDF]';
    lastWT.setAttribute('xml:space', 'preserve');
    changed = true;

    // Remove the adjacent plain-text "[PDF]" run (case 3)
    if (adjacentPdfRun) {
      adjacentPdfRun.parentNode?.removeChild(adjacentPdfRun);
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── LINK-009: Fix partial hyperlinks ────────────────────────────────────────

/**
 * For each w:hyperlink, moves alphanumeric characters that are accidentally
 * outside the element but immediately adjacent to it:
 *
 *   Leading fix: trailing [a-zA-Z0-9] chars are removed from the end of the
 *                preceding sibling w:r and inserted as a new first run in the
 *                hyperlink.
 *   Trailing fix: leading [a-zA-Z0-9] chars are removed from the start of
 *                 the following sibling w:r and appended as a new last run.
 *
 * Only alphanumeric characters are moved — punctuation (., ,, ;, (, ), etc.)
 * immediately adjacent to a link is sentence/list punctuation and must stay
 * outside the hyperlink element. This keeps the patch in sync with LINK-009
 * detection, which uses the same alphanumeric boundary rule.
 *
 * Bookmark elements (w:bookmarkStart, w:bookmarkEnd) between the run and the
 * hyperlink are ignored; any other intervening element blocks adjacency.
 * External (r:id) and internal (w:anchor) hyperlinks are both processed.
 * Run properties from the external run are preserved on the new internal run.
 */
async function applyPartialHyperlinkFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  if (!xmlStr.includes('w:hyperlink')) return;

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  let changed = false;

  for (const hyperlink of Array.from(xmlDoc.getElementsByTagName('w:hyperlink'))) {
    const hlText = l9HlText(hyperlink);
    if (!hlText) continue;

    // Leading fix: move trailing alphanumeric chars of preceding run inside hyperlink
    const prevRun = l9AdjacentRun(hyperlink, 'prev');
    if (prevRun) {
      const prevText = l9RunText(prevRun);
      const chars = l9TrailingAlphanumeric(prevText);
      if (chars.length > 0 && !/^\s/.test(hlText)) {
        const rPr = Array.from(prevRun.children).find(c => c.localName === 'rPr') as Element | undefined;
        hyperlink.insertBefore(l9MakeRun(xmlDoc, W, rPr ?? null, chars), hyperlink.firstChild);
        const remaining = prevText.slice(0, prevText.length - chars.length);
        if (remaining === '') {
          prevRun.parentNode?.removeChild(prevRun);
        } else {
          l9SetRunText(prevRun, remaining);
        }
        changed = true;
      }
    }

    // Trailing fix: move leading alphanumeric chars of following run inside hyperlink
    const hlTextNow = l9HlText(hyperlink);
    const nextRun = l9AdjacentRun(hyperlink, 'next');
    if (nextRun) {
      const nextText = l9RunText(nextRun);
      const chars = l9LeadingAlphanumeric(nextText);
      if (chars.length > 0 && !/\s$/.test(hlTextNow)) {
        const rPr = Array.from(nextRun.children).find(c => c.localName === 'rPr') as Element | undefined;
        hyperlink.appendChild(l9MakeRun(xmlDoc, W, rPr ?? null, chars));
        const remaining = nextText.slice(chars.length);
        if (remaining === '') {
          nextRun.parentNode?.removeChild(nextRun);
        } else {
          l9SetRunText(nextRun, remaining);
        }
        changed = true;
      }
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

function l9HlText(hyperlink: Element): string {
  return Array.from(hyperlink.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function l9RunText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

/**
 * Returns the w:r sibling adjacent to `hyperlink` in the given direction,
 * skipping w:bookmarkStart / w:bookmarkEnd elements.
 * Returns null if any other element type is encountered first.
 */
function l9AdjacentRun(hyperlink: Element, direction: 'prev' | 'next'): Element | null {
  let node: Node | null =
    direction === 'prev' ? hyperlink.previousSibling : hyperlink.nextSibling;
  while (node !== null) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node = direction === 'prev' ? node.previousSibling : node.nextSibling;
      continue;
    }
    const el = node as Element;
    const name = el.localName;
    if (name === 'bookmarkStart' || name === 'bookmarkEnd') {
      node = direction === 'prev' ? node.previousSibling : node.nextSibling;
      continue;
    }
    return name === 'r' ? el : null;
  }
  return null;
}

function l9TrailingAlphanumeric(text: string): string {
  const m = text.match(/[a-zA-Z0-9]+$/);
  return m ? m[0] : '';
}

function l9LeadingAlphanumeric(text: string): string {
  const m = text.match(/^[a-zA-Z0-9]+/);
  return m ? m[0] : '';
}

/**
 * Create a new w:r run for insertion inside a w:hyperlink.
 * Starts from the external run's w:rPr (cloned, preserving any bold, font size, etc.),
 * then ensures w:rStyle w:val="Hyperlink" is the first child — so the moved
 * characters render with blue-underline hyperlink formatting.
 * If the external run had no rPr, a new one is created with just the Hyperlink style.
 */
function l9MakeRun(xmlDoc: Document, W: string, rPr: Element | null, text: string): Element {
  const run = xmlDoc.createElementNS(W, 'w:r');

  const newRpr: Element = rPr
    ? (rPr.cloneNode(true) as Element)
    : xmlDoc.createElementNS(W, 'w:rPr');

  // Remove any existing w:rStyle — it will be replaced with Hyperlink
  const existingStyle = Array.from(newRpr.childNodes).find(
    n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'rStyle'
  ) as Element | undefined;
  if (existingStyle) newRpr.removeChild(existingStyle);

  // w:rStyle must be first child per OOXML schema ordering
  const rStyle = xmlDoc.createElementNS(W, 'w:rStyle');
  rStyle.setAttributeNS(W, 'w:val', 'Hyperlink');
  newRpr.insertBefore(rStyle, newRpr.firstChild);

  run.appendChild(newRpr);

  const wT = xmlDoc.createElementNS(W, 'w:t');
  wT.textContent = text;
  if (text !== text.trim()) wT.setAttribute('xml:space', 'preserve');
  run.appendChild(wT);
  return run;
}

/** Update the text of a w:r run, collapsing to a single w:t element. */
function l9SetRunText(run: Element, text: string): void {
  const wTs = Array.from(run.getElementsByTagName('w:t'));
  if (wTs.length === 0) return;
  wTs[0]!.textContent = text;
  if (text !== text.trim()) {
    wTs[0]!.setAttribute('xml:space', 'preserve');
  } else {
    wTs[0]!.removeAttribute('xml:space');
  }
  for (let i = 1; i < wTs.length; i++) wTs[i]!.parentNode?.removeChild(wTs[i]!);
}

// ─── CLEAN-012: Bold "asterisked ( * )" in scoped sections ───────────────────

const ASTERISKED_PHRASE_LC = 'asterisked ( * )';
const ASTERISKED_SCOPE_RE = /^(approach|program logic model)$/i;

function asteriskedGetHeadingLevel(para: Element): number {
  const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  const val = pStyle?.getAttribute('w:val') ?? '';
  const m = val.match(/^Heading(\d)/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

function asteriskedRunIsBold(run: Element): boolean {
  const rPr = Array.from(run.children).find(c => c.localName === 'rPr');
  if (!rPr) return false;
  return Array.from(rPr.children).some(c => c.localName === 'b');
}

function asteriskedEnsureBold(xmlDoc: Document, W: string, run: Element): void {
  let rPr = Array.from(run.children).find(c => c.localName === 'rPr') ?? null;
  if (!rPr) {
    rPr = xmlDoc.createElementNS(W, 'w:rPr');
    run.insertBefore(rPr, run.firstChild);
  }
  if (!Array.from(rPr.children).some(c => c.localName === 'b')) {
    rPr.appendChild(xmlDoc.createElementNS(W, 'w:b'));
  }
  if (!Array.from(rPr.children).some(c => c.localName === 'bCs')) {
    rPr.appendChild(xmlDoc.createElementNS(W, 'w:bCs'));
  }
}

/**
 * Split a <w:r> run at character position `pos` within its concatenated <w:t> text.
 * Inserts a clone (text[0..pos)) before `run` in `para`.
 * Modifies `run` in place to contain text[pos..].
 * Returns [beforeRun, afterRun].
 */
function asteriskedSplitRun(para: Element, run: Element, pos: number): [Element, Element] {
  const wTs = Array.from(run.getElementsByTagName('w:t'));
  const fullText = wTs.map(t => t.textContent ?? '').join('');
  const before = fullText.slice(0, pos);
  const after = fullText.slice(pos);

  const beforeRun = run.cloneNode(true) as Element;
  const beforeWTs = Array.from(beforeRun.getElementsByTagName('w:t'));
  if (beforeWTs[0]) {
    beforeWTs[0].textContent = before;
    if (before !== before.trim()) beforeWTs[0].setAttribute('xml:space', 'preserve');
    else beforeWTs[0].removeAttribute('xml:space');
  }
  for (let i = 1; i < beforeWTs.length; i++) beforeWTs[i]!.parentNode?.removeChild(beforeWTs[i]!);

  if (wTs[0]) {
    wTs[0].textContent = after;
    if (after !== after.trim()) wTs[0].setAttribute('xml:space', 'preserve');
    else wTs[0].removeAttribute('xml:space');
  }
  for (let i = 1; i < wTs.length; i++) wTs[i]!.parentNode?.removeChild(wTs[i]!);

  para.insertBefore(beforeRun, run);
  return [beforeRun, run];
}

/**
 * Find all case-insensitive occurrences of ASTERISKED_PHRASE_LC in a paragraph
 * and ensure each is bold. Splits runs at phrase boundaries when needed to avoid
 * bolding surrounding text. Returns true if any change was made.
 *
 * Iterative: each pass may split one boundary run; the loop re-reads the DOM
 * after each split, converging when all phrase occurrences are exactly run-aligned
 * and bold.
 */
function asteriskedBoldPhraseInParagraph(xmlDoc: Document, W: string, para: Element): boolean {
  let changed = false;

  for (let pass = 0; pass < 10; pass++) {
    const runs: Element[] = Array.from(para.childNodes).filter(
      (n): n is Element => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'r'
    );
    if (runs.length === 0) break;

    const offsets: number[] = [];
    const texts: string[] = [];
    let off = 0;
    for (const r of runs) {
      offsets.push(off);
      const t = Array.from(r.getElementsByTagName('w:t')).map(wt => wt.textContent ?? '').join('');
      texts.push(t);
      off += t.length;
    }
    offsets.push(off);
    const fullLC = texts.join('').toLowerCase();

    let splitDone = false;
    let search = 0;

    let mi = fullLC.indexOf(ASTERISKED_PHRASE_LC, search);
    while (mi !== -1) {
      const me = mi + ASTERISKED_PHRASE_LC.length;

      // Find runs that overlap [mi, me)
      const span: number[] = [];
      for (let i = 0; i < runs.length; i++) {
        if (offsets[i]! < me && offsets[i + 1]! > mi) span.push(i);
      }

      if (span.length > 0 && !span.every(i => asteriskedRunIsBold(runs[i]!))) {
        if (span.length === 1) {
          const ri = span[0]!;
          const rs = offsets[ri]!;
          const re = offsets[ri + 1]!;
          let phraseRun = runs[ri]!;

          // Split off the after part first (so re aligns with phrase end)
          if (me < re) {
            const [bp] = asteriskedSplitRun(para, phraseRun, me - rs);
            phraseRun = bp; // bp covers [rs..me); afterRun covers [me..re)
            splitDone = true;
            changed = true;
            break; // Re-read DOM next pass
          }

          // Split off the before part (so rs aligns with phrase start)
          if (mi > rs) {
            const [, ap] = asteriskedSplitRun(para, phraseRun, mi - rs);
            phraseRun = ap; // ap covers [mi..re==me)
            splitDone = true;
            changed = true;
            break; // Re-read DOM next pass
          }

          // Phrase exactly fills the run — bold it
          asteriskedEnsureBold(xmlDoc, W, phraseRun);
          changed = true;
        } else {
          // Multi-run span: bold all overlapping runs without splitting
          for (const i of span) {
            if (!asteriskedRunIsBold(runs[i]!)) {
              asteriskedEnsureBold(xmlDoc, W, runs[i]!);
              changed = true;
            }
          }
        }
      }

      search = me;
      mi = fullLC.indexOf(ASTERISKED_PHRASE_LC, search);
    }

    if (!splitDone) break;
  }

  return changed;
}

/**
 * Bold "asterisked ( * )" in all paragraphs found under headings whose text
 * matches "Approach" or "Program logic model" (case-insensitive). Scope ends
 * when a heading at the same or higher level is encountered.
 */
async function applyAsteriskedBoldFix(zip: JSZip): Promise<void> {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  let inScope = false;
  let scopeLevel = 0;
  let changed = false;

  for (const child of Array.from(body.children)) {
    if (child.localName !== 'p') continue;

    const level = asteriskedGetHeadingLevel(child);
    if (level > 0) {
      const text = getParaText(child).trim();
      if (ASTERISKED_SCOPE_RE.test(text)) {
        inScope = true;
        scopeLevel = level;
      } else if (inScope && level <= scopeLevel) {
        inScope = false;
      }
      continue;
    }

    if (!inScope) continue;

    if (asteriskedBoldPhraseInParagraph(xmlDoc, W, child)) {
      changed = true;
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── CLEAN-011: Application checklist checkbox normalization ──────────────────

const CHECKLIST_TARGET_GLYPH = '◻'; // U+25FB WHITE MEDIUM SQUARE
const CHECKLIST_ALWAYS_REPLACE = new Set(['☐', '☑', '☒', '□', '•']);
const CHECKLIST_REPLACE_IF_SPACE = new Set(['o', 'O']);

function checklistNeedsGlyphFix(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  const first = trimmed[0]!;
  if (first === CHECKLIST_TARGET_GLYPH) return false;
  if (CHECKLIST_ALWAYS_REPLACE.has(first)) return true;
  if (trimmed.length >= 2 && trimmed[1] === ' ') {
    if (CHECKLIST_REPLACE_IF_SPACE.has(first)) return true;
    if (!/[a-zA-Z0-9]/.test(first)) return true;
  }
  return false;
}

function checklistIsListStyle(styleVal: string): boolean {
  return /list|bullet/i.test(styleVal);
}

function checklistGetPStyle(para: Element): string {
  const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
  if (!pPr) return '';
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  return pStyle?.getAttribute('w:val') ?? '';
}

function checklistGetParaText(para: Element): string {
  return Array.from(para.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function checklistGetHeadingLevel(styleVal: string): number | null {
  const match = styleVal.match(/^Heading(\d)/);
  return match ? parseInt(match[1]!, 10) : null;
}

function checklistIsApplicationChecklistHeading(paragraph: Element): boolean {
  const styleVal = checklistGetPStyle(paragraph);
  const level = checklistGetHeadingLevel(styleVal);
  if (level !== 2 && level !== 3) return false;

  const text = checklistGetParaText(paragraph).trim();
  return /application\s+checklist/i.test(text);
}

function checklistCollectTablesInSection(
  xmlDoc: Document,
  isSectionStart: (paragraph: Element) => boolean
): Element[] {
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return [];

  const tables: Element[] = [];
  let inSection = false;
  let sectionLevel = 0;

  for (const child of Array.from(body.children)) {
    if (child.localName === 'p') {
      const styleVal = checklistGetPStyle(child);
      const level = checklistGetHeadingLevel(styleVal);
      if (level !== null) {
        if (inSection && level <= sectionLevel) {
          inSection = false;
        }
        if (isSectionStart(child)) {
          inSection = true;
          sectionLevel = level;
        }
      }
    } else if (child.localName === 'tbl' && inSection) {
      tables.push(child);
    }
  }

  return tables;
}

function checklistFindTables(xmlDoc: Document): Element[] {
  return checklistCollectTablesInSection(xmlDoc, checklistIsApplicationChecklistHeading);
}

/**
 * Normalize application checklist checkbox glyphs and remove list paragraph
 * styles from first-column cells of tables within the Application checklist
 * section.
 */
async function applyChecklistCheckboxFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const tables = checklistFindTables(xmlDoc);
  let changed = false;

  for (const table of tables) {
    for (const row of Array.from(table.children).filter(c => c.localName === 'tr')) {
      const firstCell = Array.from(row.children).find(c => c.localName === 'tc');
      if (!firstCell) continue;
      const firstPara = Array.from(firstCell.children).find(c => c.localName === 'p');
      if (!firstPara) continue;

      // Fix 1: Glyph correction — replace the first non-whitespace character
      const cellText = checklistGetParaText(firstPara);
      if (checklistNeedsGlyphFix(cellText)) {
        const wTs = Array.from(firstPara.getElementsByTagName('w:t'));
        for (const wT of wTs) {
          const text = wT.textContent ?? '';
          const trimmed = text.trimStart();
          if (!trimmed) continue;
          const leadingWs = text.length - trimmed.length;
          wT.textContent = text.slice(0, leadingWs) + CHECKLIST_TARGET_GLYPH + trimmed.slice(1);
          changed = true;
          break;
        }
      }

      // Fix 2: List style → Normal
      const styleVal = checklistGetPStyle(firstPara);
      if (checklistIsListStyle(styleVal)) {
        const pPr = Array.from(firstPara.children).find(c => c.localName === 'pPr');
        if (pPr) {
          const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
          if (pStyle) {
            pStyle.setAttributeNS(W, 'w:val', 'Normal');
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── CLEAN-015: Remove bold from list item bullet characters ─────────────────

/**
 * Removes w:b and w:bCs from the paragraph-level w:rPr (inside w:pPr) of every
 * list paragraph (any w:p with w:numPr in its w:pPr). Only the paragraph-level
 * run properties are modified; w:rPr elements on individual w:r text runs are
 * left untouched.
 */
async function applyBoldBulletFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  if (!xmlStr.includes('w:numPr')) return;

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  let changed = false;
  for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
    const pPr = directChildEl(wP, 'w:pPr');
    if (!pPr) continue;
    if (!directChildEl(pPr, 'w:numPr')) continue;

    const pRpr = directChildEl(pPr, 'w:rPr');
    if (!pRpr) continue;

    const boldNodes = Array.from(pRpr.childNodes).filter(
      (node): node is Element =>
        node.nodeType === Node.ELEMENT_NODE &&
        ((node as Element).tagName === 'w:b' || (node as Element).tagName === 'w:bCs')
    );

    for (const boldNode of boldNodes) {
      pRpr.removeChild(boldNode);
      changed = true;
    }
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

// ─── CLEAN-016: Remove bold from trailing periods preceded by non-bold text ────

/**
 * For each paragraph where the last direct w:r run ends with a period, is bold,
 * and the immediately preceding w:r run is not bold:
 *   - If the period is the run's only character: removes w:b and w:bCs in-place.
 *   - If the period follows other text in the same run: splits the run so the
 *     prefix stays bold and the period moves to a new non-bold run after it.
 */
async function applyTrailingPeriodBoldFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  let changed = false;

  for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
    const runs = p16DirectRuns(wP);
    if (runs.length < 2) continue;

    const lastRun = runs[runs.length - 1]!;
    const prevRun = runs[runs.length - 2]!;

    const text = p16RunText(lastRun);
    if (!text.endsWith('.')) continue;
    if (!p16RunHasBold(lastRun)) continue;
    if (p16RunHasBold(prevRun)) continue;

    if (text === '.') {
      p16RemoveBold(lastRun);
    } else {
      p16SplitTrailingPeriod(wP, lastRun, text);
    }
    changed = true;
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

function p16DirectRuns(wP: Element): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(wP.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'w:r') {
      result.push(node as Element);
    }
  }
  return result;
}

function p16RunText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function p16IsEnabledOnOffProperty(el: Element | null): boolean {
  if (!el) return false;
  const val = el.getAttribute('w:val');
  if (val == null) return true;
  return val !== '0' && val !== 'false' && val !== 'off';
}

function p16RunHasBold(run: Element): boolean {
  const rPr = directChildEl(run, 'w:rPr');
  if (!rPr) return false;
  return (
    p16IsEnabledOnOffProperty(directChildEl(rPr, 'w:b')) ||
    p16IsEnabledOnOffProperty(directChildEl(rPr, 'w:bCs'))
  );
}

function p16RemoveBold(run: Element): void {
  const rPr = directChildEl(run, 'w:rPr');
  if (!rPr) return;
  const toRemove = Array.from(rPr.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE &&
         ((n as Element).tagName === 'w:b' || (n as Element).tagName === 'w:bCs')
  );
  for (const node of toRemove) rPr.removeChild(node);
}

/**
 * Splits the trailing period from `lastRun` into a new non-bold run.
 * Collapses all w:t elements in both the original and new run to a single w:t.
 * The original run retains its bold and keeps the prefix text.
 * The new run is a clone with bold removed and text set to ".".
 */
function p16SplitTrailingPeriod(wP: Element, lastRun: Element, fullText: string): void {
  const prefix = fullText.slice(0, -1);

  // Collapse all w:t elements in the original run to a single one with prefix text
  const wTs = Array.from(lastRun.getElementsByTagName('w:t'));
  if (wTs.length > 0) {
    wTs[0]!.textContent = prefix;
    if (prefix !== prefix.trim()) {
      wTs[0]!.setAttribute('xml:space', 'preserve');
    } else {
      wTs[0]!.removeAttribute('xml:space');
    }
    for (let i = 1; i < wTs.length; i++) wTs[i]!.parentNode?.removeChild(wTs[i]!);
  }

  // Clone the original run to create the period run, then strip bold and set text
  const periodRun = lastRun.cloneNode(true) as Element;
  const periodWTs = Array.from(periodRun.getElementsByTagName('w:t'));
  if (periodWTs.length > 0) {
    periodWTs[0]!.textContent = '.';
    periodWTs[0]!.removeAttribute('xml:space');
    for (let i = 1; i < periodWTs.length; i++) {
      periodWTs[i]!.parentNode?.removeChild(periodWTs[i]!);
    }
  } else {
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const newT = periodRun.ownerDocument!.createElementNS(W_NS, 'w:t');
    newT.textContent = '.';
    periodRun.appendChild(newT);
  }
  p16RemoveBold(periodRun);

  if (lastRun.nextSibling) {
    wP.insertBefore(periodRun, lastRun.nextSibling);
  } else {
    wP.appendChild(periodRun);
  }
}

// ─── TABLE-004: Apply heading style to "Important: public information" ────────

/**
 * For each single-cell table whose first paragraph starts with
 * "Important: public information" (case-insensitive) and has at least one
 * further paragraph in the cell, sets the paragraph's w:pStyle to the heading
 * level of the nearest preceding heading in the document body. Defaults to
 * Heading5 when no preceding heading is found.
 */
async function applyImportantPublicHeadingFix(zip: JSZip): Promise<void> {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;

  const xmlStr = await docFile.async('string');
  if (!xmlStr.includes('w:tbl')) return;

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return;

  const bodyChildren = Array.from(body.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE
  ) as Element[];

  let changed = false;

  for (let i = 0; i < bodyChildren.length; i++) {
    const el = bodyChildren[i]!;
    if (el.localName !== 'tbl') continue;

    const tc = t4GetSingleDirectCell(el);
    if (!tc) continue;

    const paragraphs = t4DirectParagraphsOf(tc);
    if (paragraphs.length < 2) continue;

    const firstPara = paragraphs[0]!;
    if (!getParaText(firstPara).trim().toLowerCase().startsWith('important: public information')) continue;

    const styleVal = t4FindPrecedingHeadingStyle(bodyChildren, i);
    t4ApplyPStyle(xmlDoc, W, firstPara, styleVal);
    changed = true;
  }

  if (changed) {
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
  }
}

/** Returns direct w:p children of a w:tc element. */
function t4DirectParagraphsOf(tc: Element): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(tc.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'p') {
      result.push(node as Element);
    }
  }
  return result;
}

/**
 * Returns the exact w:pStyle w:val of the nearest preceding heading paragraph
 * (e.g. "Heading2" or "Heading 2"), preserving the document's own format.
 * Defaults to "Heading5" when no preceding heading is found.
 */
function t4FindPrecedingHeadingStyle(bodyChildren: Element[], tableIdx: number): string {
  for (let j = tableIdx - 1; j >= 0; j--) {
    const sibling = bodyChildren[j]!;
    if (sibling.localName !== 'p') continue;
    const pPr = Array.from(sibling.children).find(c => c.localName === 'pPr');
    if (!pPr) continue;
    const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
    if (!pStyle) continue;
    const val = pStyle.getAttribute('w:val') ?? '';
    if (/^Heading\s*\d+$/i.test(val)) return val;
  }
  return 'Heading5';
}

/**
 * Returns the single direct w:tc cell of a table, or null if the table has
 * zero or more than one direct cell. Counts only direct w:tc children of
 * direct w:tr children to avoid counting cells inside nested tables.
 */
function t4GetSingleDirectCell(tbl: Element): Element | null {
  let count = 0;
  let firstCell: Element | null = null;
  for (const node of Array.from(tbl.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE || (node as Element).localName !== 'tr') continue;
    for (const cell of Array.from((node as Element).childNodes)) {
      if (cell.nodeType !== Node.ELEMENT_NODE || (cell as Element).localName !== 'tc') continue;
      count++;
      if (count === 1) firstCell = cell as Element;
      if (count > 1) return null;
    }
  }
  return count === 1 ? firstCell : null;
}

/**
 * Sets (or creates) w:pStyle on the paragraph to the given style value.
 * Inserts or updates w:pPr/w:pStyle, placing w:pStyle as the first child
 * of w:pPr per OOXML ordering requirements.
 */
function t4ApplyPStyle(xmlDoc: Document, W: string, wP: Element, styleVal: string): void {
  let pPr = directChildEl(wP, 'w:pPr');
  if (!pPr) {
    pPr = xmlDoc.createElementNS(W, 'w:pPr');
    wP.insertBefore(pPr, wP.firstChild);
  }
  const existing = directChildEl(pPr, 'w:pStyle');
  if (existing) {
    existing.setAttributeNS(W, 'w:val', styleVal);
  } else {
    const pStyle = xmlDoc.createElementNS(W, 'w:pStyle');
    pStyle.setAttributeNS(W, 'w:val', styleVal);
    pPr.insertBefore(pStyle, pPr.firstChild);
  }
}

/** Returns the first direct child element of `parent` with the given tag name. */
function directChildEl(parent: Element, tagName: string): Element | null {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

/**
 * Strips all <w:sdt> (content control) elements from every story part in the
 * document: word/document.xml, word/footnotes.xml, word/endnotes.xml, and any
 * header/footer parts present in the ZIP. This is the same part set used by
 * applyAcceptTrackedChangesAndRemoveComments.
 *
 * For each <w:sdt>, the visible content inside <w:sdtContent> is spliced in
 * place of the wrapper; <w:sdtPr> and <w:sdtEndPr> are discarded. Applied
 * unconditionally on every download.
 *
 * A cheap string pre-check ('<w:sdt') skips DOM parsing for parts that contain
 * no content controls, keeping the common case (no content controls) nearly free.
 */
async function applyRemoveContentControls(zip: JSZip): Promise<void> {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  for (const path of getStoryPartPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlStr = await file.async('string');
    // Cheap pre-check: skip DOM parse when the part contains no content controls.
    if (!xmlStr.includes('<w:sdt')) continue;

    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    if (stripContentControlsFromXmlDoc(xmlDoc)) {
      zip.file(path, serializer.serializeToString(xmlDoc));
    }
  }
}

/**
 * Unwraps all <w:sdt> elements in the given XML document in-place, splicing
 * each control's <w:sdtContent> children into the parent in its place.
 * <w:sdtPr> and <w:sdtEndPr> are discarded with the wrapper.
 * Returns true when at least one <w:sdt> was found and removed.
 *
 * Processes in reverse document order so nested controls are unwrapped before
 * their ancestors — when an inner <w:sdt> is removed, its extracted children
 * land inside the outer <w:sdtContent>, which the outer pass then hoists
 * correctly.
 */
function stripContentControlsFromXmlDoc(xmlDoc: Document): boolean {
  const sdts = Array.from(xmlDoc.getElementsByTagName('w:sdt')).reverse();
  if (sdts.length === 0) return false;

  for (const sdt of sdts) {
    const parent = sdt.parentNode;
    if (!parent) continue;
    const sdtContent = Array.from(sdt.children).find(c => c.localName === 'sdtContent');
    if (sdtContent) {
      // Splice visible content in place of the <w:sdt> wrapper.
      while (sdtContent.firstChild) {
        parent.insertBefore(sdtContent.firstChild, sdt);
      }
    }
    parent.removeChild(sdt);
  }

  return true;
}
