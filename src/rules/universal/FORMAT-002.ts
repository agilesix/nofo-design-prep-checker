import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * FORMAT-002: Date format correction (auto-apply)
 *
 * Scans paragraph text for dates that do not follow the SimplerNOFOs style
 * guide format of "Month D, YYYY" (e.g. "April 2, 2024"). Automatically
 * corrects dates in these non-standard formats:
 *
 *  - MM/DD/YYYY or MM/DD/YY           →  Month D, YYYY
 *  - Month DD, YYYY (leading-zero day) →  Month D, YYYY  (e.g. "April 02, 2024" → "April 2, 2024")
 *  - YYYY-MM-DD                        →  Month D, YYYY
 *
 * When a day name precedes the date (e.g. "Monday, April 02, 2024") the day
 * name is preserved and only the date portion is reformatted.
 *
 * Exception: HRSA NOFOs use MM/DD/YYYY by convention — this rule is skipped
 * entirely for any HRSA content guide.
 *
 * Produces no entry in the auto-applied list when zero corrections are needed.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_PATTERN = MONTHS.join('|');

/**
 * Scan text for non-standard date formats and return the number of matches.
 * Used by the rule check to determine whether the fix should be applied.
 */
function countNonStandardDates(text: string): number {
  let count = 0;

  // Pattern A: YYYY-MM-DD
  const patternA = /\b\d{4}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b/g;
  const matchesA = text.match(patternA);
  if (matchesA) count += matchesA.length;

  // Pattern B: MM/DD/YYYY or MM/DD/YY
  const patternB = /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:\d{2}|\d{4})\b/g;
  const matchesB = text.match(patternB);
  if (matchesB) count += matchesB.length;

  // Pattern C: Month DD, YYYY with leading zero on day (01–09 only)
  const patternC = new RegExp(
    `\\b(?:${MONTH_PATTERN})\\s+0[1-9],\\s*\\d{4}\\b`,
    'g'
  );
  const matchesC = text.match(patternC);
  if (matchesC) count += matchesC.length;

  return count;
}

const FORMAT_002: Rule = {
  id: 'FORMAT-002',
  autoApply: true,
  check(doc: ParsedDocument, options: RuleRunnerOptions): AutoAppliedChange[] {
    // HRSA NOFOs use MM/DD/YYYY by convention — skip entirely.
    if (options.contentGuideId?.startsWith('hrsa-')) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    if (typeof htmlDoc.createTreeWalker !== 'function') return [];

    const walker = htmlDoc.createTreeWalker(
      htmlDoc.body ?? htmlDoc,
      NodeFilter.SHOW_TEXT
    );

    let totalCount = 0;
    let node: Node | null;

    while ((node = walker.nextNode()) !== null) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (!parent) continue;

      // Skip headings
      if (parent.closest('h1, h2, h3, h4, h5, h6')) continue;

      const text = textNode.textContent ?? '';
      totalCount += countNonStandardDates(text);
    }

    if (totalCount === 0) return [];

    return [
      {
        ruleId: 'FORMAT-002',
        description: `Date formats corrected — ${totalCount} instance(s) updated to Month D, YYYY format.`,
        targetField: 'format.date.correct',
        value: String(totalCount),
      },
    ];
  },
};

export default FORMAT_002;
