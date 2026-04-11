import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-001: Heading capitalization
 *
 * Per the SimplerNOFOs style guide:
 *   H1  — title case; not checked (rule is silent on H1).
 *   H2  — must use title case; flagged if sentence case is detected.
 *   H3–H6 — must use sentence case; flagged if title case is detected.
 *
 * Detection:
 *   Title case  — one or more non-first, non-minor, non-acronym words start with
 *                 an uppercase letter.
 *   Sentence case — one or more non-first, non-minor, non-acronym words start
 *                   with a lowercase letter.
 *
 * Exceptions (not flagged):
 *   • First word of the heading (always capitalised in both styles).
 *   • First word after a colon within the heading (sentence restart).
 *   • Minor words: articles (a/an/the), short prepositions, conjunctions.
 *   • ALL-CAPS words and words without lowercase letters: acronyms (CDC, HRSA),
 *     form names (SF-424), and other all-cap tokens are skipped entirely.
 *
 * Because proper nouns and formal names cannot be detected reliably, the rule
 * emits suggestion-severity issues only — the user must confirm whether the
 * capitalization is correct before acting.  No auto-fix is provided; corrections
 * must be made in the Word document.
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

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

const HEAD_001: Rule = {
  id: 'HEAD-001',
  autoApply: false,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const headings = Array.from(htmlDoc.querySelectorAll('h2, h3, h4, h5, h6'));

    headings.forEach((heading, idx) => {
      const level = parseInt(heading.tagName[1] ?? '0', 10);
      const text = (heading.textContent ?? '').trim();
      if (!text) return;

      const sectionId = findSectionForElement(heading, doc);
      const exceptionNote =
        'Exceptions include proper nouns, names of organizations, programs, laws, forms (e.g. SF-424), ' +
        'and acronyms. If this heading is intentionally capitalised this way, you can dismiss this suggestion. ' +
        'Correct the capitalization in your Word document if needed — this rule does not auto-fix.';

      if (level === 2 && looksLikeSentenceCase(text)) {
        issues.push({
          id: `HEAD-001-${idx}`,
          ruleId: 'HEAD-001',
          title: 'H2 heading may need title case',
          severity: 'suggestion',
          sectionId,
          nearestHeading: text,
          description:
            `The H2 heading "${text}" appears to use sentence case. ` +
            `Per the SimplerNOFOs style guide, H2 headings use title case (capitalize all major words). ` +
            `H3–H6 headings use sentence case (capitalize only the first word and proper nouns). ` +
            exceptionNote,
          instructionOnly: true,
        });
      } else if (level >= 3 && looksLikeTitleCase(text)) {
        issues.push({
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
        });
      }
    });

    return issues;
  },
};

export default HEAD_001;
