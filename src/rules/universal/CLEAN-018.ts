import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-018: Remove instruction box tables from the document body (auto-apply)
 *
 * Scans word/document.xml for single-cell tables (exactly one w:tc) whose
 * first paragraph text contains the word "instructions" (case-insensitive).
 * This covers patterns such as:
 *   • "DGHT-SPECIFIC INSTRUCTIONS" / "DGHP-SPECIFIC INSTRUCTIONS"
 *   • Any "[WORD]-SPECIFIC INSTRUCTIONS" variant
 *   • "Instructions for completing this section"
 *   • Any instruction-box opener that includes the word "instructions"
 *
 * Qualifying tables are silently removed from the downloaded document.
 * Detection is OOXML-based (raw documentXml). Applies to all content guides.
 * If zero qualifying tables are found, no entry appears in the auto-applied list.
 */
const CLEAN_018: Rule = {
  id: 'CLEAN-018',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];
    if (!xml.toLowerCase().includes('instructions')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const tbl of Array.from(xmlDoc.getElementsByTagName('w:tbl'))) {
      if (isInstructionBoxTbl(tbl)) count++;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-018',
        description: `${count} instruction box${count === 1 ? '' : 'es'} removed.`,
        targetField: 'struct.universal.removeinstructionboxes',
        value: String(count),
      },
    ];
  },
};

/**
 * Returns true when the table is a single-cell instruction box:
 *   1. Exactly one w:tc across all rows.
 *   2. The first direct w:p child of the cell has concatenated text
 *      containing the word "instructions" (case-insensitive).
 */
export function isInstructionBoxTbl(tbl: Element): boolean {
  const cells = Array.from(tbl.getElementsByTagName('w:tc'));
  if (cells.length !== 1) return false;

  const cell = cells[0]!;

  // Use the first w:p that is a direct child of the cell, not a nested table paragraph.
  const firstPara = Array.from(cell.childNodes).find(
    n => n.nodeType === 1 && (n as Element).tagName === 'w:p'
  ) as Element | undefined;
  if (!firstPara) return false;

  const text = Array.from(firstPara.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();

  return text.includes('instructions');
}

export default CLEAN_018;
