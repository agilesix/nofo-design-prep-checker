import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-001: Required "Basic Information" section
 * Checks that the document contains a top-level "Basic Information" or equivalent section.
 */
const REQUIRED_HEADINGS = [
  'Basic Information',
  'Step 1',
  'Section I',
];

const STRUCT_001: Rule = {
  id: 'STRUCT-001',
  contentGuideIds: ['acf', 'acl', 'cdc', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cms', 'ihs'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasRequiredSection = doc.sections.some(section => {
      const heading = section.heading.toLowerCase();
      return REQUIRED_HEADINGS.some(h => heading.includes(h.toLowerCase()));
    });

    if (!hasRequiredSection) {
      issues.push({
        id: 'STRUCT-001-missing',
        ruleId: 'STRUCT-001',
        title: 'Required "Basic Information" or "Step 1" section not found',
        severity: 'error',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'This NOFO should contain a "Basic Information" or "Step 1" section as required by the content guide. This section was not detected.',
        suggestedFix: 'Verify that the document contains the required Basic Information section with proper heading styles applied.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_001;
