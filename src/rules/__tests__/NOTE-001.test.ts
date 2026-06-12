import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import NOTE_001 from '../universal/NOTE-001';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const OPTIONS = { contentGuideId: null } as const;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Minimal footnotes.xml that satisfies the "file is present" guard (separators only). */
const MINIMAL_FOOTNOTES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:footnotes xmlns:w="${W}">` +
  `<w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>` +
  `</w:footnotes>`;

/** Build a footnotes.xml that includes user-authored entries for the given IDs. */
function makeAuthoredFootnotesXml(ids: number[]): string {
  const seps =
    `<w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p/></w:footnote>`;
  const notes = ids
    .map(id => `<w:footnote w:id="${id}"><w:p><w:r><w:t>Footnote ${id}.</w:t></w:r></w:p></w:footnote>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:footnotes xmlns:w="${W}">${seps}${notes}</w:footnotes>`
  );
}

/**
 * Build a ParsedDocument. footnotesXml defaults to a minimal non-empty value
 * (separators only). Pass a full footnotesXml when the test expects detection
 * to fire. Pass '' explicitly to test the "footnotes.xml absent" path.
 */
function makeDoc(documentXml: string, footnotesXml = MINIMAL_FOOTNOTES_XML): ParsedDocument {
  return {
    html: '',
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml,
    endnotesXml: '',
    activeContentGuide: null,
  };
}

/** Minimal document.xml with no footnote references. */
const NO_FOOTNOTES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${W}">` +
  `<w:body><w:p><w:r><w:t>No notes here.</w:t></w:r></w:p><w:sectPr/></w:body>` +
  `</w:document>`;

/** document.xml with one w:footnoteReference (id=1). */
const ONE_FOOTNOTE_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${W}">` +
  `<w:body>` +
  `<w:p><w:r><w:t>Body text</w:t></w:r>` +
  `<w:r><w:rPr/><w:footnoteReference w:id="1"/></w:r></w:p>` +
  `<w:sectPr/></w:body>` +
  `</w:document>`;

/** document.xml with three w:footnoteReference elements (ids 1, 2, 3). */
const THREE_FOOTNOTES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${W}">` +
  `<w:body>` +
  `<w:p><w:r><w:t>First</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
  `<w:p><w:r><w:t>Second</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p>` +
  `<w:p><w:r><w:t>Third</w:t></w:r><w:r><w:footnoteReference w:id="3"/></w:r></w:p>` +
  `<w:sectPr/></w:body>` +
  `</w:document>`;

describe('NOTE-001: footnote-to-endnote auto-apply', () => {
  it('returns no changes when documentXml is empty', () => {
    expect(NOTE_001.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when footnotesXml is absent (empty string)', () => {
    // Even with footnote references in the body, no change is emitted when
    // word/footnotes.xml is not present — applyFootnoteToEndnoteFix would no-op.
    expect(NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, ''), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when there are no footnote references in the body', () => {
    expect(NOTE_001.check(makeDoc(NO_FOOTNOTES_XML), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when footnotesXml has no user-authored entries matching the body refs', () => {
    // Body references footnote id=1, but footnotesXml only contains separator
    // entries. applyFootnoteToEndnoteFix would return early (no authored notes),
    // so NOTE-001 must not emit a spurious change.
    expect(NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, MINIMAL_FOOTNOTES_XML), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when footnote references are only inside tracked deletions (w:del)', () => {
    // CLEAN-009 accepts tracked changes before applyFootnoteToEndnoteFix runs,
    // so a reference that exists only inside w:del will be gone by patch time.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p><w:del w:id="10" w:author="A" w:date="2024-01-01T00:00:00Z">` +
      `<w:r><w:delText>deleted</w:delText></w:r>` +
      `<w:r><w:footnoteReference w:id="1"/></w:r>` +
      `</w:del></w:p>` +
      `<w:sectPr/></w:body>` +
      `</w:document>`;
    expect(NOTE_001.check(makeDoc(xml, makeAuthoredFootnotesXml([1])), OPTIONS)).toHaveLength(0);
  });

  it('returns an AutoAppliedChange when one footnote reference is present', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, makeAuthoredFootnotesXml([1])), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('NOTE-001');
    expect(change.targetField).toBe('note.footnote-to-endnote');
    expect(change.value).toBe('1');
  });

  it('uses singular "footnote" in the description for a single footnote', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, makeAuthoredFootnotesXml([1])), OPTIONS);
    const change = results[0] as AutoAppliedChange;
    expect(change.description).toMatch(/1 footnote converted/i);
    expect(change.description).not.toMatch(/footnotes/);
  });

  it('counts unique footnote IDs, not raw reference elements', () => {
    // The same footnote ID appears twice (e.g. a cross-reference). Should count as 1.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
      `<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
      `<w:sectPr/></w:body>` +
      `</w:document>`;
    const results = NOTE_001.check(makeDoc(xml, makeAuthoredFootnotesXml([1])), OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('returns an AutoAppliedChange counting all unique footnote IDs', () => {
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML, makeAuthoredFootnotesXml([1, 2, 3])), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('3');
    expect(change.description).toMatch(/3 footnotes converted/i);
  });

  it('counts only the intersection of authored footnotes and live body references', () => {
    // Body references footnotes 1 and 2, but footnotes.xml only has an entry
    // for id=1. The count should be 1, not 2.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
      `<w:p><w:r><w:footnoteReference w:id="2"/></w:r></w:p>` +
      `<w:sectPr/></w:body>` +
      `</w:document>`;
    const results = NOTE_001.check(makeDoc(xml, makeAuthoredFootnotesXml([1])), OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('ignores separator-only entries (w:id="-1", "0") in the document body', () => {
    // Separator references use negative or zero IDs — not user-authored footnotes.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p><w:r><w:footnoteReference w:id="-1"/></w:r></w:p>` +
      `<w:p><w:r><w:footnoteReference w:id="0"/></w:r></w:p>` +
      `<w:sectPr/></w:body>` +
      `</w:document>`;
    expect(NOTE_001.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('is an autoApply rule', () => {
    expect(NOTE_001.autoApply).toBe(true);
  });

  it('never returns an Issue card', () => {
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML, makeAuthoredFootnotesXml([1, 2, 3])), OPTIONS);
    for (const r of results) {
      expect('severity' in r).toBe(false);
    }
  });
});
