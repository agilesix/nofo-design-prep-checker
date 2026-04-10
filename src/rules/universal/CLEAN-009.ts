import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-009: Accept all tracked changes and remove all comments (auto-apply)
 *
 * Detects the presence of tracked changes (w:ins, w:del, w:moveFrom, w:moveTo,
 * and formatting-change records) or comment annotations in the document's OOXML.
 *
 * When either is found, the downloaded output is silently cleaned across
 * document.xml, footnotes.xml, endnotes.xml, and any header/footer parts:
 *   - Tracked insertions (w:ins, w:moveTo): wrapper removed, content kept
 *   - Tracked deletions (w:del, w:moveFrom): element and all content removed
 *   - Formatting change records (w:rPrChange, w:pPrChange, w:sectPrChange,
 *     w:tblPrChange): removed entirely
 *   - Comment range markers and comment reference runs: removed from all parts
 *   - word/comments.xml and word/commentsExtended.xml: removed from ZIP
 *   - Corresponding relationship entries: removed from word/_rels/document.xml.rels
 *
 * Detection is performed against documentXml, footnotesXml, and endnotesXml
 * because mammoth strips tracked changes and comments during HTML conversion.
 * Header/footer parts are cleaned by the patch if the rule triggers, but they
 * are not inspected during detection (ParsedDocument does not expose them).
 * Tracked changes or comments that exist only in headers/footers and nowhere
 * else in the document will therefore not trigger this rule.
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
