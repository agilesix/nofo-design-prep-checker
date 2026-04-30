import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * ATTACH-001: Ensure "Required." is the first body paragraph under each h5
 * in the Attachments section (auto-apply).
 *
 * Within the h4 whose text is exactly "Attachments", each h5 block may
 * contain a standalone paragraph (not inside a list or table) whose first
 * bold run starts with "Required" (e.g. "Required.",
 * "Required if applicable."). If that paragraph is not the first body
 * paragraph immediately after the h5, it is silently moved there.
 *
 * If no h4 with text "Attachments" exists, emits nothing.
 * Applies silently — no issue is surfaced to the user.
 */
const ATTACH_001: Rule = {
  id: 'ATTACH-001',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml || !hasAttachmentsH4(doc.documentXml)) return [];
    return [
      {
        ruleId: 'ATTACH-001',
        description: 'Required. paragraph position normalized in Attachments h5 blocks.',
        targetField: 'struct.attachments.required.position',
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

export default ATTACH_001;
