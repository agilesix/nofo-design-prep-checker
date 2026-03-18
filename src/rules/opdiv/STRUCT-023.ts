import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-023: CMS — Check for required "Summary" section
 */
const STRUCT_023: Rule = {
  id: 'STRUCT-023',
  contentGuideIds: ['cms'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSummary = doc.sections.some(section =>
      section.heading.toLowerCase() === 'summary' ||
      section.heading.toLowerCase().includes('executive summary')
    );

    if (!hasSummary) {
      issues.push({
        id: 'STRUCT-023-missing',
        ruleId: 'STRUCT-023',
        title: 'Required "Summary" section not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'CMS NOFOs typically include a "Summary" or "Executive Summary" section. This was not detected.',
        suggestedFix: 'Verify whether a Summary section is required for this CMS NOFO and add it if needed.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_023;
