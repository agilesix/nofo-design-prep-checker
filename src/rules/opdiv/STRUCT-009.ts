import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-009: Required "Project Description" section (HRSA Construction)
 */
const STRUCT_009: Rule = {
  id: 'STRUCT-009',
  contentGuideIds: ['hrsa-construction'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSection = doc.sections.some(section =>
      section.heading.toLowerCase().includes('project description')
    );

    if (!hasSection) {
      issues.push({
        id: 'STRUCT-009-missing',
        ruleId: 'STRUCT-009',
        title: 'Required "Project Description" section not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'HRSA Construction NOFOs require a "Project Description" section. This section was not detected. Note: HRSA templates are updated periodically. If your template does not include this section, verify against the most recent version before acting on this warning. This tool may not always reflect the latest HRSA template.',
        suggestedFix: 'Verify that the document contains a "Project Description" section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_009;
