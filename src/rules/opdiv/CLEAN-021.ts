import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-021: Fix "SAMSHA" misspelling in SAMHSA NOFOs (auto-apply)
 *
 * Some SAMHSA NOFOs contain the misspelling "SAMSHA" (missing the second H).
 * This rule replaces all occurrences of "SAMSHA" with "SAMHSA" in paragraph
 * body text. The match is case-sensitive — only the exact string "SAMSHA" is
 * corrected. Hyperlink URLs (relationship targets) and heading-style paragraphs
 * are not modified.
 *
 * Scoped to SAMHSA content guide only.
 */
const CLEAN_021: Rule = {
  id: 'CLEAN-021',
  autoApply: true,
  contentGuideIds: ['samhsa'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const bodyText = Array.from(htmlDoc.body.querySelectorAll('p, li, td, th'))
      .map(el => el.textContent ?? '')
      .join('\n');

    if (!bodyText.includes('SAMSHA')) return [];

    return [
      {
        ruleId: 'CLEAN-021',
        description: '"SAMSHA" corrected to "SAMHSA".',
        targetField: 'samhsa.misspelling.samsha',
      },
    ];
  },
};

export default CLEAN_021;
