import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-008: Required "Trainee Eligibility" section (HRSA BHW, MCHB, RR guides)
 */
const STRUCT_008: Rule = {
  id: 'STRUCT-008',
  contentGuideIds: ['hrsa-bhw', 'hrsa-mchb', 'hrsa-rr'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSection = doc.sections.some(section =>
      section.heading.toLowerCase().includes('trainee eligibility') ||
      section.rawText.toLowerCase().includes('trainee eligibility')
    );

    if (!hasSection) {
      issues.push({
        id: 'STRUCT-008-missing',
        ruleId: 'STRUCT-008',
        title: 'Required "Trainee Eligibility" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This HRSA NOFO should contain a "Trainee Eligibility" section as required by the content guide. This section was not detected.',
        suggestedFix: 'Verify that the document contains the Trainee Eligibility section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_008;
