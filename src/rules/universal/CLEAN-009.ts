import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-009: Accept all tracked changes and remove all comments (auto-apply)
 *
 * Detects the presence of tracked changes (w:ins, w:del, w:moveFrom, w:moveTo,
 * and formatting-change records) or comment annotations in the document's OOXML.
 *
 * When either is found, the downloaded output is silently cleaned across all
 * relevant XML parts (document.xml, footnotes.xml, endnotes.xml, headers,
 * and footers):
 *   - Tracked insertions (w:ins, w:moveTo): wrapper removed, content kept
 *   - Tracked deletions (w:del, w:moveFrom): element and all content removed
 *   - Formatting change records (w:rPrChange, w:pPrChange, w:sectPrChange,
 *     w:tblPrChange): removed entirely
 *   - Comment range markers and comment reference runs: removed from all parts
 *   - word/comments.xml and word/commentsExtended.xml: removed from ZIP
 *   - Corresponding relationship entries: removed from word/_rels/document.xml.rels
 *
 * Detection is performed against the raw OOXML strings (documentXml,
 * footnotesXml, endnotesXml) because mammoth strips tracked changes and
 * comments during HTML conversion.
 *
 * Produces no output when neither tracked changes nor comments are found.
 */
const CLEAN_009: Rule = {
  id: 'CLEAN-009',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const TRACKED_CHANGE_TAGS = [
      'w:ins', 'w:del', 'w:moveFrom', 'w:moveTo',
      'w:rPrChange', 'w:pPrChange', 'w:sectPrChange', 'w:tblPrChange',
    ];
    const COMMENT_TAGS = [
      'w:commentRangeStart', 'w:commentRangeEnd', 'w:commentReference',
    ];

    // Check document.xml, footnotes.xml, and endnotes.xml
    const xmlParts = [doc.documentXml, doc.footnotesXml, doc.endnotesXml].filter(Boolean);
    if (xmlParts.length === 0) return [];

    const hasTrackedChanges = xmlParts.some(xml =>
      TRACKED_CHANGE_TAGS.some(tag => xml.includes(`<${tag}`))
    );
    const hasComments = xmlParts.some(xml =>
      COMMENT_TAGS.some(tag => xml.includes(`<${tag}`))
    );

    if (!hasTrackedChanges && !hasComments) return [];

    return [
      {
        ruleId: 'CLEAN-009',
        description: 'Tracked changes accepted and comments removed.',
        targetField: 'doc.acceptchanges',
      },
    ];
  },
};

export default CLEAN_009;
