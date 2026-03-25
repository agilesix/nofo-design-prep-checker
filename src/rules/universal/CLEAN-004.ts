import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-004: Collapse double spaces in body text (auto-apply)
 *
 * Scans paragraph-level text in the document for two or more consecutive
 * spaces between words. Silently collapses them to a single space.
 *
 * Excludes: headings (h1–h6), table cells (td/th), code/preformatted blocks.
 * Produces no output when zero instances are found.
 *
 * Note: double spaces that span adjacent Word runs (<w:t> node boundaries) are
 * not detected or corrected — this is a known limitation of per-run processing.
 */
const CLEAN_004: Rule = {
  id: 'CLEAN-004',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Guard: some runtimes may lack TreeWalker support; log and skip instead of silently succeeding
    if (typeof htmlDoc.createTreeWalker !== 'function') {
      console.warn(
        '[CLEAN-004] Skipping rule: document.createTreeWalker is not available in this runtime; results may be incomplete.'
      );
      return [];
    }

    const walker = htmlDoc.createTreeWalker(
      htmlDoc.body ?? htmlDoc,
      NodeFilter.SHOW_TEXT
    );

    let count = 0;
    let node: Node | null;

    while ((node = walker.nextNode()) !== null) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (!parent) continue;

      // Skip headings
      if (parent.closest('h1, h2, h3, h4, h5, h6')) continue;

      // Skip table cells
      if (parent.closest('td, th')) continue;

      // Skip code/preformatted blocks
      if (parent.closest('code, pre')) continue;

      const text = textNode.textContent ?? '';
      const matches = text.match(/ {2,}/g);
      if (matches) {
        count += matches.length;
      }
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-004',
        description: `Double spaces corrected — ${count} instance(s) collapsed to single spaces.`,
        targetField: 'text.doublespace',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_004;
