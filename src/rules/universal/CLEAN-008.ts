import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-008: Remove leading spaces from heading text (auto-apply)
 *
 * Scans all heading elements (h1–h6) in the document for text content that
 * begins with one or more space characters. Silently removes all leading
 * spaces from any such heading.
 *
 * Only leading spaces are removed — trailing spaces and spaces within the
 * heading text are left intact. Applies to headings only; body paragraphs,
 * captions, list items, and other paragraph styles are unaffected.
 *
 * Produces no output when zero headings have leading spaces.
 */
const CLEAN_008: Rule = {
  id: 'CLEAN-008',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const headings = Array.from(
      htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    );

    let count = 0;
    for (const heading of headings) {
      const text = heading.textContent ?? '';
      if (text.length > 0 && text[0] === ' ') {
        count++;
      }
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-008',
        description: `Leading spaces removed from ${count} heading${count === 1 ? '' : 's'}.`,
        targetField: 'heading.leadingspace',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_008;
