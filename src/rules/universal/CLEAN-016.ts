import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-016: Remove bold styling from trailing periods preceded by normal text (auto-apply)
 *
 * Scans every paragraph in word/document.xml. For each paragraph whose last
 * direct w:r run ends with a period AND is bold, but whose immediately preceding
 * w:r run is not bold, removes w:b and w:bCs from the period run.
 *
 * If the period shares a run with other text, the OOXML patch in buildDocx
 * splits the run: the prefix stays bold; a new non-bold run carries the period.
 *
 * Skipped when:
 *   - The preceding run is also bold (entire paragraph may be bold — intentional)
 *   - There is no preceding run in the paragraph
 *   - The last run does not end with a period
 *   - The last run is not bold
 */
const CLEAN_016: Rule = {
  id: 'CLEAN-016',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
      if (isBoldTrailingPeriodCase(wP)) count++;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-016',
        description: `Bold removed from ${count} trailing period${count === 1 ? '' : 's'}.`,
        targetField: 'text.trailing.period.unbold',
        value: String(count),
      },
    ];
  },
};

function isBoldTrailingPeriodCase(wP: Element): boolean {
  const runs = directRunsOf(wP);
  if (runs.length < 2) return false;

  const lastRun = runs[runs.length - 1]!;
  const prevRun = runs[runs.length - 2]!;

  if (!runText(lastRun).endsWith('.')) return false;
  if (!runHasBold(lastRun)) return false;
  if (runHasBold(prevRun)) return false;

  return true;
}

function directRunsOf(wP: Element): Element[] {
  const result: Element[] = [];
  for (const node of Array.from(wP.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === 'w:r') {
      result.push(node as Element);
    }
  }
  return result;
}

function runText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function runHasBold(run: Element): boolean {
  const rPr = c16DirectChild(run, 'w:rPr');
  if (!rPr) return false;
  return !!c16DirectChild(rPr, 'w:b') || !!c16DirectChild(rPr, 'w:bCs');
}

function c16DirectChild(parent: Element, tagName: string): Element | null {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

export default CLEAN_016;
