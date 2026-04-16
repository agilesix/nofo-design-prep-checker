import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';
import { COMPONENT_LABEL_WORDS } from '../../constants';

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
        // Only suggest sentence case when the paragraph is caption-like (≤ 10 words,
        // not ending with ':', not containing '[PDF]'). Body text paragraphs that
        // happen to precede a table are not captions and should never be flagged.
        // Tables in exempt sections or near a form-identifier heading (PHS 398,
        // SF-424, etc.) are also fully exempt from the sentence case check.
        if (looksLikeCaption(prevText) && looksLikeTitleOrAllCaps(prevText)) {
          if (!isExemptByCheapSignals(table, sectionHeading)) {
            const { nearestHeadingText } = scanBackwardForHeading(table);
            if (!matchesExemptHeadingText(nearestHeadingText.toLowerCase())) {
              issues.push(makeSentenceCaseSuggestion(`TABLE-002-sc-${index}`, prevText, sectionId, nearestHeading));
            }
          }
        }
        return;
      }

      // ── Other exempt table types — cheap signals (no DOM scan) ────────────────
      // Section heading, first-row/cell content, and checkbox glyphs are checked
      // before the backward scan. Tables that match any of these signals never
      // pay the cost of a sibling traversal.
      if (isExemptByCheapSignals(table, sectionHeading)) return;

      // ── Backward scan ──────────────────────────────────────────────────────────
      // Only reaches here when cheap signals did not exempt the table.
      // One traversal yields both the nearest H1–H6 heading text (for the DOM
      // heading exemption signal immediately below) and whether it falls within
      // 50 words of the table (for the caption-substitute check).
      const { nearestHeadingText, nearbyHeadingCaption } = scanBackwardForHeading(table);

      // ── DOM heading exemption signal ───────────────────────────────────────────
      if (matchesExemptHeadingText(nearestHeadingText.toLowerCase())) return;

      // ── Nearby heading caption substitute ─────────────────────────────────────
      // A heading preceding the table with ≤ 50 words of body text between them
      // serves as a caption substitute — common NOFO pattern:
      // heading → short intro sentence(s) → table.
      if (nearbyHeadingCaption) return;

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
 * Labeled component reference words: when one of these words is immediately
 * followed by a single uppercase letter (A–Z) or digit, the pair is treated as
 * a proper label (e.g. "Component A", "Appendix B", "Figure 3") and the label
 * word is not counted as title-case evidence.
 *
 * Derived from COMPONENT_LABEL_WORDS so it cannot diverge from HEAD-001's list.
 */
const COMPONENT_LABEL_RE = new RegExp(
  `^(${COMPONENT_LABEL_WORDS.join('|')})$`,
  'i',
);

/**
 * Returns true when the caption text appears to use title case or all-caps rather
 * than the sentence case recommended by the SimplerNOFOs style guide.
 *
 * Heuristic: after stripping an optional "Table:" prefix, first detect captions
 * that are entirely all-caps (including single-word captions such as "TIMELINE").
 * Otherwise, scan words after the first substantial word; if any starts with an
 * uppercase letter AND contains at least one lowercase letter, the text is likely
 * title case.
 *
 * Exemptions (not counted as title-case evidence):
 *   • All-caps words (PDF, CDC, HRSA) — treated as acronyms.
 *   • Single-letter words (e.g. "A", "I") — appear in both case styles.
 *   • Labeled component references: a label word (Component, Table, Appendix,
 *     Figure, Exhibit, Part, Attachment, Section) immediately followed by a
 *     single uppercase letter or digit — e.g. "Component A", "Appendix B".
 */
function looksLikeTitleOrAllCaps(text: string): boolean {
  // Strip optional "Table:" prefix (e.g. "Table: Program Timeline" → "Program Timeline")
  const body = text.replace(/^table\s*:\s*/i, '').trim();
  if (!body) return false;

  // Explicitly catch all-caps captions, including single-word captions such as "TIMELINE".
  // Require at least one letter so punctuation/numbers alone do not trigger.
  if (/[A-Z]/.test(body) && !/[a-z]/.test(body)) return true;

  const allWords = body.split(/\s+/);
  const bare = (w: string) =>
    w.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9]+$/, '');

  // Find the first substantial word (length > 1) — treated as the sentence start
  // and skipped in the title-case check.
  const firstSubstantial = allWords.findIndex(w => w.length > 1);
  if (firstSubstantial === -1) return false;

  for (let i = firstSubstantial + 1; i < allWords.length; i++) {
    const w = allWords[i] ?? '';
    // Single-letter words appear in both case styles — skip.
    if (w.length <= 1) continue;
    // Not a title-case word — skip.
    if (!/^[A-Z]/.test(w) || !/[a-z]/.test(w)) continue;
    // Labeled component reference: exempt when followed by a single uppercase
    // letter or digit (e.g. "Component A", "Appendix B", "Figure 3").
    if (COMPONENT_LABEL_RE.test(w)) {
      const nextBare = bare(allWords[i + 1] ?? '');
      if (/^[A-Z0-9]$/.test(nextBare)) continue;
    }
    return true;
  }

  return false;
}

/**
 * Returns true when a preceding paragraph's text looks like a genuine table
 * caption rather than introductory body text.
 *
 * A paragraph is treated as body text (not a caption) when any of the
 * following is true:
 *  - More than 10 words  — full sentences are body text, not labels
 *  - Ends with ":"       — introductory sentence ("See the table below:")
 *  - Contains "[PDF]"    — body text referencing an external document
 *
 * Note: this guard applies only to Tier 2 paragraph captions. <caption>
 * elements (Tier 1) are always genuine captions regardless of length.
 */
function looksLikeCaption(text: string): boolean {
  if (text.endsWith(':')) return false;
  if (/\[pdf\]/i.test(text)) return false;
  return text.trim().split(/\s+/).length <= 10;
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
    /\breporting\b/.test(lower) ||
    // Form identifiers in headings (e.g. "SF-424 Application for Federal
    // Assistance", "PHS 398 Research Strategy") — consistent with the
    // first-row content patterns in isExemptByCheapSignals.
    /sf.?424/.test(lower) ||
    /\bphs\s*398\b/.test(lower)
  );
}

interface HeadingScanResult {
  /** Text of the nearest preceding H1–H6 within the scan cap ('' if none found). */
  nearestHeadingText: string;
  /**
   * True when the nearest heading precedes the element with ≤ 50 words of body
   * text between them — in that case the heading serves as a caption substitute.
   */
  nearbyHeadingCaption: boolean;
}

/**
 * Maximum number of preceding siblings inspected by scanBackwardForHeading.
 * Applies to both the exemption-heading signal and the nearby-heading
 * caption-substitute signal, which share one traversal. This cap prevents
 * worst-case O(n²) behaviour when a document has many tables preceded by long
 * stretches of non-heading elements.
 */
const BACKWARD_SIBLING_SCAN_LIMIT = 20;

/**
 * Scans backward through preceding siblings (up to BACKWARD_SIBLING_SCAN_LIMIT)
 * to find the nearest H1–H6 heading above a table, returning both its text and
 * whether it is close enough (≤ 50 words of intervening body text) to qualify
 * as a caption substitute. Both signals are derived from one shared traversal.
 *
 * nearestHeadingText uses the full H1–H6 range rather than nearestHeading from
 * buildLocationLookup, which only tracks H1–H4 for issue display context. The
 * exemption signal must recognise H5/H6 as well.
 *
 * Example: <h2>Key dates</h2> → <p>The following dates apply.</p> → <table>
 *   → nearestHeadingText = "Key dates", nearbyHeadingCaption = true (≤ 50 words)
 */
function scanBackwardForHeading(table: Element): HeadingScanResult {
  let interveningWords = 0;
  let siblingsScanned = 0;
  let el = table.previousElementSibling;

  while (el && siblingsScanned < BACKWARD_SIBLING_SCAN_LIMIT) {
    siblingsScanned++;

    if (/^h[1-6]$/i.test(el.tagName)) {
      return {
        nearestHeadingText: (el.textContent ?? '').trim(),
        nearbyHeadingCaption: interveningWords <= 50,
      };
    }

    const text = (el.textContent ?? '').trim();
    if (text && interveningWords <= 50) {
      interveningWords += text.split(/\s+/).length;
    }

    el = el.previousElementSibling;
  }

  return { nearestHeadingText: '', nearbyHeadingCaption: false };
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
 * Returns true if the table is exempt based on signals that do not require a
 * backward sibling scan: the section heading, the table's own first-row/cell
 * content, and the checkbox glyph structure.
 *
 * The DOM heading signal (nearest H1–H6 above the table) is checked separately
 * in the call site after scanBackwardForHeading has already run for the
 * caption-substitute check, so no extra traversal is incurred.
 *
 * Exempt types detected here:
 *  - Application contents / table of contents (section heading)
 *  - Standard / required forms (section heading or first-row text)
 *  - Application checklist (section heading, first-row, or checkbox glyphs)
 *  - Merit review criteria (section heading or first-row text)
 *  - Reporting tables (section heading or first-row text)
 *  - Key facts / key dates tables (first-cell text)
 */
function isExemptByCheapSignals(table: Element, sectionHeading: string): boolean {
  // Section heading
  if (matchesExemptHeadingText(sectionHeading.toLowerCase())) return true;

  // First-row / first-cell content
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
  ) return true;

  // Checkbox glyph structure (application checklist)
  return looksLikeApplicationChecklist(table);
}

function findSectionForElement(el: Element, doc: ParsedDocument): Section | undefined {
  const text = (el.textContent ?? '').slice(0, 50);
  return doc.sections.find(section => section.rawText.includes(text));
}

export default TABLE_002;
