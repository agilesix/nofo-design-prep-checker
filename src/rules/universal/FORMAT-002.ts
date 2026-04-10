import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * FORMAT-002: Date format correction (auto-apply)
 *
 * Scans text nodes in `doc.html` for dates that do not follow the
 * SimplerNOFOs style guide format of "Month D, YYYY" (e.g. "April 2, 2024").
 * Automatically corrects dates in these non-standard formats:
 *
 *  Numeric formats:
 *   - MM/DD/YYYY (4-digit year required)      →  Month D, YYYY
 *   - YYYY-MM-DD                              →  Month D, YYYY
 *
 *  Month-name formats (any combination of the following):
 *   - Month DD, YYYY (leading-zero day)       →  Month D, YYYY  (e.g. "April 02, 2024")
 *   - Month Dth, YYYY (ordinal suffix)        →  Month D, YYYY  (e.g. "April 16th, 2024")
 *   - Month D YYYY (missing comma)            →  Month D, YYYY  (e.g. "April 16 2024")
 *   - Abbr. D, YYYY (abbreviated month name) →  Month D, YYYY  (e.g. "Apr. 2, 2024")
 *   - Abbr D, YYYY (no trailing period)      →  Month D, YYYY  (e.g. "Apr 2, 2024")
 *
 * Note: MM/DD/YY (2-digit year) is intentionally NOT corrected — there is no
 * reliable way to expand a 2-digit year without potentially introducing an
 * incorrect century (e.g. 12/31/98 could be 1998 or 2098). Only 4-digit years
 * are auto-corrected.
 *
 * When a day name precedes the date (e.g. "Monday, April 02, 2024") the day
 * name is preserved and only the date portion is reformatted.
 *
 * Excludes headings and code/preformatted blocks, matching the scope of the
 * OOXML patcher in buildDocx.ts.
 *
 * Exception: HRSA NOFOs use MM/DD/YYYY by convention — this rule is skipped
 * entirely for any HRSA content guide.
 *
 * Produces no entry in the auto-applied list when zero corrections are needed.
 */

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Standard abbreviations — Sept before Sep so the longer form is preferred in alternation.
// May omitted: it is both abbreviation and full name and is already in MONTHS_FULL.
const MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sept', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const FULL_MONTH_SET = new Set(MONTHS_FULL.map(m => m.toLowerCase()));

// Full names first in alternation so they take priority over abbreviations.
const MONTH_ALT = [...MONTHS_FULL, ...MONTHS_ABBR].join('|');

/**
 * Create a fresh regex for unified month-style date matching.
 * Captures: (1) month name, (2) optional trailing period, (3) day digits (1–31),
 * (4) optional ordinal suffix (st/nd/rd/th), (5) separator between day and year,
 * (6) 4-digit year.
 * A fresh instance is created each call to avoid stale lastIndex state.
 */
function makeMonthDateRegex(): RegExp {
  return new RegExp(
    `\\b(${MONTH_ALT})(\\.?)\\s+(0?[1-9]|[12]\\d|3[01])((?:st|nd|rd|th)?)(,\\s*|\\s+)(\\d{4})\\b`,
    'g'
  );
}

/**
 * Returns true when a month-style date match is not in the canonical form
 * "FullMonthName D, YYYY" (no abbreviation, no ordinal, no leading zero, has comma).
 */
function isNonStandardMonthDate(
  month: string, day: string, ordinal: string, separator: string
): boolean {
  return (
    !FULL_MONTH_SET.has(month.toLowerCase()) ||
    ordinal !== '' ||
    day.startsWith('0') ||
    !separator.startsWith(',')
  );
}

/**
 * Scan text for non-standard date formats and return the number of matches.
 * Used by the rule check to determine whether the fix should be applied.
 */
function countNonStandardDates(text: string): number {
  let count = 0;

  // Pattern A: YYYY-MM-DD
  count += (text.match(/\b\d{4}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b/g) ?? []).length;

  // Pattern B: MM/DD/YYYY (4-digit year only — 2-digit years are not corrected
  // because there is no reliable way to determine the correct century).
  count += (text.match(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{4}\b/g) ?? []).length;

  // Pattern D: Month-style dates — count only non-canonical matches.
  for (const match of text.matchAll(makeMonthDateRegex())) {
    const [, month, , day, ordinal, separator] = match;
    if (isNonStandardMonthDate(month!, day!, ordinal ?? '', separator ?? '')) {
      count++;
    }
  }

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

      // Skip headings and code/preformatted content to match OOXML mutation exclusions.
      if (parent.closest('h1, h2, h3, h4, h5, h6')) continue;
      if (parent.closest('code, pre')) continue;

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
