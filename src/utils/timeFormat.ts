/**
 * Time format correction utilities for FORMAT-003.
 *
 * Exposed as a separate module so the correction logic can be unit-tested
 * independently of the OOXML pipeline in buildDocx.ts.
 */

export const TIME_TZ_MAP: Record<string, string> = {
  est: 'ET', edt: 'ET', cst: 'CT', cdt: 'CT',
  mst: 'MT', mdt: 'MT', pst: 'PT', pdt: 'PT',
};

// All meridiem forms, including already-correct a.m./p.m.
const MERIDIEM_ALT = String.raw`A\.M\.|P\.M\.|A\.M|P\.M|AM|PM|am|pm|a\.m\.|p\.m\.`;

// Both the canonical final forms and the non-standard precursor forms
const TZ_ALT = String.raw`ET|CT|MT|PT|EST|EDT|CST|CDT|MST|MDT|PST|PDT`;

// Range separator: " to " or any dash/en-dash/em-dash with optional whitespace
const RANGE_SEP = String.raw`(?:\s+to\s+|\s*[-–—]\s*)`;

interface TimeToken {
  display: string;
  meridiem: 'a.m.' | 'p.m.' | null; // null signals noon or midnight
}

function normalizeMeridiem(ampm: string): 'a.m.' | 'p.m.' {
  return /^[Aa]/.test(ampm) ? 'a.m.' : 'p.m.';
}

function normalizeTz(tz: string): string {
  return TIME_TZ_MAP[tz.toLowerCase()] ?? tz;
}

/**
 * Normalize a single time token (digits + meridiem).
 * - Strips :00 from exact hours.
 * - Substitutes "noon" for 12:00 PM and "midnight" for 12:00 AM.
 *   Only the :00 form triggers substitution; bare "12 a.m." / "12 p.m."
 *   (no minutes) is normalized to "12 a.m." / "12 p.m." and left as-is.
 */
function normalizeTimeToken(hhmm: string, ampm: string): TimeToken {
  const meridiem = normalizeMeridiem(ampm);

  if (hhmm === '12:00') {
    return { display: meridiem === 'p.m.' ? 'noon' : 'midnight', meridiem: null };
  }

  const display = hhmm.replace(/:00$/, '');
  return { display, meridiem };
}

/**
 * Reformat non-standard time expressions within a single plain-text string.
 * Returns the corrected string (unchanged if no issues found).
 *
 * Corrections applied in order:
 *
 * 1. Time ranges (TIME MERIDIEM [to|–|-] TIME MERIDIEM TZ?)
 *    - Replace dash/en-dash with "to"
 *    - Normalize both time tokens (see below)
 *    - When both times share the same meridiem, emit it only once at the end
 *    - 12:00 PM → noon, 12:00 AM → midnight (applied per token)
 *
 * 2. Single time expressions
 *    - Normalize AM/PM variants → a.m. / p.m.
 *    - Strip :00 from exact hours (8:00 AM → 8 a.m.)
 *    - 12:00 PM → noon, 12:00 AM → midnight
 *
 * 3. Timezone normalization after a time expression
 *    - EST/EDT → ET, CST/CDT → CT, MST/MDT → MT, PST/PDT → PT
 */
export function applyTimeFormatsToText(text: string): string {
  let result = text;

  // ── Step 1: time ranges ────────────────────────────────────────────────────
  const rangeRe = new RegExp(
    String.raw`\b(\d{1,2}(?::\d{2})?)\s*(` + MERIDIEM_ALT + String.raw`)(?!\w)` +
    RANGE_SEP +
    String.raw`(\d{1,2}(?::\d{2})?)\s*(` + MERIDIEM_ALT + String.raw`)(?!\w)` +
    String.raw`(?:\s+(` + TZ_ALT + String.raw`))?(?!\w)`,
    'gi'
  );

  result = result.replace(rangeRe, (_match, t1: string, m1: string, t2: string, m2: string, tz?: string) => {
    const n1 = normalizeTimeToken(t1, m1);
    const n2 = normalizeTimeToken(t2, m2);
    const tzPart = tz ? ` ${normalizeTz(tz)}` : '';

    if (n2.meridiem === null) {
      // Second time is noon or midnight
      return n1.meridiem !== null
        ? `${n1.display} ${n1.meridiem} to ${n2.display}${tzPart}`
        : `${n1.display} to ${n2.display}${tzPart}`;
    }
    if (n1.meridiem === null) {
      // First time is noon or midnight (unusual order)
      return `${n1.display} to ${n2.display} ${n2.meridiem}${tzPart}`;
    }

    // Both are regular times
    if (n1.meridiem === n2.meridiem) {
      // Same meridiem — omit from first token
      return `${n1.display} to ${n2.display} ${n2.meridiem}${tzPart}`;
    }
    return `${n1.display} ${n1.meridiem} to ${n2.display} ${n2.meridiem}${tzPart}`;
  });

  // ── Step 2: single time expressions ────────────────────────────────────────
  // Includes a.m./p.m. to catch 12:00 a.m./p.m. → midnight/noon and :00 removal.
  const singleRe = new RegExp(
    String.raw`\b(\d{1,2}(?::\d{2})?)\s*(` + MERIDIEM_ALT + String.raw`)(?!\w)`,
    'gi'
  );

  result = result.replace(singleRe, (_match, hhmm: string, ampm: string) => {
    const tok = normalizeTimeToken(hhmm, ampm);
    if (tok.meridiem === null) return tok.display;
    return `${tok.display} ${tok.meridiem}`;
  });

  // ── Step 3: timezone normalization ─────────────────────────────────────────
  result = result.replace(
    /\b(a\.m\.|p\.m\.|noon|midnight)\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi,
    (_match, timePart: string, tz: string) => `${timePart} ${TIME_TZ_MAP[tz.toLowerCase()]!}`
  );

  return result;
}
