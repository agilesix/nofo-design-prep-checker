import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * META-002: Document Subject metadata check
 * Checks that the Subject field follows the prescribed formula.
 */
const META_002: Rule = {
  id: 'META-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const archiveFile = doc.zipArchive.file('docProps/core.xml');
    if (!archiveFile) return issues;

    issues.push({
      id: 'META-002-subject',
      ruleId: 'META-002',
      title: 'Verify document subject metadata',
      severity: 'warning',
      sectionId: 'section-preamble',
      description:
        'The document Subject field should follow the formula: "A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO]." It should be a broad, high-level statement of purpose in one line (~25 words or less).',
      suggestedFix: 'Replace the placeholder value after "Metadata subject:" or "Subject:" in the document with the correct subject.',
      inputRequired: {
        type: 'textarea',
        label: 'Document subject',
        placeholder: 'A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO].',
        hint: 'One line, ~25 words or less. Begin with "A notice of funding opportunity from the…"',
        targetField: 'metadata.subject',
        maxLength: 300,
      },
    });

    return issues;
  },
};

export default META_002;
