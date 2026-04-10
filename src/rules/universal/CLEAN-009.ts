import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-009: Accept all tracked changes and remove all comments (auto-apply)
 *
 * Detects the presence of tracked changes (w:ins, w:del, w:moveFrom, w:moveTo,
 * and formatting-change records) or comment annotations in the document's OOXML.
 *
 * When either is found, the downloaded output is silently cleaned:
 *   - Tracked insertions (w:ins, w:moveTo): wrapper removed, content kept
 *   - Tracked deletions (w:del, w:moveFrom): element and all content removed
 *   - Formatting change records (w:rPrChange, w:pPrChange, w:sectPrChange,
 *     w:tblPrChange): removed entirely
 *   - Comment range markers and comment reference runs: removed from document.xml
 *   - word/comments.xml and word/commentsExtended.xml: removed from ZIP
 *   - Corresponding relationship entries: removed from word/_rels/document.xml.rels
 *
 * Detection is performed against doc.documentXml (the raw OOXML) because
 * mammoth strips tracked changes and comments during HTML conversion.
 *
 * Produces no output when neither tracked changes nor comments are found.
 */
const CLEAN_009: Rule = {
  id: 'CLEAN-009',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];

    const hasTrackedChanges = [
      'w:ins', 'w:del', 'w:moveFrom', 'w:moveTo',
      'w:rPrChange', 'w:pPrChange', 'w:sectPrChange', 'w:tblPrChange',
    ].some(tag => xml.includes(`<${tag}`));

    const hasComments = [
      'w:commentRangeStart', 'w:commentRangeEnd', 'w:commentReference',
    ].some(tag => xml.includes(`<${tag}`));

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
