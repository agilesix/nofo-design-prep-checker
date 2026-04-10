import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-011: Normalize application checklist checkboxes (auto-apply)
 *
 * Scans all tables found under an "Application checklist" heading (H2 or H3,
 * case-insensitive) and inspects only the first column cell of each table row.
 * The scope of "under" extends through subheadings and ends when a heading at
 * the same or higher level is encountered.
 *
 * Two issues are corrected:
 *
 * Issue 1 — Wrong or missing checkbox glyph
 *   The first non-whitespace character in a first-column cell should be the
 *   WHITE MEDIUM SQUARE glyph ◻ (U+25FB). If it is one of the following
 *   substitutes, it is silently replaced:
 *     ☐ (U+2610 BALLOT BOX)
 *     ☑ (U+2611 BALLOT BOX WITH CHECK)
 *     ☒ (U+2612 BALLOT BOX WITH X)
 *     □ (U+25A1 WHITE SQUARE)
 *     •  (U+2022 BULLET)
 *   Additionally, 'o', 'O', or any other non-alphanumeric character that
 *   appears to function as a placeholder (first character in the cell,
 *   immediately followed by a space) is also replaced.
 *
 * Issue 2 — Bulleted-list paragraph style
 *   If the paragraph style of a first-column cell's first paragraph contains
 *   "List" or "Bullet" (e.g. "ListParagraph", "List Bullet"), it is changed to
 *   "Normal". This prevents NOFO Builder from overwriting the glyph on import.
 *
 * Detection uses doc.documentXml (the raw OOXML) to access heading styles and
 * paragraph style values — information that is not preserved in the mammoth-
 * generated HTML.
 *
 * Produces no output when no corrections are needed.
 */

/** The correct checkbox glyph: WHITE MEDIUM SQUARE (U+25FB). */
const TARGET_GLYPH = '◻';

/** Glyphs that are unambiguously incorrect checkbox substitutes — always replaced. */
const ALWAYS_REPLACE = new Set(['☐', '☑', '☒', '□', '•']);

/**
 * Glyphs that are replaced only when immediately followed by a space, to
 * distinguish them from the start of actual word content (e.g. "Optional…").
 */
const REPLACE_IF_SPACE_FOLLOWS = new Set(['o', 'O']);

/**
 * Returns true when the text content of a first-column cell has a first
 * non-whitespace character that should be replaced with ◻.
 */
function needsGlyphFix(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  const first = trimmed[0]!;
  if (first === TARGET_GLYPH) return false;
  if (ALWAYS_REPLACE.has(first)) return true;
  // For o/O and any other non-alphanumeric single character: replace only when
  // followed by a space (checkbox + space is the expected pattern).
  if (trimmed.length >= 2 && trimmed[1] === ' ') {
    if (REPLACE_IF_SPACE_FOLLOWS.has(first)) return true;
    if (!/[a-zA-Z0-9]/.test(first)) return true;
  }
  return false;
}

function isListStyle(styleVal: string): boolean {
  return /list|bullet/i.test(styleVal);
}

function getPStyle(para: Element): string {
  const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
  if (!pPr) return '';
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  return pStyle?.getAttribute('w:val') ?? '';
}

function getParaText(para: Element): string {
  return Array.from(para.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

function getHeadingLevel(styleVal: string): number | null {
  const match = styleVal.match(/^Heading(\d)/);
  return match ? parseInt(match[1]!, 10) : null;
}

/**
 * Return all <w:tbl> elements that are direct body children under the
 * Application checklist heading section. Scope begins at an H2 or H3 whose
 * trimmed text matches /application\s+checklist/i and ends when another
 * heading at the same or higher level is encountered.
 */
export function findChecklistTables(xmlDoc: Document): Element[] {
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return [];

  const tables: Element[] = [];
  let inChecklist = false;
  let checklistLevel = 0;

  for (const child of Array.from(body.children)) {
    if (child.localName === 'p') {
      const styleVal = getPStyle(child);
      const level = getHeadingLevel(styleVal);
      if (level !== null) {
        if (inChecklist && level <= checklistLevel) {
          inChecklist = false;
        }
        const text = getParaText(child).trim();
        if ((level === 2 || level === 3) && /application\s+checklist/i.test(text)) {
          inChecklist = true;
          checklistLevel = level;
        }
      }
    } else if (child.localName === 'tbl' && inChecklist) {
      tables.push(child);
    }
  }

  return tables;
}

function countCellsNeedingFix(xmlDoc: Document): number {
  const tables = findChecklistTables(xmlDoc);
  let count = 0;

  for (const table of tables) {
    for (const row of Array.from(table.children).filter(c => c.localName === 'tr')) {
      const firstCell = Array.from(row.children).find(c => c.localName === 'tc');
      if (!firstCell) continue;
      const firstPara = Array.from(firstCell.children).find(c => c.localName === 'p');
      if (!firstPara) continue;

      const cellText = getParaText(firstPara);
      const styleVal = getPStyle(firstPara);

      if (needsGlyphFix(cellText) || isListStyle(styleVal)) {
        count++;
      }
    }
  }

  return count;
}

const CLEAN_011: Rule = {
  id: 'CLEAN-011',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    // Fast exit: the text "application checklist" must appear somewhere in the XML.
    if (!xml || !/application\s+checklist/i.test(xml)) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');
    const count = countCellsNeedingFix(xmlDoc);
    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-011',
        description: `Application checklist checkboxes normalized — ${count} cell${count === 1 ? '' : 's'} corrected.`,
        targetField: 'checklist.checkbox',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_011;
