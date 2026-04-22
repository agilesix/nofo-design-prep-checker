import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-002: Multiple H1 headings
 *
 * NOFO Builder requires exactly one H1 per document (the NOFO title).
 * Step titles should be styled as H2, not H1.
 *
 * Exception: HRSA guides — NOFO Builder auto-demotes HRSA H1 step titles,
 * so multiple H1s are expected and intentional in those documents.
 */

const HRSA_IDS = new Set([
  'hrsa-rr', 'hrsa-bhw', 'hrsa-bphc', 'hrsa-construction', 'hrsa-mchb',
]);

const HEAD_002: Rule = {
  id: 'HEAD-002',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    if (options.contentGuideId !== null && HRSA_IDS.has(options.contentGuideId)) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const h1Count = htmlDoc.querySelectorAll('h1').length;

    if (h1Count <= 1) return [];

    return [
      {
        id: 'HEAD-002-multi-h1',
        ruleId: 'HEAD-002',
        title: 'Document has more than one H1 heading',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description:
          'NOFO Builder requires exactly one H1 per document \u2014 the NOFO title. ' +
          'Step titles (e.g. \u2018Step 1: Review the Opportunity\u2019) should be styled as H2, not H1. ' +
          'Multiple H1 headings will cause accessibility issues in the final PDF.',
        suggestedFix:
          'In Word, open the Style Pane and change all Step title headings from Heading 1 to Heading 2. ' +
          'The NOFO title should be the only H1 in the document.',
        instructionOnly: true,
      },
    ];
  },
};

export default HEAD_002;
