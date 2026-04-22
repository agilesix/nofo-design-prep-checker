import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-017: Remove orphaned "Footnotes" heading at end of HRSA documents (auto-apply)
 *
 * Grant Solutions Announcement Module sometimes leaves an empty "Footnotes" or
 * "Footnote" heading paragraph at the very end of exported Word documents. When
 * found with no meaningful content following it (only empty paragraphs or the
 * section properties element), it is silently removed from the downloaded output.
 *
 * Scoped to HRSA content guides only.
 */
const CLEAN_017: Rule = {
  id: 'CLEAN-017',
  autoApply: true,
  contentGuideIds: ['hrsa-bhw', 'hrsa-bphc', 'hrsa-construction', 'hrsa-mchb', 'hrsa-rr'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');

    const body = xmlDoc.getElementsByTagName('w:body')[0];
    if (!body) return [];

    const bodyChildren = Array.from(body.childNodes).filter(
      n => n.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    const last10 = bodyChildren.slice(-10);
    if (findOrphanedFootnotesIndex(last10) === -1) return [];

    return [
      {
        ruleId: 'CLEAN-017',
        description: 'Removed empty "Footnotes" heading at end of document.',
        targetField: 'struct.hrsa.removefootnotesheading',
      },
    ];
  },
};

/**
 * Return the index within `elements` of the orphaned Footnotes/Footnote
 * paragraph, or -1 if none qualifies.
 *
 * A paragraph qualifies when:
 *  - localName is "p"
 *  - trimmed, lowercased text is exactly "footnotes" or "footnote"
 *  - paragraph style is Heading1–Heading6, Normal, or absent (defaults to Normal)
 *  - every element after it is either an empty <w:p> or <w:sectPr>
 */
export function findOrphanedFootnotesIndex(elements: Element[]): number {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]!;
    if (el.localName !== 'p') continue;

    const text = c017ParaText(el).trim().toLowerCase();
    if (text !== 'footnotes' && text !== 'footnote') continue;

    if (!c017IsHeadingOrNormal(el)) continue;

    const rest = elements.slice(i + 1);
    const hasContent = rest.some(
      after =>
        after.localName !== 'sectPr' &&
        !(after.localName === 'p' && c017ParaText(after).trim() === '')
    );
    if (hasContent) continue;

    return i;
  }
  return -1;
}

function c017IsHeadingOrNormal(wP: Element): boolean {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return true;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return true;
  const val = pStyle.getAttribute('w:val') ?? '';
  return val.startsWith('Heading') || val === 'Normal' || val === '';
}

function c017ParaText(para: Element): string {
  return Array.from(para.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

export default CLEAN_017;
