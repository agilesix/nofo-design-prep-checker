import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-003: Required "Eligibility" or "Step 3" section
 */
const REQUIRED_HEADINGS = [
  'Eligibility',
  'Step 3',
  'Section III',
  'Eligible applicants',
  'Eligible organizations',
];

const STRUCT_003: Rule = {
  id: 'STRUCT-003',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-003-missing',
        ruleId: 'STRUCT-003',
        title: 'Required "Eligibility" or "Step 3" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain an "Eligibility" or "Step 3" section as required by the content guide. This section was not detected.',
        suggestedFix: 'Verify that the document contains the required Eligibility section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_003;
