import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * ATTACH-002: Ensure the File name value uses sentence case in Attachments
 * h5 blocks (auto-apply).
 *
 * Within the h4 whose text is exactly "Attachments", each h5 block may
 * contain a paragraph with a bold run "File name:" followed by one or more
 * non-bold runs holding the file name value. If the value is not already in
 * sentence case, it is corrected and written back as a single normal run.
 *
 * Exception: values containing an all-caps word of 2+ characters (likely an
 * acronym, e.g. "DMP", "IDC") are left unchanged.
 *
 * If no h4 with text "Attachments" exists, emits nothing.
 * Changes are logged to the browser console. Applies silently — no issue is
 * surfaced to the user.
 */
const ATTACH_002: Rule = {
  id: 'ATTACH-002',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml || !hasAttachmentsH4(doc.documentXml)) return [];
    return [
      {
        ruleId: 'ATTACH-002',
        description: 'File name values in Attachments h5 blocks normalized to sentence case.',
        targetField: 'struct.attachments.filename.sentencecase',
        value: '1',
      },
    ];
  },
};

function hasAttachmentsH4(documentXml: string): boolean {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
    if (localHeadingLevel(wP, W) === 4 && localParaText(wP).trim() === 'Attachments') {
      return true;
    }
  }
  return false;
}

function localHeadingLevel(wP: Element, W: string): number {
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

function localParaText(wP: Element): string {
  return Array.from(wP.getElementsByTagName('w:t'))
    .map(wt => wt.textContent ?? '')
    .join('');
}

export default ATTACH_002;
