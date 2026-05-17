import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-022: Normalize "NOTE:" to "Note:" in SAMHSA NOFOs (auto-apply)
 *
 * Some SAMHSA NOFOs use "NOTE:" in all-caps in body text. This rule
 * replaces every occurrence of the exact string "NOTE:" with "Note:" in
 * paragraph body text. The match is case-sensitive — only the all-caps form
 * "NOTE:" is corrected; "Note:" and "note:" are left unchanged. Heading-style
 * paragraphs are not modified.
 *
 * Scoped to SAMHSA content guide only.
 */
const CLEAN_022: Rule = {
  id: 'CLEAN-022',
  autoApply: true,
  contentGuideIds: ['samhsa'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const bodyText = Array.from(htmlDoc.body.querySelectorAll('p, li, td, th'))
      .map(el => el.textContent ?? '')
      .join('\n');

    if (!bodyText.includes('NOTE:')) return [];

    return [
      {
        ruleId: 'CLEAN-022',
        description: '"NOTE:" normalized to "Note:".',
        targetField: 'samhsa.note.capitalize',
      },
    ];
  },
};

export default CLEAN_022;
