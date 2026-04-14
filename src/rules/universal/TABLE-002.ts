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
      // Compute context upfront — needed for both the suggestion and the warning.
      const section = findSectionForElement(table, doc);
      const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';
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

      // ── Single-cell tables (callout boxes) — exempt ────────────────────────────
      // Use :scope child combinators so cells inside nested tables are not counted.
      const directCells = table.querySelectorAll(
        ':scope > tr > td, :scope > tr > th,' +
        ':scope > tbody > tr > td, :scope > tbody > tr > th,' +
        ':scope > thead > tr > td, :scope > thead > tr > th,' +
        ':scope > tfoot > tr > td, :scope > tfoot > tr > th'
      );
      if (directCells.length === 1) return;

      // ── Other exempt table types ───────────────────────────────────────────────
      if (isExemptFromCaption(table, sectionHeading)) return;

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
 * uppercase letter, the text is likely title case.
 *
 * Single-letter words (e.g. "A", "I") are excluded from the title-case check
 * because they appear in both sentence case and title case.
 *
 * Note: proper nouns in sentence case will also trigger this check. Since the
 * result is a suggestion-only instruction-only issue, false positives are
 * acceptable.
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
  // Title case: any word after the first starts with an uppercase letter
  return words.slice(1).some(w => /^[A-Z]/.test(w));
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
 * Returns true if the table appears to be one of the types that are exempt
 * from the caption requirement per the SimplerNOFOs style guide:
 *  - Application contents tables
 *  - Standard forms tables  (SF-424 etc.)
 *  - Application checklist tables
 *  - Merit review criteria tables (total and individual)
 *  - Reporting tables
 *
 * Detection checks the section heading the table is in and the table's
 * first-row text. Either signal alone is sufficient to suppress the warning.
 */
function isExemptFromCaption(table: Element, sectionHeading: string): boolean {
  const heading = sectionHeading.toLowerCase();

  if (
    /application\s+contents?/.test(heading) ||
    /table\s+of\s+contents/.test(heading) ||
    /standard\s+forms?/.test(heading) ||
    /required\s+forms?/.test(heading) ||
    /application\s+checklist/.test(heading) ||
    /merit\s+review/.test(heading) ||
    /review\s+(and\s+)?selection/.test(heading) ||
    /selection\s+criteria/.test(heading) ||
    /reporting\s+requirements?/.test(heading) ||
    /post.?award\s+reporting/.test(heading)
  ) {
    return true;
  }

  // Table first-row / first-cell content signals
  const firstCellText = (table.querySelector('td, th')?.textContent ?? '').toLowerCase();
  const firstRowText = (table.querySelector('tr')?.textContent ?? '').toLowerCase();
  return (
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
  );
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
