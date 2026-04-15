import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-001: Heading capitalization
 *
 * Per the SimplerNOFOs style guide:
 *   H1  — excluded from general capitalization enforcement (no auto-fix, no style suggestion).
 *          The capitalized-"Form" check (see below) still applies to H1 headings.
 *   H2  — must use title case; auto-fixed silently when sentence case is detected.
 *   H3–H6 — must use sentence case; flagged as a suggestion if title case is detected.
 *
 * Detection:
 *   Title case  — one or more non-first, non-minor, non-acronym words start with
 *                 an uppercase letter.
 *   Sentence case — one or more non-first, non-minor, non-acronym words start
 *                   with a lowercase letter.
 *
 * Exceptions (not flagged and not auto-fixed):
 *   • Headings that reference federal laws, acts, or directives (see isFederalLawException).
 *   • Headings containing form identifiers (SF-424, PHS 398, R&R, etc.) are exempt from
 *     the general capitalization check — their capitalization is intentional. The "Form"
 *     capitalization check (see below) still applies to these headings.
 *   • Headings containing federal grants system names (eRA Commons, Grants.gov, SAM.gov,
 *     USASpending.gov, PaymentManagement.gov, GrantSolutions) are exempt from the general
 *     capitalization check — these proper names use non-standard casing by convention.
 *     The "Form" capitalization check still applies.
 *   • First word of the heading (always capitalised in both styles).
 *   • First word after a colon within the heading (sentence restart).
 *   • Minor words: articles (a/an/the), short prepositions, conjunctions.
 *   • ALL-CAPS words and words without lowercase letters: acronyms (CDC, HRSA),
 *     form names (SF-424), and other all-cap tokens are skipped entirely.
 *   • Words starting with a lowercase letter followed by uppercase (e.g. "eRA") are
 *     treated as intentional mixed-case proper nouns and skipped at the word level.
 *
 * Additional check — capitalized "Form" (H1–H6):
 *   If the word "Form" (capital F) appears in any non-first-word position, a
 *   suggestion-level instruction-only issue is emitted. Per the SimplerNOFOs style
 *   guide, "form" should be lowercase when it follows a form name — for example,
 *   "SF-424 application form" not "SF-424 Application Form".
 *
 * H2 auto-fix title case rules (applied when sentence case is detected):
 *   • Capitalize the first word always.
 *   • Capitalize the first word after a colon.
 *   • Capitalize all other words EXCEPT minor words (MINOR_WORDS set).
 *   • Leave ALL-CAPS words unchanged (acronyms like HRSA, CDC).
 *   • Leave already-capitalized words unchanged (likely proper nouns).
 *   • Only one AutoAppliedChange is emitted per run, covering all corrected H2s.
 */

/** Articles, short conjunctions, and prepositions that stay lowercase in title case. */
const MINOR_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as',
  'from', 'into', 'with', 'over', 'upon', 'via',
]);

/**
 * Returns true when the word should be skipped during capitalization checks:
 *   • Minor/function word (always lowercase regardless of style)
 *   • No lowercase letters (ALL CAPS acronym, number, or special character only)
 *   • Starts with a lowercase letter and contains an uppercase letter — intentional
 *     mixed-case proper nouns like "eRA" that must not be capitalized or treated as
 *     sentence-case evidence
 *
 * Trailing punctuation (e.g. "and,", "of.") is stripped before the MINOR_WORDS
 * lookup so that punctuation attached to a word does not prevent recognition.
 */
function isSkippable(word: string): boolean {
  const stripped = word.replace(/[^a-zA-Z0-9]+$/, '');
  if (MINOR_WORDS.has(stripped.toLowerCase())) return true;
  if (!/[a-z]/.test(word)) return true; // ALL CAPS / numeric / punctuation-only
  // Intentional mixed-case proper nouns (e.g. "eRA"): lowercase start + uppercase mid
  if (/^[a-z]/.test(stripped) && /[A-Z]/.test(stripped)) return true;
  return false;
}

/**
 * Indices of "sentence start" words within the word array.
 * Index 0 is always a sentence start.  Any word immediately following a word
 * that ends with a colon is also a sentence start (e.g. "Background: Why this").
 *
 * Additionally, if the heading starts with non-alphabetic tokens (numbers,
 * parenthetical references such as "(c)(3)", etc.), the first token that begins
 * with a bare letter is also treated as a sentence start. This prevents a word
 * like "Non-profit" in "501 (c)(3) Non-profit" from being counted as a
 * mid-heading capitalised word when it is actually the first meaningful word.
 */
function sentenceStartIndices(words: string[]): Set<number> {
  const starts = new Set<number>([0]);

  // If leading tokens are purely non-alphabetic (e.g. "501", "(c)(3)"), treat
  // the first token that starts with a letter as an additional sentence start.
  const firstAlpha = words.findIndex(w => /^[a-zA-Z]/.test(w));
  if (firstAlpha > 0) starts.add(firstAlpha);

  for (let i = 0; i < words.length - 1; i++) {
    if ((words[i] ?? '').trimEnd().endsWith(':')) starts.add(i + 1);
  }
  return starts;
}

/**
 * Returns true if the heading appears to use title case:
 * at least one non-sentence-start, non-skippable word begins with uppercase.
 * Used to detect title case in H3–H6 headings (which should use sentence case).
 */
function looksLikeTitleCase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return false;
  const starts = sentenceStartIndices(words);
  const indigenousExempt = indigenousExemptPositions(words);
  for (let i = 0; i < words.length; i++) {
    if (starts.has(i)) continue;
    if (indigenousExempt.has(i)) continue;
    const clean = (words[i] ?? '').replace(/^[^a-zA-Z0-9]+/, '');
    if (!clean || isSkippable(clean)) continue;
    if (/^[A-Z]/.test(clean)) return true;
  }
  return false;
}

/**
 * Returns true if the heading appears to use sentence case:
 * at least one non-sentence-start, non-skippable word begins with lowercase.
 * Used to detect sentence case in H2 headings (which should use title case).
 */
function looksLikeSentenceCase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return false;
  const starts = sentenceStartIndices(words);
  for (let i = 0; i < words.length; i++) {
    if (starts.has(i)) continue;
    const clean = (words[i] ?? '').replace(/^[^a-zA-Z0-9]+/, '');
    if (!clean || isSkippable(clean)) continue;
    if (/^[a-z]/.test(clean)) return true;
  }
  return false;
}

/**
 * Capitalize the first alphabetic character of a word, leaving any leading
 * punctuation (e.g. opening quotes) in place.
 */
function capitalizeFirst(word: string): string {
  return word.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_, pre, letter) => pre + letter.toUpperCase());
}

/**
 * Convert a heading to title case using the SimplerNOFOs rules:
 *  • First word and first word after a colon are always capitalized.
 *  • Minor words (articles, short prepositions, conjunctions) stay lowercase.
 *  • ALL-CAPS words (acronyms) are left unchanged.
 *  • Already-capitalized words (likely proper nouns) are left unchanged.
 *  • All other words starting with lowercase are capitalized.
 *
 * Whitespace is preserved exactly (no normalization) so that the returned string
 * has the same length and character positions as the input. This is required for
 * the character-by-character OOXML patch in applyH2TitleCaseFix to stay aligned.
 */
function toTitleCase(text: string): string {
  // Split into alternating [word, separator, word, ...] tokens.
  // Even-index tokens are words; odd-index tokens are whitespace separators.
  const tokens = text.split(/(\s+)/);
  const wordTokens = tokens.filter((_, i) => i % 2 === 0);
  const starts = sentenceStartIndices(wordTokens);

  return tokens.map((token, i) => {
    // Whitespace separator — preserve as-is
    if (i % 2 !== 0) return token;

    const wordIdx = Math.floor(i / 2);
    // Strip both leading and trailing non-alphanumeric chars to get the bare word
    const clean = token
      .replace(/^[^a-zA-Z0-9]+/, '')
      .replace(/[^a-zA-Z0-9]+$/, '');

    // Sentence starts (first word, word after colon): always capitalize
    if (starts.has(wordIdx)) return capitalizeFirst(token);

    // No alphabetic content → leave unchanged
    if (!clean) return token;

    // Minor word → leave lowercase
    if (MINOR_WORDS.has(clean.toLowerCase())) return token;

    // ALL-CAPS word (acronym like HRSA, CDC) → leave unchanged
    if (!/[a-z]/.test(clean)) return token;

    // Intentional mixed-case proper noun (e.g. "eRA") → leave unchanged
    if (/^[a-z]/.test(clean) && /[A-Z]/.test(clean)) return token;

    // Already capitalized (proper noun or mid-sentence cap) → leave unchanged
    if (/^[A-Z]/.test(clean)) return token;

    // Lowercase content word → capitalize
    return capitalizeFirst(token);
  }).join('');
}

/**
 * Returns true when the heading references a known federal law, act, or
 * directive. Such headings may have unconventional capitalization (e.g. mixed
 * caps from a proper-noun name) and should never be flagged or auto-fixed.
 *
 * Recognized patterns:
 *  • Named federal laws (Paperwork Reduction Act, ADA, FOIA, etc.)
 *  • "Executive Order" anywhere in the heading
 *  • "Act of" or "Act," — common law-name patterns
 *  • "Section N" — statutory section references (Section 508, Section 1557, etc.)
 */
function isFederalLawException(text: string): boolean {
  const lower = text.toLowerCase();

  const namedLaws = [
    'paperwork reduction act',
    'plain writing act',
    'rehabilitation act',
    'americans with disabilities act',
    'freedom of information act',
    'privacy act',
    'administrative procedure act',
    'federal grant and cooperative agreement act',
    'uniform guidance',
  ];
  if (namedLaws.some(law => lower.includes(law))) return true;

  const lawAcronyms = [
    'ADA',
    'FOIA',
  ];
  if (lawAcronyms.some(acronym => new RegExp(`\\b${acronym}\\b`, 'i').test(text))) return true;
  if (/executive\s+order/i.test(text)) return true;
  if (/\bact\s+of\b/i.test(text) || /\bact,/i.test(text)) return true;
  if (/\bsection\s+\d+/i.test(text)) return true;

  return false;
}

/**
 * Returns true when the heading contains a recognizable form identifier such
 * as SF-424, SF-424A, SF-LLL, PHS 398, or R&R. Headings with form identifiers
 * use intentional capitalization and are exempt from the general heading
 * capitalization check (H2 auto-fix and H3–H6 sentence-case suggestion).
 *
 * Pattern: 2–4 uppercase letters followed by a hyphen or space and one or
 * more uppercase letters or digits (e.g. SF-424, SF-424A, SF-LLL, PHS 398).
 * R&R is matched explicitly due to its single-letter, ampersand-separated format.
 */
function isFormIdentifierHeading(text: string): boolean {
  if (/\b[A-Z]{2,4}[-\s][A-Z0-9]+\b/.test(text)) return true;
  if (/\bR&R\b/.test(text)) return true;
  return false;
}

/**
 * Returns true when the heading contains a federal grants system or portal
 * name that uses non-standard casing by convention. Such headings are exempt
 * from the general heading capitalization check (H2 auto-fix and H3–H6
 * sentence-case suggestion). The "Form" capitalization check still applies.
 *
 * Recognized names (matched case-insensitively):
 *   eRA Commons, Grants.gov, SAM.gov, USASpending.gov,
 *   PaymentManagement.gov, GrantSolutions
 */
function isFederalSystemException(text: string): boolean {
  return (
    /\bera\s+commons\b/i.test(text) ||
    /\bgrants\.gov\b/i.test(text) ||
    /\bsam\.gov\b/i.test(text) ||
    /\busaspending\.gov\b/i.test(text) ||
    /\bpaymentmanagement\.gov\b/i.test(text) ||
    /\bgrantsolutions\b/i.test(text)
  );
}

/**
 * Returns the set of word-array indices covered by a recognized Native American
 * or Indigenous proper-noun term per IHS style guide and federal usage
 * conventions. looksLikeTitleCase skips these positions so their
 * capitalization is not treated as title-case evidence; other capitalised words
 * in the same heading are still flagged normally.
 *
 * Phrase matching is longest-first so that "Urban Indian Organizations" (3
 * tokens) is matched before the 2-token "Indian Tribes" fallback, and both
 * are matched before the single-token "Indian" fallback.
 *
 * Recognized single-word terms: Indian, Tribe, Tribes, Tribal
 * Recognized multi-word phrases: Indian Tribes · Tribal Organizations ·
 *                                 Urban Indian Organizations
 *
 * AI/AN is omitted: it contains no lowercase letters and is already treated
 * as skippable by isSkippable (ALL-CAPS / no-lowercase rule).
 *
 * Possessive normalization: bare() strips leading/trailing punctuation and
 * then removes a trailing possessive suffix (\u2018s / \u2019s / 's) so that
 * "Tribe's", "Tribal\u2019s", etc. resolve to their base form before
 * comparison. (The plural-possessive "Tribes'" is already handled by the
 * trailing-punctuation strip since the apostrophe is the final character.)
 */
function indigenousExemptPositions(words: string[]): Set<number> {
  const exempt = new Set<number>();
  const bare = (w: string) =>
    w.replace(/^[^a-zA-Z0-9]+/, '')
     .replace(/[^a-zA-Z0-9]+$/, '')
     .replace(/['\u2018\u2019]s$/i, '');

  for (let i = 0; i < words.length; i++) {
    const w0 = bare(words[i] ?? '');
    const w1 = bare(words[i + 1] ?? '');
    const w2 = bare(words[i + 2] ?? '');

    if (w0 === 'Urban' && w1 === 'Indian' && w2 === 'Organizations') {
      exempt.add(i); exempt.add(i + 1); exempt.add(i + 2);
    } else if (w0 === 'Indian' && w1 === 'Tribes') {
      exempt.add(i); exempt.add(i + 1);
    } else if (w0 === 'Tribal' && w1 === 'Organizations') {
      exempt.add(i); exempt.add(i + 1);
    } else if (w0 === 'Indian' || w0 === 'Tribe' || w0 === 'Tribes' || w0 === 'Tribal') {
      exempt.add(i);
    }
  }

  return exempt;
}

/**
 * Returns true when the word "Form" (capital F) appears in any position
 * other than as the first word of the heading.
 *
 * Per the SimplerNOFOs style guide, "form" should be lowercase when it
 * follows a form name (e.g. "SF-424 application form", not
 * "SF-424 Application Form").
 */
function hasCapitalizedFormMidHeading(text: string): boolean {
  const trimmed = text.trim();
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) return false; // single-word heading
  return /\bForm\b/.test(trimmed.slice(spaceIdx + 1));
}

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

const HEAD_001: Rule = {
  id: 'HEAD-001',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (Issue | AutoAppliedChange)[] {
    const results: (Issue | AutoAppliedChange)[] = [];
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const headings = Array.from(htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    // Collect H2 sentence-case corrections; a single AutoAppliedChange is
    // emitted after the loop so the count in the description is accurate.
    const h2Corrections: { old: string; new: string }[] = [];

    const exceptionNote =
      'Exceptions include proper nouns, names of organizations, programs, laws, forms (e.g. SF-424), ' +
      'and acronyms. If this heading is intentionally capitalised this way, you can dismiss this suggestion. ' +
      'Correct the capitalization in your Word document if needed — this rule does not auto-fix H3–H6 headings.';

    headings.forEach((heading, idx) => {
      const level = parseInt(heading.tagName[1] ?? '0', 10);
      const text = (heading.textContent ?? '').trim();
      if (!text) return;

      // Federal laws and directives are excluded from all checks and auto-fixes.
      if (isFederalLawException(text)) return;

      const sectionId = findSectionForElement(heading, doc);

      // ── Capitalized "Form" check (H1–H6) ─────────────────────────────────────
      // Flag when "Form" (capital F) appears in any non-first-word position.
      // Applies even to form-identifier headings (which are otherwise exempt).
      if (hasCapitalizedFormMidHeading(text)) {
        results.push({
          id: `HEAD-001-form-${idx}`,
          ruleId: 'HEAD-001',
          title: '\u201cForm\u201d may need to be lowercase in heading',
          severity: 'suggestion',
          sectionId,
          nearestHeading: text,
          description:
            `The word \u201cForm\u201d appears capitalized in this heading. ` +
            `Per the SimplerNOFOs style guide, \u201cform\u201d should be lowercase when it follows a form name \u2014 ` +
            `for example, \u201cSF-424 application form\u201d not \u201cSF-424 Application Form\u201d. ` +
            `Correct in your Word document if needed.`,
          instructionOnly: true,
        } as Issue);
      }

      // ── General capitalization check ──────────────────────────────────────────
      // H1 is not checked. Headings with form identifiers (SF-424, PHS 398, R&R)
      // or federal grants system names (eRA Commons, Grants.gov, etc.) are exempt
      // from the general cap check — their capitalization is intentional.
      if (level === 1 || isFormIdentifierHeading(text) || isFederalSystemException(text)) return;

      if (level === 2 && looksLikeSentenceCase(text)) {
        const corrected = toTitleCase(text);
        if (corrected !== text) {
          h2Corrections.push({ old: text, new: corrected });
        }
      } else if (level >= 3 && looksLikeTitleCase(text)) {
        results.push({
          id: `HEAD-001-${idx}`,
          ruleId: 'HEAD-001',
          title: `H${level} heading may need sentence case`,
          severity: 'suggestion',
          sectionId,
          nearestHeading: text,
          description:
            `The H${level} heading \u201c${text}\u201d appears to use title case. ` +
            `Per the SimplerNOFOs style guide, H3\u2013H6 headings use sentence case (capitalize only the first word and proper nouns). ` +
            `H2 headings use title case. ` +
            exceptionNote,
          instructionOnly: true,
        } as Issue);
      }
    });

    if (h2Corrections.length > 0) {
      const count = h2Corrections.length;
      results.push({
        ruleId: 'HEAD-001',
        description: `${count} H2 heading${count === 1 ? '' : 's'} corrected to title case.`,
        targetField: 'heading.h2.titlecase',
        value: JSON.stringify(h2Corrections),
      } as AutoAppliedChange);
    }

    return results;
  },
};

export default HEAD_001;
