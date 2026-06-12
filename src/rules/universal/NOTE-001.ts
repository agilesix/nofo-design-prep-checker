import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-001: Warn when live footnotes are detected in the document body.
 *
 * NOFO Builder requires all notes to be endnotes. This rule scans
 * word/document.xml for w:footnoteReference elements that are not inside
 * a w:del or w:moveFrom ancestor (live references only), then cross-references
 * against word/footnotes.xml to confirm the referenced IDs exist as
 * user-authored entries (ID ≥ 1, no w:type or w:type="normal").
 *
 * Emits a single dismissible warning with the footnote count when live
 * footnotes are found. No auto-fix is applied.
 */

/** Returns true if el is a descendant of a w:del or w:moveFrom element. */
function isInsideDeletedOrMoved(el: Element): boolean {
  let node: Element | null = el.parentElement;
  while (node) {
    if (node.tagName === 'w:del' || node.tagName === 'w:moveFrom') return true;
    node = node.parentElement;
  }
  return false;
}

const NOTE_001: Rule = {
  id: 'NOTE-001',
  autoApply: false,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    if (!doc.documentXml || !doc.footnotesXml) return [];
    if (!doc.documentXml.includes('w:footnoteReference')) return [];

    const parser = new DOMParser();

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

    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');
    const liveCount = new Set(
      Array.from(xmlDoc.getElementsByTagName('w:footnoteReference'))
        .filter(el => !isInsideDeletedOrMoved(el))
        .map(el => parseInt(el.getAttribute('w:id') ?? '', 10))
        .filter((id): id is number => authoredIds.has(id))
    ).size;

    if (liveCount === 0) return [];

    const n = liveCount;
    const noteWord = n === 1 ? 'footnote' : 'footnotes';

    return [
      {
        id: 'NOTE-001-footnotes-detected',
        ruleId: 'NOTE-001',
        title: `Document contains ${n} ${noteWord}`,
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description:
          `This document contains ${n} ${noteWord}. NOFO Builder requires all notes to be ` +
          'endnotes. Please convert footnotes to endnotes in Word ' +
          '(References → Convert to Endnotes) before importing into NOFO Builder.',
        instructionOnly: true,
      },
    ];
  },
};

export default NOTE_001;
