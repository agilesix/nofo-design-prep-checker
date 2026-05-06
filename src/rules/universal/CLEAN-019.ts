import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-019: Remove bold styling from colon runs immediately preceded by non-bold text (auto-apply)
 *
 * Scans every paragraph in word/document.xml. For each pair of consecutive
 * direct w:r runs where the second run consists solely of ":" (trimmed) AND is
 * bold, but the first run is not bold, removes w:b and w:bCs from the colon run.
 *
 * Only runs whose trimmed text is exactly ":" are fixed. Runs containing other
 * content that happen to end with ":" (e.g. "Section:") are left untouched.
 *
 * Skipped when:
 *   - The colon run is not bold
 *   - The immediately preceding run is also bold (intentional bold span)
 *   - There is no preceding run in the paragraph
 *   - The run contains more than just ":"
 */
const CLEAN_019: Rule = {
  id: 'CLEAN-019',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
      count += countBoldColonRuns(wP);
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-019',
        description: `Bold removed from ${count} colon run${count === 1 ? '' : 's'} following non-bold text.`,
        targetField: 'text.colon.unbold',
        value: String(count),
      },
    ];
  },
};

function countBoldColonRuns(wP: Element): number {
  const runs = c19DirectRuns(wP);
  let count = 0;
  for (let i = 1; i < runs.length; i++) {
    const run = runs[i]!;
    const prev = runs[i - 1]!;
    if (c19RunText(run).trim() === ':' && c19RunHasBold(run) && !c19RunHasBold(prev)) {
      count++;
    }
  }
  return count;
}

function c19DirectRuns(wP: Element): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(wP.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === 'w:r') {
      result.push(node as Element);
    }
  }
  return result;
}

function c19RunText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function c19RunHasBold(run: Element): boolean {
  const rPr = c19DirectChild(run, 'w:rPr');
  if (!rPr) return false;

  const wB = c19DirectChild(rPr, 'w:b');
  const wBCs = c19DirectChild(rPr, 'w:bCs');
  return c19OnOffIsEnabled(wB) || c19OnOffIsEnabled(wBCs);
}

function c19OnOffIsEnabled(node: Element | null): boolean {
  if (!node) return false;

  const rawVal = node.getAttribute('w:val');
  if (rawVal == null) return true;

  const normalizedVal = rawVal.trim().toLowerCase();
  return normalizedVal !== '0' && normalizedVal !== 'false' && normalizedVal !== 'off';
}

function c19DirectChild(parent: Element, tagName: string): Element | null {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

export default CLEAN_019;
