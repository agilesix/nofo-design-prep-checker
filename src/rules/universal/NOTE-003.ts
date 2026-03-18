import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-003: Auto-convert footnotes to endnotes (auto-apply)
 * When footnotes are detected and endnotes are not present, marks for conversion.
 */
const NOTE_003: Rule = {
  id: 'NOTE-003',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const changes: AutoAppliedChange[] = [];

    const footnotesFile = doc.zipArchive.file('word/footnotes.xml');
    const endnotesFile = doc.zipArchive.file('word/endnotes.xml');

    if (footnotesFile && !endnotesFile) {
      changes.push({
        ruleId: 'NOTE-003',
        description: 'Footnotes detected. Manual conversion to endnotes is required in Microsoft Word (References > Convert All Footnotes to Endnotes).',
      });
    }

    return changes;
  },
};

export default NOTE_003;
