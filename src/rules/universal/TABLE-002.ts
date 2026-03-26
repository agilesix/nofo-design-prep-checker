import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';

/**
 * TABLE-002: Tables missing a caption
 *
 * Flags tables that do not have a <caption> element, with two tiers:
 *  1. Exempt tables — suppressed entirely (application contents, standard forms,
 *     application checklist, merit review criteria, reporting tables)
 *  2. All other uncaptioned tables — warning with guidance on the required
 *     "Table: Title" format and a note that some standard tables are exempt
 *
 * Exemption detection uses the section heading the table appears in and the
 * text of the table's first row. Detection is best-effort; the issue card
 * always notes the exempt categories so users can apply their own judgment.
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
      if (caption && caption.textContent?.trim() !== '') return;

      const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';
      const section = findSectionForElement(table, doc);
      const sectionHeading = section?.heading ?? '';

      // Suppress for table types that are exempt per the SimplerNOFOs style guide
      if (isExemptFromCaption(table, sectionHeading)) return;

      const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';

      issues.push({
        id: `TABLE-002-${index}`,
        ruleId: 'TABLE-002',
        title: 'Table is missing a caption',
        severity: 'warning',
        sectionId,
        description:
          `A table${firstRowText ? ` starting with "${firstRowText}\u2026"` : ''} does not have a caption. ` +
          `Per the SimplerNOFOs style guide, captions must follow the format \u201cTable: Title of table\u201d ` +
          `in normal (unstyled) text, placed directly above the table with no blank line. ` +
          `A bold line or heading above the table does not count as a caption. ` +
          `Note: application checklist, merit review criteria, standard forms, application contents, ` +
          `and reporting tables are exempt from this requirement \u2014 use your judgment if this table ` +
          `falls into one of those categories.`,
        suggestedFix:
          `Add a caption directly above the table in your source document. ` +
          `The caption should follow the format: \u201cTable: Title of table\u201d \u2014 ` +
          `for example, \u201cTable: Project narrative components\u201d. ` +
          `Use normal (unstyled) text. Do not add a blank line between the caption and the table.`,
        instructionOnly: true,
      });
    });

    return issues;
  },
};

/**
 * Returns true if the table appears to be one of the types that are exempt
 * from the caption requirement per the SimplerNOFOs style guide:
 *  - Application contents tables
 *  - Standard forms tables  (SF-424 etc.)
 *  - Application checklist tables
 *  - Merit review criteria tables (total and individual)
 *  - Reporting tables
 *
 * Detection checks the section heading the table is in and the table's
 * first-row text. Either signal alone is sufficient to suppress the warning.
 */
function isExemptFromCaption(table: Element, sectionHeading: string): boolean {
  const heading = sectionHeading.toLowerCase();

  if (
    /application\s+contents?/.test(heading) ||
    /table\s+of\s+contents/.test(heading) ||
    /standard\s+forms?/.test(heading) ||
    /required\s+forms?/.test(heading) ||
    /application\s+checklist/.test(heading) ||
    /merit\s+review/.test(heading) ||
    /review\s+(and\s+)?selection/.test(heading) ||
    /selection\s+criteria/.test(heading) ||
    /reporting\s+requirements?/.test(heading) ||
    /post.?award\s+reporting/.test(heading)
  ) {
    return true;
  }

  // Table first-row content signals
  const firstRowText = (table.querySelector('tr')?.textContent ?? '').toLowerCase();
  return (
    /merit\s+review\s+criteri/.test(firstRowText) ||
    /maximum\s+points?/.test(firstRowText) ||
    /total\s+points?/.test(firstRowText) ||
    /application\s+checklist/.test(firstRowText) ||
    /report\s+type/.test(firstRowText) ||
    /sf.?424/.test(firstRowText) ||
    /standard\s+form\s+\d/.test(firstRowText)
  );
}

function findSectionForElement(el: Element, doc: ParsedDocument): Section | undefined {
  const text = (el.textContent ?? '').slice(0, 50);
  return doc.sections.find(section => section.rawText.includes(text));
}

export default TABLE_002;
