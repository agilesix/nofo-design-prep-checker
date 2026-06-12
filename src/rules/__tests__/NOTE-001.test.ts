import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import NOTE_001 from '../universal/NOTE-001';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const OPTIONS = { contentGuideId: null } as const;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeDoc(documentXml: string): ParsedDocument {
  return {
    html: '',
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
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

  it('returns no changes when there are no footnote references in the body', () => {
    expect(NOTE_001.check(makeDoc(NO_FOOTNOTES_XML), OPTIONS)).toHaveLength(0);
  });

  it('returns an AutoAppliedChange when one footnote reference is present', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('NOTE-001');
    expect(change.targetField).toBe('note.footnote-to-endnote');
    expect(change.value).toBe('1');
  });

  it('uses singular "footnote" in the description for a single footnote', () => {
    const results = NOTE_001.check(makeDoc(ONE_FOOTNOTE_XML), OPTIONS);
    const change = results[0] as AutoAppliedChange;
    expect(change.description).toMatch(/1 footnote converted/i);
    expect(change.description).not.toMatch(/footnotes/);
  });

  it('returns an AutoAppliedChange counting all footnote references', () => {
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('3');
    expect(change.description).toMatch(/3 footnotes converted/i);
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
    const results = NOTE_001.check(makeDoc(THREE_FOOTNOTES_XML), OPTIONS);
    for (const r of results) {
      expect('severity' in r).toBe(false);
    }
  });
});
