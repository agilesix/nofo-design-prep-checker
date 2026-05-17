import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-020: Remove SAMHSA H1 divider lines (auto-apply)
 *
 * Some SAMHSA NOFOs contain H1 paragraphs used as visual dividers whose text
 * consists entirely of underscore characters and/or whitespace (e.g.,
 * "_________________________________"). These cause import issues in NOFO
 * Builder and must be removed.
 *
 * Only H1 divider paragraphs that appear at or after the first H1 whose text
 * starts with "Step 1:" (case-insensitive) are removed. All other H1
 * paragraphs — including their text, style, bookmarks, and anchor links —
 * are preserved.
 *
 * Scoped to SAMHSA content guide only.
 */
const CLEAN_020: Rule = {
  id: 'CLEAN-020',
  autoApply: true,
  contentGuideIds: ['samhsa'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const bodyChildren = Array.from(htmlDoc.body.children);

    const step1Idx = bodyChildren.findIndex(
      el =>
        el.tagName.toLowerCase() === 'h1' &&
        (el.textContent ?? '').trim().toLowerCase().startsWith('step 1:')
    );

    if (step1Idx === -1) return [];

    const hasDividers = bodyChildren.slice(step1Idx).some(el => {
      if (el.tagName.toLowerCase() !== 'h1') return false;
      const trimmed = (el.textContent ?? '').trim();
      return /^[_\s]+$/.test(trimmed) && trimmed.includes('_');
    });

    if (!hasDividers) return [];

    return [
      {
        ruleId: 'CLEAN-020',
        description: 'SAMHSA H1 divider lines removed.',
        targetField: 'samhsa.h1.dividers.remove',
      },
    ];
  },
};

export default CLEAN_020;
