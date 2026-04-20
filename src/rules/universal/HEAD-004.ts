import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-004: Heading may be too long (suggestion)
 *
 * Per WCAG 2.0 G130, headings should be descriptive and concise. Flags H3–H6
 * headings that exceed 10 words or 80 characters. H1 (NOFO title) and H2
 * (step titles) are excluded — their length is driven by content requirements.
 *
 * Headings that appear to be entirely a proper noun phrase (every significant
 * word starts with an uppercase letter) are also excluded — long organization
 * names are not heading length violations.
 *
 * When flagged, a text input pre-filled with the current heading text is shown
 * so the user can enter a shorter replacement. The heading level (H3–H6) is
 * preserved exactly in the downloaded document; only the w:t text content is
 * updated.
 *
 * targetField: "heading.text.H{level}.{headingIndex}::{originalText}"
 * headingIndex is the 0-based ordinal among ALL headings in the document
 * (same counting used by HEAD-003 / applyHeadingLevelCorrections).
 */

const WORD_LIMIT = 10;
const CHAR_LIMIT = 80;

const CONNECTORS = new Set([
  'of', 'and', 'or', 'for', 'the', 'a', 'an', 'in', 'at', 'by', 'on',
  'to', 'with', 'from', 'into', 'onto', 'upon', 'via', 'but', 'nor',
  'so', 'yet', 'as',
]);

function isProperNounPhrase(text: string): boolean {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.every(word => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (clean.length === 0) return true;
    if (CONNECTORS.has(clean.toLowerCase())) return true;
    return /^[A-Z]/.test(clean);
  });
}

const HEAD_004: Rule = {
  id: 'HEAD-004',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const allHeadings = Array.from(htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    let headingIndex = 0;

    for (const heading of allHeadings) {
      const level = parseInt(heading.tagName[1] ?? '0', 10);
      const currentIndex = headingIndex++;

      if (level < 3) continue;

      const text = (heading.textContent ?? '').trim();
      if (!text) continue;

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const charCount = text.length;

      if (wordCount <= WORD_LIMIT && charCount <= CHAR_LIMIT) continue;

      if (isProperNounPhrase(text)) continue;

      const sectionId = (() => {
        for (const section of doc.sections) {
          if (section.rawText.includes(text)) return section.id;
        }
        return doc.sections[0]?.id ?? 'section-preamble';
      })();

      issues.push({
        id: `HEAD-004-${currentIndex}`,
        ruleId: 'HEAD-004',
        title: 'Heading may be too long',
        severity: 'suggestion',
        sectionId,
        nearestHeading: text,
        description:
          `The heading \u201c${text}\u201d is ${wordCount} word${wordCount === 1 ? '' : 's'} long. ` +
          `Per WCAG 2.0 G130, headings should be concise and descriptive. ` +
          `Consider shortening it to help users navigate and orient themselves within the document. ` +
          `Screen readers and assistive technology read the full heading text aloud.`,
        inputRequired: {
          type: 'text',
          label: 'Revised heading',
          fieldDescription: `Enter a shorter heading. The heading level (H${level}) will be preserved.`,
          prefill: text,
          targetField: `heading.text.H${level}.${currentIndex}::${text}`,
        },
      });
    }

    return issues;
  },
};

export default HEAD_004;
