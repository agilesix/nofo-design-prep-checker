import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * META-003: Document Keywords metadata check
 * Checks that keywords are present and follow guidance (8-10 comma-separated terms).
 */
const META_003: Rule = {
  id: 'META-003',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const archiveFile = doc.zipArchive.file('docProps/core.xml');
    if (!archiveFile) return issues;

    issues.push({
      id: 'META-003-keywords',
      ruleId: 'META-003',
      title: 'Verify document keywords metadata',
      severity: 'warning',
      sectionId: 'section-preamble',
      description:
        'The document Keywords field should contain 8–10 specific terms or phrases drawn directly from the language of the NOFO, separated by commas. These should be fine-grained search terms, not high-level category words.',
      suggestedFix: 'Update the Keywords field in Document Properties.',
      inputRequired: {
        type: 'textarea',
        label: 'Keywords',
        placeholder: 'keyword one, keyword two, keyword three',
        hint: '8–10 keywords, separated by commas. Use specific terms from the NOFO.',
        targetField: 'metadata.keywords',
        maxLength: 500,
      },
    });

    return issues;
  },
};

export default META_003;
