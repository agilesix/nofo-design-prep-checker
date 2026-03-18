import JSZip from 'jszip';
import type { AcceptedFix } from '../types';

export async function buildDocx(
  originalArchive: JSZip,
  acceptedFixes: AcceptedFix[]
): Promise<Blob> {
  // Deep-clone the archive: re-serialize to arraybuffer then reload into a fresh
  // JSZip instance so the original parsedDoc.zipArchive is never mutated.
  const clonedBuffer = await originalArchive.generateAsync({ type: 'arraybuffer' });
  const zip = await JSZip.loadAsync(clonedBuffer);

  // Separate fixes by type for safe ordering
  const metaFixes = acceptedFixes.filter(f => f.targetField?.startsWith('metadata.'));
  const bodyFixes = acceptedFixes.filter(
    f => f.ruleId.startsWith('LINK-003') || f.ruleId.startsWith('FORMAT-')
  );
  const imgFixes = acceptedFixes.filter(f => f.targetField?.startsWith('image.'));
  const noteFixes = acceptedFixes.filter(f => f.ruleId === 'NOTE-003');

  // Apply metadata patches
  if (metaFixes.length > 0) {
    await applyMetadataFixes(zip, metaFixes);
  }

  // Apply body patches (links, format)
  if (bodyFixes.length > 0 || imgFixes.length > 0) {
    await applyDocumentBodyFixes(zip, [...bodyFixes, ...imgFixes]);
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

    // LINK-003: update link text
    if (fix.ruleId === 'LINK-003' && fix.targetField?.startsWith('link.')) {
      // Target field: link.{issueId}.text
      // This is a simplified approach - production would need to match the specific hyperlink
      // Match by relationship ID stored in the issue - production implementation needed
      // In production, match by relationship ID stored in the issue
    }
  }

  const serializer = new XMLSerializer();
  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
}

async function applyNoteFixes(_zip: JSZip): Promise<void> {
  // NOTE-003: convert footnotes to endnotes
  // This is handled during rule execution as an auto-applied change
  // The actual XML mutation should be done in NOTE-003 rule
}
