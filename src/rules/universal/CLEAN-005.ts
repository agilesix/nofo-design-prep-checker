import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-005: Tagline relocation (auto-apply)
 *
 * Checks whether the document's tagline paragraph is positioned immediately
 * after the metadata block (i.e., as the last element before the first
 * heading). If not, silently moves it there. Also removes any duplicate
 * tagline paragraphs found elsewhere in the document.
 *
 * Only targets standalone tagline paragraphs (direct children of the body)
 * whose text begins with "Tagline:" — taglines embedded inside table cells
 * cannot be reliably relocated and are skipped.
 *
 * Skips silently when:
 *  - No standalone tagline paragraph is found
 *  - No headings are present (cannot determine metadata block boundary)
 *  - The tagline is already immediately before the first heading with no duplicates
 */
const CLEAN_005: Rule = {
  id: 'CLEAN-005',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Collect direct body children (p, table, h1–h6, ul, ol, …)
    const children = Array.from(htmlDoc.body.children);

    // Find standalone tagline <p> elements — not table-embedded cells.
    const taglineIndices: number[] = [];
    for (let i = 0; i < children.length; i++) {
      const el = children[i]!;
      if (el.tagName.toLowerCase() !== 'p') continue;
      const text = el.textContent?.trim() ?? '';
      if (/^tagline\s*:?/i.test(text)) {
        taglineIndices.push(i);
      }
    }

    if (taglineIndices.length === 0) return [];

    // Find the first heading element.
    const firstHeadingIdx = children.findIndex(el =>
      /^h[1-6]$/.test(el.tagName.toLowerCase())
    );
    if (firstHeadingIdx === -1) return [];

    const primaryTaglineIdx = taglineIndices[0]!;
    // Correct position: tagline is the element immediately before the first heading.
    const isInCorrectPosition = primaryTaglineIdx === firstHeadingIdx - 1;
    const hasDuplicates = taglineIndices.length > 1;

    if (isInCorrectPosition && !hasDuplicates) return [];

    return [
      {
        ruleId: 'CLEAN-005',
        description: 'Tagline relocated to follow metadata section.',
        targetField: 'struct.tagline.relocate',
      },
    ];
  },
};

export default CLEAN_005;
