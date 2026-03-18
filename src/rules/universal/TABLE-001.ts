import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * TABLE-001: Tables missing header row
 * Flags tables that have no <th> elements (no header row defined).
 */
const TABLE_001: Rule = {
  id: 'TABLE-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));

    tables.forEach((table, index) => {
      const hasTh = table.querySelector('th') !== null;
      const caption = table.querySelector('caption')?.textContent?.trim() ?? '';
      const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';

      if (!hasTh) {
        const sectionId = findSectionForElement(table, doc);

        issues.push({
          id: `TABLE-001-${index}`,
          ruleId: 'TABLE-001',
          title: 'Table is missing a header row',
          severity: 'error',
          sectionId,
          description: `A table${caption ? ` ("${caption}")` : firstRowText ? ` starting with "${firstRowText}…"` : ''} has no header row (<th> elements). Tables must have headers for accessibility.`,
          suggestedFix: 'In the source document, format the first row of the table as a Header Row using the Table Design options in Word.',
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

export default TABLE_001;
