import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import NOTE_004 from '../universal/NOTE-004';
import type { ParsedDocument, Section } from '../../types';

const OPTIONS = { contentGuideId: null } as const;

const PREAMBLE: Section = {
  id: 'section-preamble',
  heading: 'Document start',
  headingLevel: 0,
  html: '<p>Test document</p>',
  rawText: 'Test document',
  startPage: 1,
};

const FOOTNOTES_HEADING_SECTION: Section = {
  id: 'section-2-footnotes',
  heading: 'Footnotes',
  headingLevel: 2,
  html: '<h2>Footnotes</h2>',
  rawText: 'Footnotes',
  startPage: 4,
};

function makeDoc(
  sections: Section[],
  footnotesXml = '',
  endnotesXml = ''
): ParsedDocument {
  return {
    html: sections.map(s => s.html).join(''),
    sections,
    rawText: sections.map(s => s.rawText).join(' '),
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml,
    endnotesXml,
    activeContentGuide: null,
  };
}

const REAL_FOOTNOTE_XML = `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1"/>
  <w:footnote w:id="1"><w:p><w:r><w:t>A real footnote.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

const REAL_ENDNOTE_XML = `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:type="separator" w:id="-1"/>
  <w:endnote w:id="1"><w:p><w:r><w:t>A real endnote.</w:t></w:r></w:p></w:endnote>
</w:endnotes>`;

describe('NOTE-004: Orphaned Footnotes heading', () => {
  it('produces no issue when there is no Footnotes heading', () => {
    expect(NOTE_004.check(makeDoc([PREAMBLE]), OPTIONS)).toHaveLength(0);
  });

  it('flags a warning when a Footnotes heading exists with no citations', () => {
    const issues = NOTE_004.check(makeDoc([PREAMBLE, FOOTNOTES_HEADING_SECTION]), OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as import('../../types').Issue;
    expect(issue.ruleId).toBe('NOTE-004');
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.sectionId).toBe(FOOTNOTES_HEADING_SECTION.id);
  });

  it('produces no issue when the Footnotes heading is backed by real footnotes', () => {
    const issues = NOTE_004.check(
      makeDoc([PREAMBLE, FOOTNOTES_HEADING_SECTION], REAL_FOOTNOTE_XML),
      OPTIONS
    );
    expect(issues).toHaveLength(0);
  });

  it('produces no issue when the Footnotes heading is backed by real endnotes', () => {
    const issues = NOTE_004.check(
      makeDoc([PREAMBLE, FOOTNOTES_HEADING_SECTION], '', REAL_ENDNOTE_XML),
      OPTIONS
    );
    expect(issues).toHaveLength(0);
  });

  it('matches heading text case-insensitively ("footnote", "FOOTNOTES")', () => {
    for (const heading of ['footnote', 'FOOTNOTES', 'Footnote.']) {
      const section: Section = { ...FOOTNOTES_HEADING_SECTION, heading };
      const issues = NOTE_004.check(makeDoc([PREAMBLE, section]), OPTIONS);
      expect(issues).toHaveLength(1);
    }
  });

  it('does not flag a non-heading paragraph named Footnotes (headingLevel 0)', () => {
    const nonHeading: Section = { ...FOOTNOTES_HEADING_SECTION, headingLevel: 0 };
    expect(NOTE_004.check(makeDoc([PREAMBLE, nonHeading]), OPTIONS)).toHaveLength(0);
  });
});
