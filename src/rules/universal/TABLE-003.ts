import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * TABLE-003: Merged cells in tables
 * Flags tables that use colspan or rowspan, which can create accessibility issues.
 *
 * Exempt tables:
 *  - CDC/DGHT and CDC/DGHP "Before you begin" scaffolding tables — removed by
 *    CLEAN-007 at build time but TABLE-003 runs against the original doc.html.
 */
const TABLE_003: Rule = {
  id: 'TABLE-003',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));
    const getContext = buildLocationLookup(htmlDoc);

    tables.forEach((table, index) => {
      // CDC/DGHT and CDC/DGHP scaffolding table — exempt for the same reason as
      // TABLE-002: CLEAN-007 removes it from the output DOCX but this rule runs
      // against the unmodified doc.html.
      const firstCellText = (table.querySelector('td, th')?.textContent ?? '')
        .replace(/\u00a0/g, ' ')
        .trim()
        .toLowerCase();
      if (/^cdc\/dg(?:ht|hp)/.test(firstCellText)) return;

      const mergedCells = Array.from(table.querySelectorAll('[colspan],[rowspan]')).filter(cell => {
        const colspan = parseInt(cell.getAttribute('colspan') ?? '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') ?? '1', 10);
        return colspan > 1 || rowspan > 1;
      });

      if (mergedCells.length > 0) {
        const caption = table.querySelector('caption')?.textContent?.trim() ?? '';
        const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';
        const sectionId = findSectionForElement(table, doc);
        const { nearestHeading } = getContext(table);

        issues.push({
          id: `TABLE-003-${index}`,
          ruleId: 'TABLE-003',
          title: 'Table contains merged cells',
          severity: 'suggestion',
          sectionId,
          nearestHeading,
          description: `A table${caption ? ` ("${caption}")` : firstRowText ? ` starting with "${firstRowText}…"` : ''} contains ${mergedCells.length} merged cell${mergedCells.length === 1 ? '' : 's'} (colspan/rowspan). Merged cells can sometimes be harder for screen readers to interpret, but they are acceptable when the table structure is clear and the merging genuinely aids comprehension.`,
          suggestedFix: 'Consider whether the merged cells are necessary. If the table structure is clear and the merging helps readers understand the content, no change is needed. If the merge is incidental or the table could be restructured more simply without it, that may improve accessibility.',
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
