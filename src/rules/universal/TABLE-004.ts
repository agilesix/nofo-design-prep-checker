import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * TABLE-004: Apply heading style to "Important: public information" in single-cell tables
 *
 * Detects single-cell tables (exactly one w:tc) whose first paragraph starts
 * with "Important: public information" (case-insensitive) and is followed by
 * at least one additional paragraph in the cell.
 *
 * The OOXML patch (setting w:pStyle to the appropriate heading level) is
 * applied in buildDocx. The heading level is inferred from the nearest
 * preceding heading in the document; defaults to Heading5 if none is found.
 */

const IMPORTANT_TEXT_LC = 'important: public information';

const TABLE_004: Rule = {
  id: 'TABLE-004',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml || !xml.includes('w:tbl')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const tbl of Array.from(xmlDoc.getElementsByTagName('w:tbl'))) {
      if (t4IsSingleCellTable(tbl) && t4HasQualifyingFirstParagraph(tbl)) {
        count++;
      }
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'TABLE-004',
        description: `Heading style applied to "Important: public information" in ${count} table${count === 1 ? '' : 's'}.`,
        targetField: 'table.importantpublic.heading',
        value: String(count),
      },
    ];
  },
};

function t4DirectChildrenByTagName(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      result.push(node as Element);
    }
  }
  return result;
}

function t4DirectRowsOfTable(tbl: Element): Element[] {
  return t4DirectChildrenByTagName(tbl, 'w:tr');
}

function t4DirectCellsOfRow(tr: Element): Element[] {
  return t4DirectChildrenByTagName(tr, 'w:tc');
}

function t4DirectCellsOfTable(tbl: Element): Element[] {
  return t4DirectRowsOfTable(tbl).flatMap(t4DirectCellsOfRow);
}

function t4IsSingleCellTable(tbl: Element): boolean {
  return t4DirectCellsOfTable(tbl).length === 1;
}

function t4HasQualifyingFirstParagraph(tbl: Element): boolean {
  const tc = t4DirectCellsOfTable(tbl)[0];
  if (!tc) return false;
  const paragraphs = t4DirectParagraphsOf(tc);
  if (paragraphs.length < 2) return false;
  const text = t4ParagraphText(paragraphs[0]!).trim().toLowerCase();
  return text.startsWith(IMPORTANT_TEXT_LC);
}

function t4DirectParagraphsOf(tc: Element): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(tc.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === 'w:p') {
      result.push(node as Element);
    }
  }
  return result;
}

function t4ParagraphText(wP: Element): string {
  return Array.from(wP.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

export default TABLE_004;
