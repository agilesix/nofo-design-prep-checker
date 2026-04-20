import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_015 from '../universal/CLEAN-015';
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

/** Numbered list item where the paragraph-level rPr has w:b */
function numberedParaBoldBullet(text: string, numId = '1'): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` +
    `<w:rPr><w:b/><w:bCs/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

/** Bulleted list item where the paragraph-level rPr has only w:b (no bCs) */
function bulletedParaBoldBullet(text: string, numId = '2'): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` +
    `<w:rPr><w:b/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

/** List item where the text run is bold but the paragraph-level rPr has no bold */
function listParaBoldTextOnly(text: string, numId = '3'): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

/** Non-list paragraph with bold text */
function boldBodyPara(text: string): string {
  return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}

/** Plain list item with no bold anywhere */
function plainListPara(text: string, numId = '4'): string {
  return (
    `<w:p>` +
    `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection: numbered list with bold bullet ────────────────────────────────

describe('CLEAN-015: numbered list item with bold bullet', () => {
  it('detects a single numbered paragraph with paragraph-level w:b and returns AutoAppliedChange', () => {
    const doc = makeDoc(wrap(numberedParaBoldBullet('First item')));
    const results = CLEAN_015.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-015');
    expect(change.targetField).toBe('list.bullet.unbold');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 list item bullet');
  });

  it('uses singular "bullet" when exactly one item is affected', () => {
    const doc = makeDoc(wrap(numberedParaBoldBullet('Solo')));
    const results = CLEAN_015.check(doc, OPTIONS);
    const change = results[0] as AutoAppliedChange;
    expect(change.description).toMatch(/1 list item bullet[^s]/);
  });
});

// ─── Detection: bulleted list with bold bullet ────────────────────────────────

describe('CLEAN-015: bulleted list item with bold bullet', () => {
  it('detects a bulleted paragraph with paragraph-level w:b and returns AutoAppliedChange', () => {
    const doc = makeDoc(wrap(bulletedParaBoldBullet('Bullet point')));
    const results = CLEAN_015.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-015');
    expect(change.targetField).toBe('list.bullet.unbold');
    expect(change.value).toBe('1');
  });

  it('counts multiple bold-bullet paragraphs across the document', () => {
    const doc = makeDoc(
      wrap(
        numberedParaBoldBullet('Item A', '1') +
        bulletedParaBoldBullet('Item B', '2') +
        numberedParaBoldBullet('Item C', '1')
      )
    );
    const results = CLEAN_015.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('3');
    expect(change.description).toContain('3 list item bullets');
  });
});

// ─── No-op: bold text run but no bold bullet ─────────────────────────────────

describe('CLEAN-015: no change when only text run is bold', () => {
  it('returns no changes when a list item text run is bold but paragraph-level rPr has no bold', () => {
    const doc = makeDoc(wrap(listParaBoldTextOnly('Bold text item')));
    expect(CLEAN_015.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: non-list paragraph with bold ─────────────────────────────────────

describe('CLEAN-015: no change for non-list paragraphs', () => {
  it('does not flag a body paragraph with bold text', () => {
    const doc = makeDoc(wrap(boldBodyPara('Bold body text')));
    expect(CLEAN_015.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a plain list item with no bold anywhere', () => {
    const doc = makeDoc(wrap(plainListPara('Plain item')));
    expect(CLEAN_015.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when document has no list items at all', () => {
    const doc = makeDoc(wrap('<w:p><w:r><w:t>No lists here.</w:t></w:r></w:p>'));
    expect(CLEAN_015.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for an empty documentXml', () => {
    const doc = makeDoc('');
    expect(CLEAN_015.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Scope: mixed document ────────────────────────────────────────────────────

describe('CLEAN-015: mixed document counts only bold-bullet list items', () => {
  it('counts only the bold-bullet paragraphs when bold-text and plain paragraphs are also present', () => {
    const doc = makeDoc(
      wrap(
        boldBodyPara('Not a list') +
        numberedParaBoldBullet('Bold bullet', '1') +
        listParaBoldTextOnly('Bold text only', '1') +
        plainListPara('Plain', '2')
      )
    );
    const results = CLEAN_015.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
  });
});
