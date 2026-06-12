import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import NOTE_001 from '../universal/NOTE-001';
import type { ParsedDocument, Issue } from '../../types';

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

describe('NOTE-001: footnotes detected warning', () => {
  it('returns no results when documentXml is empty', () => {
    expect(NOTE_001.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('returns no results when footnotesXml is absent (empty string)', () => {
    expect(NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, ''), OPTIONS)).toHaveLength(0);
  });

  it('returns no results when there are no footnote references in the body', () => {
    expect(NOTE_001.check(makeDoc(NO_FOOTNOTES_XML), OPTIONS)).toHaveLength(0);
  });

  it('returns no results when footnotesXml has no user-authored entries matching the body refs', () => {
    // Body references footnote id=1, but footnotesXml only contains separator entries.
    expect(NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, MINIMAL_FOOTNOTES_XML), OPTIONS)).toHaveLength(0);
  });

  it('returns no results when footnote references are only inside w:del', () => {
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

  it('returns no results when footnote references are only inside w:moveFrom', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p><w:moveFrom w:id="5" w:author="A" w:date="2024-01-01T00:00:00Z">` +
      `<w:r><w:footnoteReference w:id="1"/></w:r>` +
      `</w:moveFrom></w:p>` +
      `<w:sectPr/></w:body>` +
      `</w:document>`;
    expect(NOTE_001.check(makeDoc(xml, makeAuthoredFootnotesXml([1])), OPTIONS)).toHaveLength(0);
  });

  it('emits a warning Issue when one live footnote reference is present', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, makeAuthoredFootnotesXml([1])), OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('NOTE-001');
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
  });

  it('uses singular "footnote" in the description for a single footnote', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, makeAuthoredFootnotesXml([1])), OPTIONS);
    const issue = results[0] as Issue;
    expect(issue.description).toMatch(/1 footnote\b/i);
    expect(issue.description).not.toMatch(/1 footnotes/i);
  });

  it('uses plural "footnotes" in the description for multiple footnotes', () => {
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML, makeAuthoredFootnotesXml([1, 2, 3])), OPTIONS);
    const issue = results[0] as Issue;
    expect(issue.description).toMatch(/3 footnotes/i);
  });

  it('description includes instruction to convert in Word', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML, makeAuthoredFootnotesXml([1])), OPTIONS);
    const issue = results[0] as Issue;
    expect(issue.description).toMatch(/Convert to Endnotes/i);
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
    expect((results[0] as Issue).description).toMatch(/1 footnote\b/i);
  });

  it('counts only the intersection of authored footnotes and live body references', () => {
    // Body references footnotes 1 and 2, but footnotes.xml only has an entry for id=1.
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
    expect((results[0] as Issue).description).toMatch(/1 footnote\b/i);
  });

  it('ignores separator-only entries (w:id="-1", "0") in the document body', () => {
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

  it('is not an autoApply rule', () => {
    expect(NOTE_001.autoApply).toBe(false);
  });

  it('always returns an Issue (not an AutoAppliedChange)', () => {
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML, makeAuthoredFootnotesXml([1, 2, 3])), OPTIONS);
    for (const r of results) {
      expect('severity' in r).toBe(true);
    }
  });
});
