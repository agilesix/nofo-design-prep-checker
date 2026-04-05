import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import NOTE_001 from '../universal/NOTE-001';
import type { ParsedDocument } from '../../types';

const OPTIONS = { contentGuideId: null } as const;

function makeDoc(footnotesXml: string): ParsedDocument {
  return {
    html: '<p>Test document</p>',
    sections: [
      {
        id: 'section-preamble',
        heading: 'Document start',
        headingLevel: 0,
        html: '<p>Test document</p>',
        rawText: 'Test document',
        startPage: 1,
      },
    ],
    rawText: 'Test document',
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml,
    endnotesXml: '',
    activeContentGuide: null,
  };
}

/** footnotes.xml with only Word's built-in separator entries — no real footnotes. */
const SEPARATORS_ONLY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p/></w:footnote>
</w:footnotes>`;

/** footnotes.xml with one real user-authored footnote. */
const REAL_FOOTNOTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p/></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>See page 12.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

describe('NOTE-001: Real Word footnotes detected', () => {
  it('produces no issue when footnotesXml is absent', () => {
    expect(NOTE_001.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('produces no issue when footnotes.xml contains only separator entries', () => {
    expect(NOTE_001.check(makeDoc(SEPARATORS_ONLY_XML), OPTIONS)).toHaveLength(0);
  });

  it('flags a warning when real footnotes are present', () => {
    const issues = NOTE_001.check(makeDoc(REAL_FOOTNOTE_XML), OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as import('../../types').Issue;
    expect(issue.ruleId).toBe('NOTE-001');
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
  });

  it('issue title mentions footnotes and endnotes', () => {
    const issues = NOTE_001.check(makeDoc(REAL_FOOTNOTE_XML), OPTIONS);
    const issue = issues[0] as import('../../types').Issue;
    expect(issue.title).toMatch(/footnote/i);
    expect(issue.title).toMatch(/endnote/i);
  });
});
