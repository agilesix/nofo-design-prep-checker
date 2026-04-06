import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

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
    const getContext = buildLocationLookup(htmlDoc);

    tables.forEach((table, index) => {
      const caption = table.querySelector('caption');
      if (caption && caption.textContent?.trim() !== '') return;

      const firstRowText = table.querySelector('tr')?.textContent?.trim().slice(0, 60) ?? '';
      const section = findSectionForElement(table, doc);
      const sectionHeading = section?.heading ?? '';

      // Single-cell tables are callout boxes per the SimplerNOFOs style guide — not data tables.
      // Use :scope child combinators so cells inside nested tables are not counted.
      const directCells = table.querySelectorAll(
        ':scope > tr > td, :scope > tr > th,' +
        ':scope > tbody > tr > td, :scope > tbody > tr > th,' +
        ':scope > thead > tr > td, :scope > thead > tr > th,' +
        ':scope > tfoot > tr > td, :scope > tfoot > tr > th'
      );
      if (directCells.length === 1) return;

      // Suppress for table types that are exempt per the SimplerNOFOs style guide
      if (isExemptFromCaption(table, sectionHeading)) return;

      // A heading within the 3 elements directly above the table (with ≤ 50 words of
      // intervening body text) serves as a caption substitute — common NOFO pattern:
      // heading → short intro sentence(s) → table.
      if (hasNearbyHeadingCaption(table)) return;

      const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';
      const { nearestHeading, page } = getContext(table);

      issues.push({
        id: `TABLE-002-${index}`,
        ruleId: 'TABLE-002',
        title: 'Table is missing a caption',
        severity: 'warning',
        sectionId,
        nearestHeading,
        page,
        description:
          `A table${firstRowText ? ` starting with "${firstRowText}\u2026"` : ''} does not have a caption. ` +
          `Per the SimplerNOFOs style guide, captions must follow the format \u201cTable: Title of table\u201d ` +
          `in normal (unstyled) text, placed directly above the table with no blank line. ` +
          `A heading can serve as a caption substitute only when it appears within the three elements ` +
          `directly above the table with 50 words or fewer of body text between it and the table \u2014 ` +
          `this table was flagged because no heading was found within that range, or the intervening ` +
          `text exceeded the threshold. ` +
          `Note: key facts tables, key dates tables, callout boxes (single-cell tables), ` +
          `application checklist, merit review criteria, standard forms, application contents, ` +
          `and reporting tables are exempt from this requirement \u2014 use your judgment if this table ` +
          `falls into one of those categories.`,
        suggestedFix:
          `Either add a caption directly above the table (format: \u201cTable: Title of table\u201d in normal ` +
          `unstyled text, no blank line between caption and table), or move the relevant heading closer ` +
          `to the table so that no more than 50 words of body text separate them.`,
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

  // Table first-row / first-cell content signals
  const firstCellText = (table.querySelector('td, th')?.textContent ?? '').toLowerCase();
  const firstRowText = (table.querySelector('tr')?.textContent ?? '').toLowerCase();
  return (
    /key\s+facts/.test(firstCellText) ||
    /key\s+dates/.test(firstCellText) ||
    /key\s+facts/.test(firstRowText) ||
    /key\s+dates/.test(firstRowText) ||
    /merit\s+review\s+criteri/.test(firstRowText) ||
    /maximum\s+points?/.test(firstRowText) ||
    /total\s+points?/.test(firstRowText) ||
    /application\s+checklist/.test(firstRowText) ||
    /report\s+type/.test(firstRowText) ||
    /sf.?424/.test(firstRowText) ||
    /standard\s+form\s+\d/.test(firstRowText)
  );
}

/**
 * Returns true when a heading appears within the 3 elements directly preceding the
 * table and the total word count of non-heading elements between that heading and
 * the table is ≤ 50 words. In this pattern the heading serves as the table's label.
 *
 * Example: <h2>Key dates</h2> → <p>The following dates apply.</p> → <table>
 *   Heading found 2 elements above, 1 short paragraph between them → skip.
 *
 * If intervening text exceeds 50 words the heading is too far removed to read as
 * a caption, so the rule still flags the table.
 */
function hasNearbyHeadingCaption(table: Element): boolean {
  const prev: Element[] = [];
  let el = table.previousElementSibling;
  while (el && prev.length < 3) {
    prev.push(el);
    el = el.previousElementSibling;
  }

  // Find the closest heading within the preceding 3 elements
  const headingIdx = prev.findIndex(s => /^h[1-6]$/i.test(s.tagName));
  if (headingIdx === -1) return false;

  // prev[0..headingIdx-1] are the non-heading elements between heading and table
  const interveningWords = prev.slice(0, headingIdx).reduce((sum, s) => {
    const text = (s.textContent ?? '').trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);

  return interveningWords <= 50;
}

function findSectionForElement(el: Element, doc: ParsedDocument): Section | undefined {
  const text = (el.textContent ?? '').slice(0, 50);
  return doc.sections.find(section => section.rawText.includes(text));
}

export default TABLE_002;
