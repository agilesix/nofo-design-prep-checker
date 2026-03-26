import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-006: Required "Award Administration" or "Step 6" section
 */
const REQUIRED_HEADINGS = [
  'Award Administration',
  'Step 6',
  'Section VI',
  'Award information',
  'Post-award',
];

const STRUCT_006: Rule = {
  id: 'STRUCT-006',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-006-missing',
        ruleId: 'STRUCT-006',
        title: 'Required "Award Administration" or "Step 6" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain an "Award Administration" or "Step 6" section as required by the content guide.',
        suggestedFix: 'Verify that the document contains the required Award Administration section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_006;
