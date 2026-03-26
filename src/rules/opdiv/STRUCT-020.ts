import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-020: HRSA BPHC — Required "Program Requirements" section
 */
const STRUCT_020: Rule = {
  id: 'STRUCT-020',
  contentGuideIds: ['hrsa-bphc'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSection = doc.sections.some(section =>
      section.heading.toLowerCase().includes('program requirements') ||
      section.heading.toLowerCase().includes('program requirement')
    );

    if (!hasSection) {
      issues.push({
        id: 'STRUCT-020-missing',
        ruleId: 'STRUCT-020',
        title: 'Required "Program Requirements" section not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'HRSA BPHC NOFOs require a "Program Requirements" section. This section was not detected. Note: HRSA templates are updated periodically. If your template does not include this section, verify against the most recent version before acting on this warning. This tool may not always reflect the latest HRSA template.',
        suggestedFix: 'Verify that the document contains the Program Requirements section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_020;
