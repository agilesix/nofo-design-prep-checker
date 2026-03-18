import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-007: Required "Before You Begin" section (HRSA guides)
 */
const STRUCT_007: Rule = {
  id: 'STRUCT-007',
  contentGuideIds: ['hrsa-bhw', 'hrsa-bphc', 'hrsa-construction', 'hrsa-mchb', 'hrsa-rr'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSection = doc.sections.some(section =>
      section.heading.toLowerCase().includes('before you begin')
    );

    if (!hasSection) {
      issues.push({
        id: 'STRUCT-007-missing',
        ruleId: 'STRUCT-007',
        title: 'Required "Before You Begin" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'HRSA NOFOs require a "Before You Begin" section at the start of the document. This section was not detected.',
        suggestedFix: 'Verify that the document contains a "Before You Begin" section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_007;
