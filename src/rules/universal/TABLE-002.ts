import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * TABLE-002: Tables missing a caption
 * Flags tables that do not have a <caption> element.
 */
const TABLE_002: Rule = {
  id: 'TABLE-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const tables = Array.from(htmlDoc.querySelectorAll('table'));

    tables.forEach((table, index) => {
      const caption = table.querySelector('caption');
      const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';

      if (!caption || caption.textContent?.trim() === '') {
        const sectionId = findSectionForElement(table, doc);

        issues.push({
          id: `TABLE-002-${index}`,
          ruleId: 'TABLE-002',
          title: 'Table is missing a caption',
          severity: 'warning',
          sectionId,
          description: `A table${firstRowText ? ` starting with "${firstRowText}…"` : ''} does not have a caption. Table captions help screen reader users understand what the table contains.`,
          suggestedFix: 'Add a brief descriptive caption above the table in the source document.',
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

export default TABLE_002;
