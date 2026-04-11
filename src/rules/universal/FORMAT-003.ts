import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * FORMAT-003: Time format correction (auto-apply)
 *
 * Scans text for time expressions that do not follow the SimplerNOFOs style
 * guide format. Automatically corrects:
 *
 *  AM/PM normalization:
 *   - AM, A.M., A.M, am  →  a.m.
 *   - PM, P.M., P.M, pm  →  p.m.
 *   (handles both "11 AM" and "11AM", with or without a space before the suffix)
 *
 *  Exact-hour :00 removal:
 *   - 11:00 a.m.  →  11 a.m.
 *   - 3:00 p.m.   →  3 p.m.
 *   (only when minutes are exactly 00; "3:30 p.m." is left unchanged)
 *
 *  Timezone normalization (only when immediately following a time expression):
 *   - EST, EDT  →  ET
 *   - CST, CDT  →  CT
 *   - MST, MDT  →  MT
 *   - PST, PDT  →  PT
 *
 * Applies to all paragraph types — no exclusions for headings, code, or
 * any other style.
 *
 * Produces no entry in the auto-applied list when zero corrections are needed.
 */

/**
 * Create a fresh regex for complete time expression matching.
 *
 * Matches: optional digits with :MM, AM/PM in any form (including already-
 * correct a.m./p.m. to also catch :00 and timezone issues), optional timezone.
 *
 * Uses (?!\w) instead of trailing \b so that forms ending in "." (like "A.M.")
 * are correctly bounded without requiring a word character at the boundary.
 */
function makeTimeExprRegex(): RegExp {
  return /\b(\d{1,2}(?::\d{2})?)\s*(A\.M\.|P\.M\.|A\.M|P\.M|AM|PM|am|pm|a\.m\.|p\.m\.)(?:\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT))?(?!\w)/g;
}

/**
 * Scan text for non-standard time expressions and return the number of matches.
 * Each time expression with at least one issue counts as one instance:
 *  - AM/PM is not in "a.m." / "p.m." form
 *  - Minutes are :00 (eligible for removal)
 *  - A non-standard timezone abbreviation follows the time expression
 */
function countNonStandardTimes(text: string): number {
  let count = 0;
  for (const match of text.matchAll(makeTimeExprRegex())) {
    const [, time, ampm, tz] = match;
    const isAmPmNonStandard = ampm !== 'a.m.' && ampm !== 'p.m.';
    const hasZeroMinutes = !!(time && time.endsWith(':00'));
    const hasTz = !!tz;
    if (isAmPmNonStandard || hasZeroMinutes || hasTz) count++;
  }
  return count;
}

const FORMAT_003: Rule = {
  id: 'FORMAT-003',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
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
      const text = (node as Text).textContent ?? '';
      totalCount += countNonStandardTimes(text);
    }

    if (totalCount === 0) return [];

    return [
      {
        ruleId: 'FORMAT-003',
        description: `Time format corrected — ${totalCount} instance${totalCount === 1 ? '' : 's'} updated to style guide format.`,
        targetField: 'format.time.correct',
        value: String(totalCount),
      },
    ];
  },
};

export default FORMAT_003;
