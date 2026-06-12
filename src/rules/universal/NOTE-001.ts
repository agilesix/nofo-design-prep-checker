import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-001: Silently convert all Word footnotes to endnotes on download.
 *
 * Inspects word/document.xml for w:footnoteReference elements to detect
 * user-authored footnotes. When found, returns an AutoAppliedChange that
 * triggers applyFootnoteToEndnoteFix in buildDocx — which merges footnotes
 * and existing endnotes in document reading order, renumbers them
 * sequentially, writes the result into word/endnotes.xml, and clears the
 * user-authored entries from word/footnotes.xml.
 *
 * Word always writes separator/continuationSeparator entries into both XML
 * parts even when there are no user notes; those structural entries are
 * preserved and never renumbered.
 *
 * No Issue card is emitted under any circumstances.
 */
const NOTE_001: Rule = {
  id: 'NOTE-001',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml) return [];

    const fnRefPattern = /<w:footnoteReference\b[^/]*/g;
    const matches = Array.from(doc.documentXml.matchAll(fnRefPattern));

    const userRefs = matches.filter(m => {
      const idMatch = /w:id="(-?\d+)"/.exec(m[0]);
      const id = idMatch ? parseInt(idMatch[1]!, 10) : NaN;
      return !isNaN(id) && id >= 1;
    });

    if (userRefs.length === 0) return [];

    return [
      {
        ruleId: 'NOTE-001',
        description: `${userRefs.length} footnote${userRefs.length === 1 ? '' : 's'} converted to endnote${userRefs.length === 1 ? '' : 's'} and renumbered sequentially.`,
        targetField: 'note.footnote-to-endnote',
        value: String(userRefs.length),
      },
    ];
  },
};

export default NOTE_001;
