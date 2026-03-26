import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';

/**
 * TABLE-001: Tables missing header row
 * Flags tables with two or more rows that have no <th> elements in the first row.
 * Single-row tables are excluded — they are treated as callout boxes by convention.
 */
const TABLE_001: Rule = {
  id: 'TABLE-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));

    tables.forEach((table, index) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;

      const firstRow = rows[0]!;
      const firstRowHasTh = firstRow.querySelector('th') !== null;
      const caption = table.querySelector('caption')?.textContent?.trim() ?? '';
      const firstRowText = firstRow.textContent?.trim().slice(0, 60) ?? '';

      if (!firstRowHasTh) {
        const section = findSectionForElement(table, doc);
        const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';
        const page = section?.startPage ?? null;

        issues.push({
          id: `TABLE-001-${index}`,
          ruleId: 'TABLE-001',
          title: 'Table is missing a header row',
          severity: 'error',
          sectionId,
          page,
          description: `A table${caption ? ` ("${caption}")` : firstRowText ? ` starting with "${firstRowText}…"` : ''} has no header row (<th> elements). Tables with two or more rows must have a header row for accessibility. Single-row tables are treated as callout boxes and are not required to have headers.`,
          suggestedFix: 'In the source document, format the first row of the table as a Header Row using the Table Design options in Word.',
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): Section | undefined {
  const text = (el.textContent ?? '').slice(0, 50);
  return doc.sections.find(section => section.rawText.includes(text));
}

export default TABLE_001;
