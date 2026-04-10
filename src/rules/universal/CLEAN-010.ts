import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

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
 * a period are left unchanged. All other items receive a period regardless of
 * what they end with (numbers, URLs, abbreviations, etc.).
 *
 * Detection uses doc.documentXml (raw OOXML) because list structure is not
 * preserved in the mammoth-generated HTML.
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

    const groups = groupListParagraphs(xmlDoc);
    let totalToFix = 0;

    for (const group of groups) {
      if (group.length < 3) continue;
      const texts = group.map(p => getItemText(p).trimEnd());
      const withPeriod = texts.filter(t => t.endsWith('.')).length;
      if (withPeriod === 0) continue;
      totalToFix += texts.filter(t => t.length > 0 && !t.endsWith('.')).length;
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

/**
 * Group consecutive <w:p> elements that share the same w:numId value into
 * arrays. A non-list paragraph (or a change in numId) closes the current group.
 */
function groupListParagraphs(xmlDoc: Document): Element[][] {
  const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
  const groups: Element[][] = [];
  let currentGroup: Element[] = [];
  let currentNumId: string | null = null;

  for (const para of paragraphs) {
    const numId = getListNumId(para);
    if (numId !== null && numId === currentNumId) {
      currentGroup.push(para);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = numId !== null ? [para] : [];
      currentNumId = numId;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups;
}

/** Return the w:numId value for a list paragraph, or null if not a list item. */
function getListNumId(para: Element): string | null {
  const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
  if (!pPr) return null;
  const numPr = Array.from(pPr.children).find(c => c.localName === 'numPr');
  if (!numPr) return null;
  const numIdEl = Array.from(numPr.children).find(c => c.localName === 'numId');
  if (!numIdEl) return null;
  const val = numIdEl.getAttribute('w:val') ?? '';
  return !val || val === '0' ? null : val;
}

/** Concatenate text content of all w:t descendants of a paragraph. */
function getItemText(para: Element): string {
  return Array.from(para.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

export default CLEAN_010;
