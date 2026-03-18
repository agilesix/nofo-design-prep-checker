import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-002: Required "Program Description" or "Step 2" section
 */
const REQUIRED_HEADINGS = [
  'Program Description',
  'Step 2',
  'Section II',
  'Program description',
];

const STRUCT_002: Rule = {
  id: 'STRUCT-002',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-002-missing',
        ruleId: 'STRUCT-002',
        title: 'Required "Program Description" or "Step 2" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain a "Program Description" or "Step 2" section as required by the content guide. This section was not detected.',
        suggestedFix: 'Verify that the document contains the required Program Description section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_002;
