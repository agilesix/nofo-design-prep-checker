import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_016 from '../universal/CLEAN-016';
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

/** Normal (non-bold) text run */
function normalRun(text: string): string {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}

/** Bold run */
function boldRun(text: string): string {
  return `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>`;
}

/** Bold run with w:b and w:bCs */
function boldRunBCs(text: string): string {
  return `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${text}</w:t></w:r>`;
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-016: detection — bold trailing period with normal preceding run', () => {
  it('detects a paragraph ending with a bold period preceded by normal text', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Hello world')}${boldRun('.')}</w:p>`));
    const results = CLEAN_016.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-016');
    expect(change.targetField).toBe('text.trailing.period.unbold');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 trailing period');
  });

  it('uses plural "periods" when more than one paragraph is affected', () => {
    const para = `<w:p>${normalRun('Text')}${boldRun('.')}</w:p>`;
    const doc = makeDoc(wrap(para + para));
    const results = CLEAN_016.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
    expect(change.description).toContain('2 trailing periods');
  });

  it('detects when the period run also carries w:bCs', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Intro')}${boldRunBCs('.')}</w:p>`));
    const results = CLEAN_016.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects when the bold period is the last char of a longer bold run', () => {
    // Last run is bold "end." preceded by a normal run — should be detected
    const doc = makeDoc(wrap(`<w:p>${normalRun('Some ')}${boldRun('end.')}</w:p>`));
    const results = CLEAN_016.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-op: entire paragraph bold ────────────────────────────────────────────

describe('CLEAN-016: no change when entire paragraph is bold', () => {
  it('does not flag a paragraph where the preceding run is also bold', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRun('Hello world')}${boldRun('.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when both runs carry w:b and w:bCs', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRunBCs('Text')}${boldRunBCs('.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: period in same non-bold run ──────────────────────────────────────

describe('CLEAN-016: no change when the period is in a non-bold run', () => {
  it('does not flag when the last run containing the period is not bold', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Some text')}${normalRun('end.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when the sole run containing text and period is not bold', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Hello world.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: non-period at end ─────────────────────────────────────────────────

describe('CLEAN-016: no change for non-period terminal characters', () => {
  it('does not flag a bold run ending with an exclamation mark', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Hello')}${boldRun('!')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a bold run ending with a question mark', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Question')}${boldRun('?')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a bold run ending with a comma', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Item')}${boldRun(',')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: no preceding run ─────────────────────────────────────────────────

describe('CLEAN-016: no change when the period run has no preceding run', () => {
  it('does not flag a single-run paragraph', () => {
    const doc = makeDoc(wrap(`<w:p>${boldRun('.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a paragraph with no runs at all', () => {
    const doc = makeDoc(wrap('<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>'));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('CLEAN-016: edge cases', () => {
  it('returns no changes for an empty documentXml', () => {
    const doc = makeDoc('');
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when the document has no paragraphs with bold periods', () => {
    const doc = makeDoc(wrap(`<w:p>${normalRun('Plain text.')}</w:p>`));
    expect(CLEAN_016.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('counts multiple qualifying paragraphs correctly', () => {
    const qualifying = `<w:p>${normalRun('Text')}${boldRun('.')}</w:p>`;
    const nonQualifying = `<w:p>${normalRun('Plain.')}</w:p>`;
    const doc = makeDoc(wrap(qualifying + nonQualifying + qualifying + qualifying));
    const results = CLEAN_016.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('3');
  });
});
