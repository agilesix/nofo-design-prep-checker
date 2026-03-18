import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-010: Required "Tribal Resolution" section (IHS)
 */
const STRUCT_010: Rule = {
  id: 'STRUCT-010',
  contentGuideIds: ['ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasSection = doc.sections.some(section =>
      section.heading.toLowerCase().includes('tribal resolution') ||
      section.rawText.toLowerCase().includes('tribal resolution')
    );

    if (!hasSection) {
      issues.push({
        id: 'STRUCT-010-missing',
        ruleId: 'STRUCT-010',
        title: 'Required "Tribal Resolution" section not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'IHS NOFOs often include a "Tribal Resolution" requirement. This section was not detected. Verify whether it is required for this NOFO.',
        suggestedFix: 'If a Tribal Resolution section is required, ensure it is present with proper heading styles.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_010;
