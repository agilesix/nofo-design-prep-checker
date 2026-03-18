import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-005: Required "Review and Selection" or "Step 5" section
 */
const REQUIRED_HEADINGS = [
  'Review and Selection',
  'Step 5',
  'Section V',
  'Review criteria',
  'Selection criteria',
  'Merit review',
];

const STRUCT_005: Rule = {
  id: 'STRUCT-005',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-005-missing',
        ruleId: 'STRUCT-005',
        title: 'Required "Review and Selection" or "Step 5" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain a "Review and Selection" or "Step 5" section as required by the content guide.',
        suggestedFix: 'Verify that the document contains the required Review and Selection section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_005;
