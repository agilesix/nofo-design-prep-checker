/**
 * Shared XML-parsing helpers for the Attachments auto-fix rules (ATTACH-001,
 * ATTACH-002). Kept in one place so both rules stay in sync when the heading
 * detection logic changes.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Return the numeric heading level (1–6) of a <w:p>, or 0 if not a heading. */
export function attHeadingLevel(wP: Element): number {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return 0;
  const val =
    pStyle.getAttribute('w:val') ??
    pStyle.getAttributeNS(W, 'val') ??
    pStyle.getAttribute('val') ??
    '';
  const m = val.match(/^Heading\s*(\d+)$/i);
  if (!m) return 0;
  const level = parseInt(m[1]!, 10);
  return level >= 1 && level <= 6 ? level : 0;
}

/** Concatenate all <w:t> text content in a <w:p>. */
export function attParaText(wP: Element): string {
  return Array.from(wP.getElementsByTagName('w:t'))
    .map(wt => wt.textContent ?? '')
    .join('');
}

/**
 * Return true when documentXml contains a <w:p> with Heading4 style whose
 * concatenated text is exactly "Attachments".
 */
export function hasAttachmentsH4(documentXml: string): boolean {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
  for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
    if (attHeadingLevel(wP) === 4 && attParaText(wP).trim() === 'Attachments') {
      return true;
    }
  }
  return false;
}
