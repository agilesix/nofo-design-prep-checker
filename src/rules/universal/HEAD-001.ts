import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-001: Heading capitalization
 *
 * Per the SimplerNOFOs style guide:
 *   H1  — title case; not checked (rule is silent on H1).
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
 *   • First word of the heading (always capitalised in both styles).
 *   • First word after a colon within the heading (sentence restart).
 *   • Minor words: articles (a/an/the), short prepositions, conjunctions.
 *   • ALL-CAPS words and words without lowercase letters: acronyms (CDC, HRSA),
 *     form names (SF-424), and other all-cap tokens are skipped entirely.
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
 */
function isSkippable(word: string): boolean {
  if (MINOR_WORDS.has(word.toLowerCase())) return true;
  if (!/[a-z]/.test(word)) return true; // ALL CAPS / numeric / punctuation-only
  return false;
}

/**
 * Indices of "sentence start" words within the word array.
 * Index 0 is always a sentence start.  Any word immediately following a word
 * that ends with a colon is also a sentence start (e.g. "Background: Why this").
 */
function sentenceStartIndices(words: string[]): Set<number> {
  const starts = new Set<number>([0]);
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
  for (let i = 0; i < words.length; i++) {
    if (starts.has(i)) continue;
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
 */
function toTitleCase(text: string): string {
  const words = text.trim().split(/\s+/);
  const starts = sentenceStartIndices(words);

  return words.map((word, i) => {
    const clean = word.replace(/^[^a-zA-Z0-9]+/, '');

    // Sentence starts (first word, word after colon): always capitalize
    if (starts.has(i)) {
      return capitalizeFirst(word);
    }

    // No alphabetic content → leave unchanged
    if (!clean) return word;

    // Minor word → leave lowercase
    if (MINOR_WORDS.has(clean.toLowerCase())) return word;

    // ALL-CAPS word (acronym like HRSA, CDC) → leave unchanged
    if (!/[a-z]/.test(clean)) return word;

    // Already capitalized (proper noun or mid-sentence cap) → leave unchanged
    if (/^[A-Z]/.test(clean)) return word;

    // Lowercase content word → capitalize
    return capitalizeFirst(word);
  }).join(' ');
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
    const headings = Array.from(htmlDoc.querySelectorAll('h2, h3, h4, h5, h6'));

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
            `The H${level} heading "${text}" appears to use title case. ` +
            `Per the SimplerNOFOs style guide, H3–H6 headings use sentence case (capitalize only the first word and proper nouns). ` +
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
        description: `${count} H2 heading${count === 1 ? '' : 's'} corrected to title case`,
        targetField: 'heading.h2.titlecase',
        value: JSON.stringify(h2Corrections),
      } as AutoAppliedChange);
    }

    return results;
  },
};

export default HEAD_001;
