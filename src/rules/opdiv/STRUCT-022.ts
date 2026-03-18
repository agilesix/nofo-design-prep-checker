import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-022: ACF — Check for required "Funding Opportunity Number" in Basic Information
 */
const STRUCT_022: Rule = {
  id: 'STRUCT-022',
  contentGuideIds: ['acf'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasFON = doc.rawText.toLowerCase().includes('funding opportunity number') ||
      doc.rawText.toLowerCase().includes('nofo number') ||
      /[A-Z]{2,4}-\d{4}-[A-Z0-9-]+/.test(doc.rawText);

    if (!hasFON) {
      issues.push({
        id: 'STRUCT-022-missing-fon',
        ruleId: 'STRUCT-022',
        title: 'Funding opportunity number not detected',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'A Funding Opportunity Number (FON) was not detected in this document. ACF NOFOs should include the FON prominently in the Basic Information section.',
        suggestedFix: 'Ensure the Funding Opportunity Number is present and clearly labeled in the document.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_022;
