import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * TABLE-003: Merged cells in tables
 * Flags tables that use colspan or rowspan, which can create accessibility issues.
 */
const TABLE_003: Rule = {
  id: 'TABLE-003',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));

    tables.forEach((table, index) => {
      const mergedCells = Array.from(table.querySelectorAll('[colspan],[rowspan]')).filter(cell => {
        const colspan = parseInt(cell.getAttribute('colspan') ?? '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') ?? '1', 10);
        return colspan > 1 || rowspan > 1;
      });

      if (mergedCells.length > 0) {
        const caption = table.querySelector('caption')?.textContent?.trim() ?? '';
        const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';
        const sectionId = findSectionForElement(table, doc);

        issues.push({
          id: `TABLE-003-${index}`,
          ruleId: 'TABLE-003',
          title: 'Table contains merged cells',
          severity: 'warning',
          sectionId,
          description: `A table${caption ? ` ("${caption}")` : firstRowText ? ` starting with "${firstRowText}…"` : ''} contains ${mergedCells.length} merged cell${mergedCells.length === 1 ? '' : 's'} (colspan/rowspan). Merged cells can be difficult for screen readers to interpret correctly.`,
          suggestedFix: 'If possible, restructure the table to avoid merged cells. If merging is necessary, ensure the table has a clear, consistent structure.',
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = (el.textContent ?? '').slice(0, 50);
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default TABLE_003;
