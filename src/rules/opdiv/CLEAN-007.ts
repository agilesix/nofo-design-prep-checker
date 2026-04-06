import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-007: Remove CDC/DGHT editorial scaffolding (auto-apply)
 *
 * Some CDC/DGHT content guide documents begin with editorial instructions
 * (color-coding guide, template notes, a content-guide reference table) that
 * are not part of the NOFO content itself. This rule detects that preamble by
 * checking whether the document's first paragraph begins with the phrase
 * "Here is the color coding for the doc:" and, when found, silently removes
 * everything from the start of the document up to — but not including — the
 * H2 heading "Step 1: Review the Opportunity".
 *
 * Scoped to CDC/DGHT content guides only (cdc-dght-ssj, cdc-dght-competitive).
 */
const CLEAN_007: Rule = {
  id: 'CLEAN-007',
  autoApply: true,
  contentGuideIds: ['cdc-dght-ssj', 'cdc-dght-competitive'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Trigger: first paragraph must begin with the color-coding instructions phrase.
    const firstPara = htmlDoc.querySelector('p');
    if (!firstPara) return [];

    const firstParaText = (firstPara.textContent ?? '').trim().toLowerCase();
    if (!firstParaText.startsWith('here is the color coding for the doc:')) return [];

    // Safety: only remove if the Step 1 heading is present to anchor the cut point.
    const headings = Array.from(htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const hasStep1 = headings.some(
      h => (h.textContent ?? '').trim().toLowerCase().startsWith('step 1')
    );
    if (!hasStep1) return [];

    return [
      {
        ruleId: 'CLEAN-007',
        description: 'CDC/DGHT editorial instructions removed from beginning of document.',
        targetField: 'struct.dght.removescaffolding',
      },
    ];
  },
};

export default CLEAN_007;
