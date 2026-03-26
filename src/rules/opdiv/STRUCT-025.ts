import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * STRUCT-025: HRSA — Check for "Application Guide" reference or link
 */
const STRUCT_025: Rule = {
  id: 'STRUCT-025',
  contentGuideIds: ['hrsa-bhw', 'hrsa-bphc', 'hrsa-construction', 'hrsa-mchb', 'hrsa-rr'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const hasApplicationGuide = doc.rawText.toLowerCase().includes('application guide') ||
      doc.rawText.toLowerCase().includes('r&r application guide') ||
      doc.rawText.toLowerCase().includes('sf424');

    if (!hasApplicationGuide) {
      issues.push({
        id: 'STRUCT-025-missing',
        ruleId: 'STRUCT-025',
        title: 'Application guide reference not found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: 'HRSA NOFOs typically reference the HRSA Application Guide (or R&R Application Guide). This reference was not detected. Note: HRSA templates are updated periodically. If your template does not include this section, verify against the most recent version before acting on this warning. This tool may not always reflect the latest HRSA template.',
        suggestedFix: 'Verify that the appropriate HRSA Application Guide is referenced in the document.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default STRUCT_025;
