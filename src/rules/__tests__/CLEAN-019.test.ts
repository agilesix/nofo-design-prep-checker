import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_019 from '../universal/CLEAN-019';
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

function normalRun(text: string): string {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}

function boldRun(text: string): string {
  return `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>`;
}

function boldRunBCs(text: string): string {
  return `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${text}</w:t></w:r>`;
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-019: detection — bold sole-colon run preceded by non-bold run', () => {
  it('detects a bold ":" run immediately after a normal run', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Section Title')}${boldRun(':')}</w:p>`));
    const results = CLEAN_019.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-019');
    expect(change.targetField).toBe('text.colon.unbold');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 colon run');
  });

  it('uses plural "runs" when more than one qualifying pair is found', () => {
    const para = `<w:p>${normalRun('Label')}${boldRun(':')}</w:p>`;
    const doc = makeDoc(wrap(para + para));
    const results = CLEAN_019.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
    expect(change.description).toContain('2 colon runs');
  });

  it('detects when the colon run carries both w:b and w:bCs', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Intro')}${boldRunBCs(':')}</w:p>`));
    const results = CLEAN_019.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects a qualifying pair in the middle of a paragraph (not just the last run)', () => {
    const doc = makeDoc(wrap(
      `<w:p>${normalRun('Key')}${boldRun(':')}${normalRun(' value')}</w:p>`
    ));
    const results = CLEAN_019.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('counts multiple qualifying pairs within the same paragraph', () => {
    const doc = makeDoc(wrap(
      `<w:p>` +
      `${normalRun('A')}${boldRun(':')}` +
      `${normalRun('B')}${boldRun(':')}` +
      `</w:p>`
    ));
    const results = CLEAN_019.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });
});

// ─── No-op: both runs bold ────────────────────────────────────────────────────

describe('CLEAN-019: no change when the preceding run is also bold', () => {
  it('does not flag when the preceding run is bold', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRun('Section Title')}${boldRun(':')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when both runs carry w:b and w:bCs', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRunBCs('Label')}${boldRunBCs(':')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: colon not the only content ───────────────────────────────────────

describe('CLEAN-019: no change when the run contains more than just ":"', () => {
  it('does not flag a bold run whose text is "Section:"', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Before')}${boldRun('Section:')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a bold run whose text is "Label: "', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('X')}${boldRun('Label: ')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a bold run that ends with "::" (two colons)', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('X')}${boldRun('::')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: colon run not bold ────────────────────────────────────────────────

describe('CLEAN-019: no change when the sole-colon run is not bold', () => {
  it('does not flag when the ":" run has no bold', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Word')}${normalRun(':')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: no preceding run ─────────────────────────────────────────────────

describe('CLEAN-019: no change when the colon run has no preceding sibling run', () => {
  it('does not flag a single-run paragraph containing only ":"', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRun(':')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a paragraph with no runs', () => {
    const doc = makeDoc(wrap('<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>'));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('CLEAN-019: edge cases', () => {
  it('returns no changes for an empty documentXml', () => {
    const doc = makeDoc('');
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when the document has no qualifying pairs', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Plain text.')}</w:p>`));
    expect(CLEAN_019.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('handles a colon run with surrounding whitespace (trimmed match)', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:r><w:t>Label</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> : </w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const doc = makeDoc(xml);
    const results = CLEAN_019.check(doc, OPTIONS);
    // " : " trims to ":" — should be detected
    expect(results).toHaveLength(1);
  });
});
