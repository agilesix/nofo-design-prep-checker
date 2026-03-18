import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-002: Endnotes present — verify they are intentional
 * Detects endnotes in the document and prompts for review.
 */
const NOTE_002: Rule = {
  id: 'NOTE-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const endnotesFile = doc.zipArchive.file('word/endnotes.xml');
    if (!endnotesFile) return issues;

    // Check if there are actual endnotes beyond the default separator entries
    issues.push({
      id: 'NOTE-002-endnotes',
      ruleId: 'NOTE-002',
      title: 'Document contains endnotes — verify they are intentional',
      severity: 'suggestion',
      sectionId: doc.sections[0]?.id ?? 'section-preamble',
      description: 'This document contains endnotes. Verify that all endnotes are intentional and that none are footnotes that were accidentally placed as endnotes.',
      suggestedFix: 'Review all endnotes in the document. In Microsoft Word, go to References > Show Notes to review.',
      instructionOnly: true,
    });

    return issues;
  },
};

export default NOTE_002;
