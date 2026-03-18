import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-026: CDC Research — PHS 398 reference check
 */
const STRUCT_026: Rule = {
  id: 'STRUCT-026',
  contentGuideIds: ['cdc-research'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasPhs398 = doc.rawText.toLowerCase().includes('phs 398') ||
      doc.rawText.toLowerCase().includes('phs398');

    if (!hasPhs398) {
      issues.push({
        id: 'STRUCT-026-missing',
        ruleId: 'STRUCT-026',
        title: 'PHS 398 reference not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'CDC Research NOFOs typically include a PHS 398 reference. This was not detected.',
        suggestedFix: 'Verify whether a PHS 398 reference is required for this CDC research NOFO.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_026;
