import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { groupListParagraphs } from '../../utils/listHelpers';

/**
 * CLEAN-010: Add trailing periods to list items for consistency (auto-apply)
 *
 * For each bulleted or numbered list (consecutive paragraphs sharing the same
 * w:numId) with 3 or more items: if at least 1 item already ends with a
 * period, silently add a period to every item that does not.
 *
 * "Ends with a period" means the last non-whitespace character of the item's
 * text is '.'. No other punctuation (?, !, :, ;) is treated as equivalent.
 *
 * Empty list items (no text content) are skipped. Items that already end with
 * a period are left unchanged. Items ending with a colon (:) or semicolon (;)
 * are also left unchanged — they introduce sub-lists or clauses and a trailing
 * period would be grammatically incorrect. All other items receive a period.
 *
 * Detection uses doc.documentXml (raw OOXML) because list structure is not
 * preserved in the mammoth-generated HTML.
 *
 * List grouping uses the shared groupListParagraphs helper from
 * src/utils/listHelpers.ts — the same helper used by the OOXML patch in
 * buildDocx.ts — so detection and patching always apply the same grouping rules.
 *
 * Produces no output when no list meets the conditions.
 */
const CLEAN_010: Rule = {
  id: 'CLEAN-010',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    // Fast exit: no list items present
    if (!xml || !xml.includes('w:numPr')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    const groups = groupListParagraphs(Array.from(xmlDoc.getElementsByTagName('w:p')));
    let totalToFix = 0;

    for (const group of groups) {
      if (group.length < 3) continue;
      const texts = group.map(p => getItemText(p).trimEnd());
      const withPeriod = texts.filter(t => t.endsWith('.')).length;
      if (withPeriod === 0) continue;
      totalToFix += texts.filter(t => t.length > 0 && !t.endsWith('.') && !t.endsWith(':') && !t.endsWith(';')).length;
    }

    if (totalToFix === 0) return [];

    return [
      {
        ruleId: 'CLEAN-010',
        description: `Missing periods added to ${totalToFix} list item${totalToFix === 1 ? '' : 's'} for consistency.`,
        targetField: 'list.periodfix',
        value: String(totalToFix),
      },
    ];
  },
};

/** Concatenate text content of all w:t descendants of a paragraph. */
function getItemText(para: Element): string {
  return Array.from(para.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

export default CLEAN_010;
