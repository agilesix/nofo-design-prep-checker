import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-015: Remove bold styling from list item bullet characters (auto-apply)
 *
 * In Word documents, the paragraph-level w:rPr (inside w:pPr) controls the
 * formatting of the generated bullet or number character. If w:b or w:bCs is
 * present there, the bullet/number renders bold even when the list item text
 * is not. This rule silently removes w:b and w:bCs from the paragraph-level
 * w:rPr of every list paragraph (any w:p that has w:numPr in its w:pPr).
 *
 * Only the paragraph-level w:rPr is touched — individual w:r run properties
 * (which control the bold styling of the item text) are left unchanged.
 *
 * Detection uses doc.documentXml because list structure and paragraph-level
 * run properties are not preserved in the mammoth-generated HTML.
 *
 * Produces no output when no list paragraph has a bold bullet/number.
 */
const CLEAN_015: Rule = {
  id: 'CLEAN-015',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml || !xml.includes('w:numPr')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
      const pPr = directChild(wP, 'w:pPr');
      if (!pPr) continue;
      if (!directChild(pPr, 'w:numPr')) continue;

      const pRpr = directChild(pPr, 'w:rPr');
      if (!pRpr) continue;

      if (
        pRpr.getElementsByTagName('w:b').length > 0 ||
        pRpr.getElementsByTagName('w:bCs').length > 0
      ) {
        count++;
      }
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-015',
        description: `Bold removed from ${count} list item bullet${count === 1 ? '' : 's'}.`,
        targetField: 'list.bullet.unbold',
        value: String(count),
      },
    ];
  },
};

/** Returns the first direct child element of `parent` whose tag name matches. */
function directChild(parent: Element, tagName: string): Element | null {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

export default CLEAN_015;
