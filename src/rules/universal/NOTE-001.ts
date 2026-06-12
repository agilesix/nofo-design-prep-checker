import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-001: Silently convert all Word footnotes to endnotes on download.
 *
 * Inspects word/document.xml for w:footnoteReference elements to detect
 * user-authored footnotes. When found, returns an AutoAppliedChange that
 * triggers applyFootnoteToEndnoteFix in buildDocx — which merges footnotes
 * and existing endnotes in document reading order, renumbers them
 * sequentially, writes the result into word/endnotes.xml, and clears the
 * user-authored entries from word/footnotes.xml.
 *
 * Word always writes separator/continuationSeparator entries into both XML
 * parts even when there are no user notes; those structural entries are
 * preserved and never renumbered.
 *
 * No Issue card is emitted under any circumstances.
 */

/** Returns true if el is a descendant of a w:del element. */
function isInsideDeletion(el: Element): boolean {
  let node: Element | null = el.parentElement;
  while (node) {
    if (node.tagName === 'w:del') return true;
    node = node.parentElement;
  }
  return false;
}

const NOTE_001: Rule = {
  id: 'NOTE-001',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml || !doc.footnotesXml) return [];
    if (!doc.documentXml.includes('w:footnoteReference')) return [];

    const parser = new DOMParser();

    // Determine which footnote IDs actually exist as user-authored entries in
    // word/footnotes.xml — these are the notes applyFootnoteToEndnoteFix will
    // convert. Separator entries (w:type="separator" etc.) and ID < 1 are
    // structural placeholders and must not be counted.
    const fnDoc = parser.parseFromString(doc.footnotesXml, 'application/xml');
    const authoredIds = new Set(
      Array.from(fnDoc.getElementsByTagName('w:footnote'))
        .filter(el => {
          const type = el.getAttribute('w:type');
          return !type || type === 'normal';
        })
        .map(el => parseInt(el.getAttribute('w:id') ?? '', 10))
        .filter((id): id is number => !isNaN(id) && id >= 1)
    );
    if (authoredIds.size === 0) return [];

    // Cross-reference with live body references: exclude refs inside tracked
    // deletions (w:del). CLEAN-009 accepts tracked changes before the patcher
    // runs, so a reference that exists only inside w:del will be gone by the
    // time applyFootnoteToEndnoteFix executes.
    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');
    const liveIds = new Set(
      Array.from(xmlDoc.getElementsByTagName('w:footnoteReference'))
        .filter(el => !isInsideDeletion(el))
        .map(el => parseInt(el.getAttribute('w:id') ?? '', 10))
        .filter((id): id is number => authoredIds.has(id))
    );
    const count = liveIds.size;
    if (count === 0) return [];

    return [
      {
        ruleId: 'NOTE-001',
        description: `${count} footnote${count === 1 ? '' : 's'} converted to endnote${count === 1 ? '' : 's'} and renumbered sequentially.`,
        targetField: 'note.footnote-to-endnote',
        value: String(count),
      },
    ];
  },
};

export default NOTE_001;
