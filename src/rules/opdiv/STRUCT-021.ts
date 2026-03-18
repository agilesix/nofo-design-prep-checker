import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-021: CDC Research — Required "eRA Commons" section or reference
 */
const STRUCT_021: Rule = {
  id: 'STRUCT-021',
  contentGuideIds: ['cdc-research'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasEraReference = doc.rawText.toLowerCase().includes('era commons') ||
      doc.sections.some(section =>
        section.rawText.toLowerCase().includes('era commons')
      );

    if (!hasEraReference) {
      issues.push({
        id: 'STRUCT-021-missing',
        ruleId: 'STRUCT-021',
        title: 'eRA Commons reference not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'CDC Research NOFOs typically include an eRA Commons section or reference. This was not detected in the document.',
        suggestedFix: 'Verify whether an eRA Commons section is required for this CDC research NOFO.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_021;
