import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import TABLE_004 from '../universal/TABLE-004';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

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

function wrap(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}

function singleCellTable(firstParaText: string, extraParas = 1): string {
  const extra = Array.from({ length: extraParas }, () =>
    `<w:p><w:r><w:t>Body content.</w:t></w:r></w:p>`
  ).join('');
  return (
    `<w:tbl>` +
    `<w:tr><w:tc>` +
    `<w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p>` +
    extra +
    `</w:tc></w:tr>` +
    `</w:tbl>`
  );
}

function multiCellTable(firstParaText: string): string {
  return (
    `<w:tbl>` +
    `<w:tr>` +
    `<w:tc><w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t>Cell 2</w:t></w:r></w:p></w:tc>` +
    `</w:tr>` +
    `</w:tbl>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

describe('TABLE-004: detection', () => {
  it('detects a single-cell table with "Important: public information" followed by more content', () => {
    const doc = makeDoc(wrap(singleCellTable('Important: public information')));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('TABLE-004');
    expect(results[0]!.targetField).toBe('table.importantpublic.heading');
    expect(results[0]!.value).toBe('1');
    expect(results[0]!.description).toContain('"Important: public information"');
  });

  it('is case-insensitive — detects "IMPORTANT: PUBLIC INFORMATION"', () => {
    const doc = makeDoc(wrap(singleCellTable('IMPORTANT: PUBLIC INFORMATION')));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('matches when text has leading/trailing whitespace', () => {
    const doc = makeDoc(wrap(singleCellTable('  Important: public information  ')));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('matches when text starts with the phrase but has additional content after it', () => {
    const doc = makeDoc(wrap(singleCellTable('Important: public information — see below')));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('counts multiple qualifying single-cell tables', () => {
    const doc = makeDoc(wrap(
      singleCellTable('Important: public information') +
      singleCellTable('Important: public information')
    ));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('2');
    expect(results[0]!.description).toContain('2 callout boxes');
  });

  it('does not detect when the first paragraph is the only content in the cell', () => {
    const doc = makeDoc(wrap(singleCellTable('Important: public information', 0)));
    const results = TABLE_004.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });

  it('does not detect when first paragraph text does not match', () => {
    const doc = makeDoc(wrap(singleCellTable('Note: This section is informational')));
    const results = TABLE_004.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });

  it('does not detect a multi-cell table even if first cell text matches', () => {
    const doc = makeDoc(wrap(multiCellTable('Important: public information')));
    const results = TABLE_004.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });

  it('does not detect when documentXml is absent', () => {
    const doc = makeDoc('');
    const results = TABLE_004.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });

  it('returns a singular description for exactly one table', () => {
    const doc = makeDoc(wrap(singleCellTable('Important: public information')));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results[0]!.description).toMatch(/in 1 callout box\./);
  });

  it('returns a plural description for two or more tables', () => {
    const doc = makeDoc(wrap(
      singleCellTable('Important: public information') +
      singleCellTable('Important: public information')
    ));
    const results = TABLE_004.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results[0]!.description).toMatch(/in 2 callout boxes\./);
  });
});
