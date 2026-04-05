import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-001: Real Word footnotes detected
 *
 * Inspects word/footnotes.xml to confirm actual user-authored footnotes exist.
 * Word always writes separator/continuationSeparator entries into footnotes.xml
 * even when there are no real footnotes, so we skip those and only flag entries
 * without a w:type attribute (or with w:type="normal").
 *
 * The SimplerNOFOs style guide requires all notes to be endnotes. Word footnotes
 * will not import correctly into NOFO Builder.
 */
const NOTE_001: Rule = {
  id: 'NOTE-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    if (!doc.footnotesXml) return [];

    const footnoteTagPattern = /<w:footnote\b[^>]*>/g;
    const separatorTypePattern = /w:type="(?:separator|continuationSeparator|continuationNotice)"/;

    const hasRealFootnotes = Array.from(doc.footnotesXml.matchAll(footnoteTagPattern))
      .some(match => !separatorTypePattern.test(match[0]));

    if (!hasRealFootnotes) return [];

    return [{
      id: 'NOTE-001-footnotes',
      ruleId: 'NOTE-001',
      title: 'Document contains footnotes that must be converted to endnotes',
      severity: 'warning',
      sectionId: doc.sections[0]?.id ?? 'section-preamble',
      description:
        'This document contains Word footnotes. The SimplerNOFOs style guide requires all notes ' +
        'to be endnotes — Word footnotes will not import correctly into NOFO Builder and will ' +
        'not appear in the published NOFO.',
      suggestedFix:
        'In Microsoft Word, go to References → Show Notes. In the notes pane, click Convert and ' +
        'select "Convert all footnotes to endnotes", then save the document.',
      instructionOnly: true,
    }];
  },
};

export default NOTE_001;
