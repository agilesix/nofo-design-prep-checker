import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_025 from '../universal/CLEAN-025';
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

/** Normal body paragraph (no pStyle = Normal) with a colored run. */
function coloredBodyPara(colorHex: string): string {
  return (
    `<w:p>` +
    `<w:r><w:rPr><w:color w:val="${colorHex}"/></w:rPr><w:t>text</w:t></w:r>` +
    `</w:p>`
  );
}

/** Heading paragraph with a colored run. */
function coloredHeadingPara(level: number, colorHex: string): string {
  return (
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
    `<w:r><w:rPr><w:color w:val="${colorHex}"/></w:rPr><w:t>Heading</w:t></w:r>` +
    `</w:p>`
  );
}

/** Body paragraph with green/brown color on the paragraph mark (pPr/rPr/w:color). */
function coloredParagraphMark(colorHex: string): string {
  return (
    `<w:p>` +
    `<w:pPr><w:rPr><w:color w:val="${colorHex}"/></w:rPr></w:pPr>` +
    `<w:r><w:t>text</w:t></w:r>` +
    `</w:p>`
  );
}

/** Run with a rStyle that is on the excluded list. */
function excludedStyleRun(rStyle: string, colorHex: string): string {
  return (
    `<w:p>` +
    `<w:r><w:rPr><w:rStyle w:val="${rStyle}"/><w:color w:val="${colorHex}"/></w:rPr><w:t>text</w:t></w:r>` +
    `</w:p>`
  );
}

/** Paragraph inside a table. */
function tableWithColoredPara(colorHex: string): string {
  return (
    `<w:tbl><w:tr><w:tc>` +
    `<w:p><w:r><w:rPr><w:color w:val="${colorHex}"/></w:rPr><w:t>cell</w:t></w:r></w:p>` +
    `</w:tc></w:tr></w:tbl>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

// Canonical colors validated against the HSL thresholds in CLEAN-025.ts
const GREEN = '04813D'; // H≈147°, S≈94%, L≈26% — within green range 80–160°
const BROWN = '9A826E'; // H≈27°, S≈18%, L≈52% — within brown range 20–45°, S≤60%, L 15–75%
const BLUE  = '185394'; // H≈211° — outside both ranges, must not be flagged
const GRAY  = '888888'; // H=0°, S=0% — near-gray (S<5%), excluded

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-025: detection', () => {
  it('detects a green run color in a body paragraph', () => {
    const doc = makeDoc(wrap(coloredBodyPara(GREEN)));
    const results = CLEAN_025.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-025');
    expect(change.targetField).toBe('run.color.green-brown.strip');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 location');
  });

  it('detects a brown run color in a heading paragraph', () => {
    const doc = makeDoc(wrap(coloredHeadingPara(3, BROWN)));
    const results = CLEAN_025.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
  });

  it('detects green color on the paragraph mark (pPr/rPr/w:color)', () => {
    const doc = makeDoc(wrap(coloredParagraphMark(GREEN)));
    const results = CLEAN_025.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts run color and paragraph-mark color as separate locations', () => {
    // One run + one paragraph mark in the same paragraph = 2 locations
    const xml = wrap(
      `<w:p>` +
      `<w:pPr><w:rPr><w:color w:val="${GREEN}"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:color w:val="${GREEN}"/></w:rPr><w:t>text</w:t></w:r>` +
      `</w:p>`
    );
    const doc = makeDoc(xml);
    const results = CLEAN_025.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });

  it('counts across multiple paragraphs', () => {
    const doc = makeDoc(wrap(coloredBodyPara(GREEN) + coloredBodyPara(BROWN)));
    const results = CLEAN_025.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });

  it('uses plural "locations" when count > 1', () => {
    const doc = makeDoc(wrap(coloredBodyPara(GREEN) + coloredBodyPara(BROWN)));
    const change = CLEAN_025.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('2 locations');
  });

  it('uses singular "location" when count is 1', () => {
    const doc = makeDoc(wrap(coloredBodyPara(GREEN)));
    const change = CLEAN_025.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('1 location');
    expect(change.description).not.toContain('1 locations');
  });

  it('detects green on all heading levels (Heading1–Heading6)', () => {
    for (let level = 1; level <= 6; level++) {
      const doc = makeDoc(wrap(coloredHeadingPara(level, GREEN)));
      const results = CLEAN_025.check(doc, OPTIONS);
      expect(results).toHaveLength(1);
    }
  });
});

// ─── No-op: non-green/brown colors ───────────────────────────────────────────

describe('CLEAN-025: no change for non-green/brown colors', () => {
  it('does not flag a blue run color', () => {
    const doc = makeDoc(wrap(coloredBodyPara(BLUE)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a near-gray run color (saturation < 5%)', () => {
    const doc = makeDoc(wrap(coloredBodyPara(GRAY)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag w:color with value "auto"', () => {
    const xml = wrap(
      `<w:p><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>text</w:t></w:r></w:p>`
    );
    expect(CLEAN_025.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: excluded run styles ──────────────────────────────────────────────

describe('CLEAN-025: no change for excluded run styles', () => {
  it('skips runs with rStyle Fillintext', () => {
    const doc = makeDoc(wrap(excludedStyleRun('Fillintext', GREEN)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips runs with rStyle FillintextChar', () => {
    const doc = makeDoc(wrap(excludedStyleRun('FillintextChar', GREEN)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips runs with rStyle PlaceholderText', () => {
    const doc = makeDoc(wrap(excludedStyleRun('PlaceholderText', GREEN)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: excluded paragraph styles ────────────────────────────────────────

describe('CLEAN-025: no change for excluded paragraph styles', () => {
  it('skips paragraphs with pStyle InstructionBoxes', () => {
    const xml = wrap(
      `<w:p><w:pPr><w:pStyle w:val="InstructionBoxes"/></w:pPr>` +
      `<w:r><w:rPr><w:color w:val="${GREEN}"/></w:rPr><w:t>text</w:t></w:r></w:p>`
    );
    expect(CLEAN_025.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('skips paragraphs with pStyle InstructionBoxHeading', () => {
    const xml = wrap(
      `<w:p><w:pPr><w:pStyle w:val="InstructionBoxHeading"/></w:pPr>` +
      `<w:r><w:rPr><w:color w:val="${GREEN}"/></w:rPr><w:t>text</w:t></w:r></w:p>`
    );
    expect(CLEAN_025.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('skips paragraphs with an unrecognised style (neither Normal nor Heading)', () => {
    const xml = wrap(
      `<w:p><w:pPr><w:pStyle w:val="CustomBodyText"/></w:pPr>` +
      `<w:r><w:rPr><w:color w:val="${GREEN}"/></w:rPr><w:t>text</w:t></w:r></w:p>`
    );
    expect(CLEAN_025.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: table paragraphs ─────────────────────────────────────────────────

describe('CLEAN-025: no change for paragraphs inside w:tbl', () => {
  it('skips a paragraph nested inside a table cell', () => {
    const doc = makeDoc(wrap(tableWithColoredPara(GREEN)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('CLEAN-025: edge cases', () => {
  it('returns no changes when documentXml is empty', () => {
    expect(CLEAN_025.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when the document has no w:color elements', () => {
    const doc = makeDoc(wrap('<w:p><w:r><w:t>plain text</w:t></w:r></w:p>'));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when all w:color elements are non-green/brown', () => {
    const doc = makeDoc(wrap(coloredBodyPara(BLUE) + coloredBodyPara(GRAY)));
    expect(CLEAN_025.check(doc, OPTIONS)).toHaveLength(0);
  });
});
