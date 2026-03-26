import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-004: Required "Application and Submission" or "Step 4" section
 */
const REQUIRED_HEADINGS = [
  'Application and Submission',
  'Step 4',
  'Section IV',
  'How to apply',
  'Application requirements',
];

const STRUCT_004: Rule = {
  id: 'STRUCT-004',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-004-missing',
        ruleId: 'STRUCT-004',
        title: 'Required "Application and Submission" or "Step 4" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain an "Application and Submission" or "Step 4" section as required by the content guide.',
        suggestedFix: 'Verify that the document contains the required Application and Submission section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_004;
