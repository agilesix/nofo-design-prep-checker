import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-006: Remove "Before You Begin" heading (HRSA NOFOs, auto-apply)
 *
 * NOFO Builder does not use a "Before You Begin" heading. This rule finds any
 * heading-level paragraph (h1–h6) whose text is exactly "Before You Begin"
 * and removes the heading element. The content that follows the heading is
 * left intact.
 *
 * Scoped to HRSA content guides only.
 */
const CLEAN_006: Rule = {
  id: 'CLEAN-006',
  autoApply: true,
  contentGuideIds: ['hrsa-bhw', 'hrsa-bphc', 'hrsa-construction', 'hrsa-mchb', 'hrsa-rr'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const headings = Array.from(
      htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    );

    const hasBeforeYouBegin = headings.some(
      h => h.textContent?.trim().toLowerCase() === 'before you begin'
    );

    if (!hasBeforeYouBegin) return [];

    return [
      {
        ruleId: 'CLEAN-006',
        description: 'Before You Begin heading removed — content preserved.',
        targetField: 'struct.byb.removeheading',
      },
    ];
  },
};

export default CLEAN_006;
