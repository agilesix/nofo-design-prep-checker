import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * TABLE-002: Tables missing a caption
 *
 * A table is considered captioned when any of the following is true:
 *  1. It has a non-empty <caption> element
 *  2. It is directly preceded (no blank line) by a non-empty <p> paragraph —
 *     any non-empty paragraph text is accepted as a valid caption regardless of
 *     whether it starts with "Table:" and regardless of bold or other formatting
 *
 * When a valid caption is found, a secondary check surfaces a low-priority
 * suggestion if the caption text appears to use title case or all-caps rather
 * than the sentence case recommended by the SimplerNOFOs style guide.
 *
 * Exempt tables (suppressed entirely):
 *  - Single-cell tables (callout boxes)
 *  - Key facts / key dates tables
 *  - Application contents / standard forms
 *  - Application checklist / merit review criteria / reporting tables
 *  - Tables preceded by a heading within 50 words of body text
 */
const TABLE_002: Rule = {
  id: 'TABLE-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));
    const getContext = buildLocationLookup(htmlDoc);

    tables.forEach((table, index) => {
      // ── Single-cell tables (callout boxes) — exempt ────────────────────────────
      // Exemption is purely structural: count direct cells only (no inspection of
      // cell content). Use :scope child combinators so cells inside nested tables
      // are not counted. If exactly one cell exists, skip all further checks —
      // single-cell tables are suppressed entirely.
      const directCells = table.querySelectorAll(
        ':scope > tr > td, :scope > tr > th,' +
        ':scope > tbody > tr > td, :scope > tbody > tr > th,' +
        ':scope > thead > tr > td, :scope > thead > tr > th,' +
        ':scope > tfoot > tr > td, :scope > tfoot > tr > th'
      );
      if (directCells.length === 1) return;

      // Compute context upfront — needed for both the suggestion and the warning.
      const section = findSectionForElement(table, doc);
      const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';
      // nearestHeading from buildLocationLookup tracks H1–H4 only; used for
      // display context in issue cards, not for exemption logic.
      const { nearestHeading } = getContext(table);
      const sectionHeading = section?.heading ?? '';
      const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';

      // ── Tier 1: <caption> element ──────────────────────────────────────────────
      const caption = table.querySelector('caption');
      const captionText = (caption?.textContent ?? '').trim();
      if (caption && captionText !== '') {
        if (looksLikeTitleOrAllCaps(captionText)) {
          issues.push(makeSentenceCaseSuggestion(`TABLE-002-sc-${index}`, captionText, sectionId, nearestHeading));
        }
        return;
      }

      // ── Tier 2: paragraph directly above the table ────────────────────────────
      // Any non-empty <p> immediately preceding the table (normal or bold text) is
      // accepted as a valid caption — "Table:" prefix is not required.
      const prevEl = table.previousElementSibling;
      const prevText = (prevEl?.textContent ?? '').trim();
      if (prevEl?.matches('p') && prevText !== '') {
        if (looksLikeTitleOrAllCaps(prevText)) {
          issues.push(makeSentenceCaseSuggestion(`TABLE-002-sc-${index}`, prevText, sectionId, nearestHeading));
        }
        return;
      }

      // ── Other exempt table types ───────────────────────────────────────────────
      // For the nearest-heading signal we perform a local H1–H6 backward scan
      // rather than using nearestHeading from buildLocationLookup (which only
      // tracks H1–H4 for display-context purposes).
      if (isExemptFromCaption(table, sectionHeading, findNearestHeadingText(table))) return;

      // ── Nearby heading caption substitute ─────────────────────────────────────
      // A heading preceding the table with ≤ 50 words of body text between them
      // serves as a caption substitute — common NOFO pattern:
      // heading → short intro sentence(s) → table.
      if (hasNearbyHeadingCaption(table)) return;

      // ── Missing caption warning ────────────────────────────────────────────────
      issues.push({
        id: `TABLE-002-${index}`,
        ruleId: 'TABLE-002',
        title: 'Table is missing a caption',
        severity: 'warning',
        sectionId,
        nearestHeading,
        description:
          `A table${firstRowText ? ` starting with \u201c${firstRowText}\u2026\u201d` : ''} does not have a caption. ` +
          `Per the SimplerNOFOs style guide, place a caption paragraph directly above the table ` +
          `with no blank line between the caption and the table. Any non-empty paragraph in normal ` +
          `or bold text is accepted as a valid caption. ` +
          `A heading (H1\u2013H6) can serve as a caption substitute when it precedes the table ` +
          `with 50 words or fewer of body text between it and the table \u2014 this table was ` +
          `flagged because no such heading was found, or the intervening text exceeded 50 words. ` +
          `Note: key facts tables, key dates tables, callout boxes (single-cell tables), ` +
          `application checklist, merit review criteria, standard forms, application contents, ` +
          `and reporting tables are exempt from this requirement \u2014 use your judgment if this table ` +
          `falls into one of those categories.`,
        suggestedFix:
          `Either add a caption paragraph directly above the table (no blank line between caption ` +
          `and table), or move the relevant heading closer to the table so that no more than 50 ` +
          `words of body text separate them.`,
        instructionOnly: true,
      });
    });

    return issues;
  },
};

// ─── Sentence case check ──────────────────────────────────────────────────────

/**
 * Returns true when the caption text appears to use title case or all-caps rather
 * than the sentence case recommended by the SimplerNOFOs style guide.
 *
 * Heuristic: after stripping an optional "Table:" prefix, first detect captions
 * that are entirely all-caps (including single-word captions such as "TIMELINE").
 * Otherwise, if any word after the first word (of length > 1) starts with an
 * uppercase letter AND contains at least one lowercase letter, the text is likely
 * title case.
 *
 * All-caps words (PDF, CDC, HRSA) are treated as acronyms and skipped — they are
 * not evidence of title-case formatting.
 *
 * Single-letter words (e.g. "A", "I") are excluded from the title-case check
 * because they appear in both sentence case and title case.
 */
function looksLikeTitleOrAllCaps(text: string): boolean {
  // Strip optional "Table:" prefix (e.g. "Table: Program Timeline" → "Program Timeline")
  const body = text.replace(/^table\s*:\s*/i, '').trim();
  if (!body) return false;

  // Explicitly catch all-caps captions, including single-word captions such as "TIMELINE".
  // Require at least one letter so punctuation/numbers alone do not trigger.
  if (/[A-Z]/.test(body) && !/[a-z]/.test(body)) return true;

  // Only consider words of length > 1 to skip single-letter words
  const words = body.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 2) return false;
  // Title case: any word after the first starts with an uppercase letter AND has
  // at least one lowercase letter. All-caps words (PDF, CDC, HRSA) are acronyms
  // and are not evidence of title-case formatting — skip them entirely.
  return words.slice(1).some(w => /^[A-Z]/.test(w) && /[a-z]/.test(w));
}

// ─── Issue factories ──────────────────────────────────────────────────────────

function makeSentenceCaseSuggestion(
  id: string,
  captionText: string,
  sectionId: string,
  nearestHeading: string | null
): Issue {
  return {
    id,
    ruleId: 'TABLE-002',
    title: 'Table caption should use sentence case',
    severity: 'suggestion',
    sectionId,
    nearestHeading,
    description:
      `The caption \u201c${captionText}\u201d appears to use title case or all-caps. ` +
      `Per the SimplerNOFOs style guide, caption text should use sentence case \u2014 ` +
      `capitalize only the first word and proper nouns.`,
    instructionOnly: true,
  } as Issue;
}

// ─── Exemption detection ──────────────────────────────────────────────────────

/**
 * Returns true when the (already lower-cased) heading text matches any of the
 * exempt-section patterns. Used to check both the section heading from the
 * parsed section tree and the nearest H1–H6 heading found by local DOM scan.
 *
 * Exempt heading patterns:
 *  - Application contents / table of contents
 *  - Standard forms / required forms
 *  - Application checklist
 *  - Merit review (catches "Merit review criteria (50 points)" etc.)
 *  - Review and selection / selection criteria
 *  - Reporting (any heading containing the word "reporting")
 */
function matchesExemptHeadingText(lower: string): boolean {
  return (
    /application\s+contents?/.test(lower) ||
    /table\s+of\s+contents/.test(lower) ||
    /standard\s+forms?/.test(lower) ||
    /required\s+forms?/.test(lower) ||
    /application\s+checklist/.test(lower) ||
    /merit\s+review/.test(lower) ||
    /review\s+(and\s+)?selection/.test(lower) ||
    /selection\s+criteria/.test(lower) ||
    /\breporting\b/.test(lower)
  );
}

/**
 * Returns the text content of the nearest H1–H6 element that precedes the
 * table as a preceding sibling, scanning up to MAX_HEADING_SCAN_SIBLINGS
 * elements back. Returns an empty string if no heading is found.
 *
 * This is intentionally a local sibling scan rather than using nearestHeading
 * from buildLocationLookup, because buildLocationLookup only tracks H1–H4 for
 * display-context purposes. The exemption signal must recognise H5/H6 as well.
 */
function findNearestHeadingText(table: Element): string {
  let el = table.previousElementSibling;
  let scanned = 0;
  while (el && scanned < MAX_HEADING_SCAN_SIBLINGS) {
    scanned++;
    if (/^h[1-6]$/i.test(el.tagName)) {
      return (el.textContent ?? '').trim();
    }
    el = el.previousElementSibling;
  }
  return '';
}

/**
 * Returns true when the table looks like an application checklist based on
 * structure alone: at least two rows whose first-column cell begins with a
 * checkbox glyph (◻ ☐ □ ☑ ☒). Used as a fallback when no heading signal
 * is present, ensuring checklist tables are exempt regardless of section naming.
 */
function looksLikeApplicationChecklist(table: Element): boolean {
  const CHECKBOX = /^[\s\u00a0]*[◻☐□☑☒]/;
  const rows = Array.from(table.querySelectorAll(':scope > tr, :scope > tbody > tr'));
  if (rows.length < 2) return false;
  let glyphCount = 0;
  for (const row of rows) {
    const firstCell = row.querySelector('td, th');
    if (firstCell && CHECKBOX.test(firstCell.textContent ?? '')) {
      glyphCount++;
    }
  }
  return glyphCount >= 2;
}

/**
 * Returns true if the table appears to be one of the types that are exempt
 * from the caption requirement per the SimplerNOFOs style guide:
 *  - Application contents tables
 *  - Standard forms tables (SF-424 etc.)
 *  - Application checklist tables
 *  - Merit review criteria tables (total and individual)
 *  - Reporting tables
 *  - Key facts / key dates tables
 *
 * Detection uses four independent signals; any one is sufficient:
 *  1. The section heading (from the parsed section tree) matches an exempt pattern.
 *  2. The nearest H1–H6 heading above the table (local sibling scan) matches an
 *     exempt pattern. This is a separate scan from buildLocationLookup, which only
 *     tracks H1–H4 and is used solely for issue display context.
 *  3. The table's first-row or first-cell text contains a known exempt identifier.
 *  4. The table's first column uses checkbox glyphs (◻ ☐ □ ☑ ☒) in at least two
 *     rows — structural signal for application checklist tables.
 */
function isExemptFromCaption(
  table: Element,
  sectionHeading: string,
  nearestH1H6Text: string
): boolean {
  // Signals 1 & 2: heading text (section heading or nearest H1–H6 in the DOM)
  if (
    matchesExemptHeadingText(sectionHeading.toLowerCase()) ||
    matchesExemptHeadingText(nearestH1H6Text.toLowerCase())
  ) {
    return true;
  }

  // Signal 3: table first-row / first-cell content
  const firstCellText = (table.querySelector('td, th')?.textContent ?? '').toLowerCase();
  const firstRowText = (table.querySelector('tr')?.textContent ?? '').toLowerCase();
  if (
    /key\s+facts/.test(firstCellText) ||
    /key\s+dates/.test(firstCellText) ||
    /key\s+facts/.test(firstRowText) ||
    /key\s+dates/.test(firstRowText) ||
    /merit\s+review\s+criteri/.test(firstRowText) ||
    /maximum\s+points?/.test(firstRowText) ||
    /total\s+points?/.test(firstRowText) ||
    /application\s+checklist/.test(firstRowText) ||
    /report\s+type/.test(firstRowText) ||
    /sf.?424/.test(firstRowText) ||
    /standard\s+form\s+\d/.test(firstRowText)
  ) {
    return true;
  }

  // Signal 4: checkbox glyph structure (application checklist)
  return looksLikeApplicationChecklist(table);
}

/**
 * Returns true when a heading (h1–h6) precedes the table with ≤ 50 words of body
 * text between them. In this pattern the heading serves as the table's label.
 *
 * Example: <h2>Key dates</h2> → <p>The following dates apply.</p> → <table>
 *   Heading found above, 1 short paragraph between them → skip.
 *
 * Scans backward up to MAX_HEADING_SCAN_SIBLINGS preceding siblings, with an
 * additional early exit once the accumulated word count exceeds 50 words. The
 * sibling cap prevents worst-case O(n²) behavior across many tables in documents
 * with large stretches of low-text elements before a table that has no nearby
 * heading; the word-count exit avoids scanning the cap on normal text-heavy
 * content.
 */
const MAX_HEADING_SCAN_SIBLINGS = 20;

function hasNearbyHeadingCaption(table: Element): boolean {
  let interveningWords = 0;
  let siblingsScanned = 0;
  let el = table.previousElementSibling;

  while (el && siblingsScanned < MAX_HEADING_SCAN_SIBLINGS) {
    siblingsScanned++;

    if (/^h[1-6]$/i.test(el.tagName)) {
      // Found a heading — accept it if the accumulated body text is ≤ 50 words
      return interveningWords <= 50;
    }

    const text = (el.textContent ?? '').trim();
    if (text) {
      interveningWords += text.split(/\s+/).length;
    }

    // Stop early once word count exceeds threshold — no heading at this distance qualifies
    if (interveningWords > 50) return false;

    el = el.previousElementSibling;
  }

  return false;
}

function findSectionForElement(el: Element, doc: ParsedDocument): Section | undefined {
  const text = (el.textContent ?? '').slice(0, 50);
  return doc.sections.find(section => section.rawText.includes(text));
}

export default TABLE_002;
