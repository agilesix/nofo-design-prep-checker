import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_018 from '../universal/CLEAN-018';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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

const OPTIONS = { contentGuideId: null } as const;

/** Single-cell table with configurable first-paragraph text and optional extra cells. */
function makeInstructionBoxDocXml(opts: {
  firstParaText?: string;
  cellCount?: number;
  extraParaAfter?: boolean;
}): string {
  const {
    firstParaText = 'DGHT-SPECIFIC INSTRUCTIONS: Review before submission.',
    cellCount = 1,
    extraParaAfter = false,
  } = opts;
  const extraCells = Array.from({ length: cellCount - 1 })
    .map(() => `<w:tc><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>`)
    .join('');
  const afterPara = extraParaAfter
    ? `<w:p><w:r><w:t>Keep this paragraph.</w:t></w:r></w:p>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}"><w:body>` +
    `<w:tbl><w:tr>` +
    `<w:tc><w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p></w:tc>` +
    extraCells +
    `</w:tr></w:tbl>` +
    afterPara +
    `<w:sectPr/></w:body></w:document>`
  );
}

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-018: detection', () => {
  it('detects a single-cell table starting with "DGHT-SPECIFIC INSTRUCTIONS"', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({}));
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('CLEAN-018');
    expect(results[0]!.targetField).toBe('struct.universal.removeinstructionboxes');
    expect(results[0]!.value).toBe('1');
    expect(results[0]!.description).toBe('1 instruction box removed.');
  });

  it('detects a single-cell table starting with "DGHP-SPECIFIC INSTRUCTIONS"', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({ firstParaText: 'DGHP-SPECIFIC INSTRUCTIONS: Complete all fields.' }));
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('detects a single-cell table whose first paragraph contains "instructions" (lowercase)', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({ firstParaText: 'instructions for completing this section' }));
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('detects a single-cell table whose first paragraph contains "Instructions" (mixed case)', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({ firstParaText: 'Instructions: Read carefully before proceeding.' }));
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('detects a CDC-SPECIFIC INSTRUCTIONS variant', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({ firstParaText: 'CDC-SPECIFIC INSTRUCTIONS for applicants.' }));
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
  });

  it('counts multiple qualifying tables and uses plural description', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS box 1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
      `<w:p><w:r><w:t>Body paragraph between boxes.</w:t></w:r></w:p>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>DGHP-SPECIFIC INSTRUCTIONS box 2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    const doc = makeDoc(xml);
    const results = CLEAN_018.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('2');
    expect(results[0]!.description).toBe('2 instruction boxes removed.');
  });
});

// ─── No-ops ───────────────────────────────────────────────────────────────────

describe('CLEAN-018: no changes when table does not qualify', () => {
  it('does not flag a multi-cell table even when it contains "instructions"', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({
      firstParaText: 'DGHT-SPECIFIC INSTRUCTIONS',
      cellCount: 2,
    }));
    expect(CLEAN_018.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a single-cell table whose first paragraph has no "instructions"', () => {
    const doc = makeDoc(makeInstructionBoxDocXml({ firstParaText: 'Note: Important information for applicants.' }));
    expect(CLEAN_018.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a single-cell table that only has "instructions" in a second paragraph', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr><w:tc>` +
      `<w:p><w:r><w:t>Note: see below.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS follow here.</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_018.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when documentXml is empty', () => {
    expect(CLEAN_018.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when "instructions" does not appear anywhere in the XML (fast path)', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Note: public information.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_018.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('does not flag a BCD6F4-shaded single-cell table (handled by CLEAN-007 for CDC content guides)', () => {
    // BCD6F4 tables are DGHT/DGHP instruction boxes owned by CLEAN-007;
    // excluding them here prevents duplicate auto-applied entries on CDC documents.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr>` +
      `<w:tc>` +
      `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="BCD6F4"/></w:tcPr>` +
      `<w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS: Do not include in submission.</w:t></w:r></w:p>` +
      `</w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_018.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });
});

// ─── Nested table regression ──────────────────────────────────────────────────

describe('CLEAN-018: direct-cell logic ignores nested w:tc elements', () => {
  it('detects a single-cell outer table even when that cell contains a nested table with multiple cells', () => {
    // With getElementsByTagName('w:tc'), the 2 nested cells would make the count 3,
    // causing a false negative. getDirectTableCells counts only direct cells → count 1.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr>` +
      `<w:tc>` +
      `<w:p><w:r><w:t>Instructions for completing this section.</w:t></w:r></w:p>` +
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>nested cell 1</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>nested cell 2</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `</w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    const results = CLEAN_018.check(makeDoc(xml), OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as import('../../types').AutoAppliedChange).value).toBe('1');
  });
});
