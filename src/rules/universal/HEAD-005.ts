import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-005: Heading may be misformatted normal text (suggestion)
 *
 * Flags H3–H6 headings that exceed 20 words or 150 characters — lengths that
 * are strongly indicative of body text accidentally styled as a heading rather
 * than a genuine section title.
 *
 * Exceptions:
 *   • H1 and H2 are excluded (their length is content-driven).
 *   • Headings ending with a colon are excluded — these are intentional
 *     section labels regardless of length.
 *
 * Suppression: HEAD-004 (heading may be too long) is suppressed for any
 * heading that triggers HEAD-005 — only one rule fires per heading.
 *
 * When the user accepts, the paragraph style is changed from Heading N to
 * Normal in the downloaded docx. Only w:pStyle is updated; text content and
 * all run-level formatting are left untouched.
 *
 * targetField: "heading.style.H{level}.{headingIndex}::{originalText}"
 * headingIndex is the 0-based ordinal among ALL headings in the document
 * (same counting used by HEAD-003 / HEAD-004).
 */

const WORD_LIMIT = 20;
const CHAR_LIMIT = 150;

const HEAD_005: Rule = {
  id: 'HEAD-005',
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

      // Headings ending with a colon are intentional section labels
      if (text.trimEnd().endsWith(':')) continue;

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const charCount = text.length;

      if (wordCount <= WORD_LIMIT && charCount <= CHAR_LIMIT) continue;

      const sectionId = (() => {
        for (const section of doc.sections) {
          if (section.rawText.includes(text)) return section.id;
        }
        return doc.sections[0]?.id ?? 'section-preamble';
      })();

      const truncated = text.length > 60 ? `${text.slice(0, 60)}…` : text;

      issues.push({
        id: `HEAD-005-${currentIndex}`,
        ruleId: 'HEAD-005',
        title: 'Heading may be misformatted normal text',
        severity: 'suggestion',
        sectionId,
        nearestHeading: text,
        description:
          `The heading “${truncated}” is ${wordCount} word${wordCount === 1 ? '' : 's'} long. ` +
          `Headings this long are often normal text that was accidentally styled as a heading. ` +
          `If this text is meant to be a paragraph rather than a heading, accept the fix to change it to Normal style.`,
        targetField: `heading.style.H${level}.${currentIndex}::${text}`,
        acceptLabel: 'Change to normal text',
      } as Issue);
    }

    return issues;
  },
};

export default HEAD_005;
