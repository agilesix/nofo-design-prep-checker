import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-024: ACL — Verify "Contact Information" section present
 */
const STRUCT_024: Rule = {
  id: 'STRUCT-024',
  contentGuideIds: ['acl'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasContact = doc.sections.some(section =>
      section.heading.toLowerCase().includes('contact') ||
      section.rawText.toLowerCase().includes('contact information')
    );

    if (!hasContact) {
      issues.push({
        id: 'STRUCT-024-missing',
        ruleId: 'STRUCT-024',
        title: 'Contact information section not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'ACL NOFOs should include contact information for applicants. A contact information section was not detected.',
        suggestedFix: 'Verify that contact information for the program office is included in the document.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_024;
