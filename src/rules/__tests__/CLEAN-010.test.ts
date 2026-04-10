import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_010 from '../universal/CLEAN-010';
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

/** Build a minimal document.xml whose body is a single list with the given items. */
function makeListXml(items: string[], numId = '1'): string {
  const paras = items
    .map(
      text =>
        `<w:p>` +
        `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
        `<w:r><w:t>${text}</w:t></w:r>` +
        `</w:p>`
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}">` +
    `<w:body>${paras}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection: lists that qualify ───────────────────────────────────────────

describe('CLEAN-010: detects qualifying lists', () => {
  it('returns an AutoAppliedChange when some items have periods and some do not', () => {
    const doc = makeDoc(makeListXml(['Item 1.', 'Item 2', 'Item 3.', 'Item 4']));
    const results = CLEAN_010.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-010');
    expect(change.targetField).toBe('list.periodfix');
    expect(change.value).toBe('2'); // 2 items missing periods
    expect(change.description).toContain('2 list items');
  });

  it('uses singular "list item" when only one item needs a period', () => {
    const doc = makeDoc(makeListXml(['Item 1.', 'Item 2.', 'Item 3']));
    const results = CLEAN_010.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).toMatch(/1 list item[^s]/);
  });

  it('triggers when only 1 of 3+ items has a period (minimum threshold)', () => {
    const doc = makeDoc(makeListXml(['Item 1.', 'Item 2', 'Item 3']));
    const results = CLEAN_010.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });

  it('counts items to fix across two qualifying lists in the same document', () => {
    // List 1 (numId=1): 3 items, 1 needs period (C)
    // List 2 (numId=2): 4 items, 2 need periods (Z, W)
    // Build a combined document
    const combined =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      // list 1 paragraphs
      [`A.`, `B.`, `C`]
        .map(
          t =>
            `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
            `<w:r><w:t>${t}</w:t></w:r></w:p>`
        )
        .join('') +
      // body paragraph separating the lists
      `<w:p><w:r><w:t>Some body text.</w:t></w:r></w:p>` +
      // list 2 paragraphs
      [`X.`, `Y.`, `Z`, `W`]
        .map(
          t =>
            `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>` +
            `<w:r><w:t>${t}</w:t></w:r></w:p>`
        )
        .join('') +
      `<w:sectPr/></w:body></w:document>`;

    const doc = makeDoc(combined);
    const results = CLEAN_010.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('3'); // 1 + 2
  });
});

// ─── No-op: lists that do not qualify ────────────────────────────────────────

describe('CLEAN-010: no changes when the list does not qualify', () => {
  it('returns no changes when all items already end with a period', () => {
    const doc = makeDoc(makeListXml(['Item 1.', 'Item 2.', 'Item 3.']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when no items end with a period', () => {
    const doc = makeDoc(makeListXml(['Item 1', 'Item 2', 'Item 3']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a list with fewer than 3 items (2 items)', () => {
    const doc = makeDoc(makeListXml(['Item 1.', 'Item 2']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a list with exactly 1 item', () => {
    const doc = makeDoc(makeListXml(['Item 1.']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when documentXml is empty', () => {
    const doc = makeDoc('');
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a document with no list items', () => {
    const doc = makeDoc(
      `<?xml version="1.0"?><w:document xmlns:w="${W}">` +
      `<w:body><w:p><w:r><w:t>Just a paragraph.</w:t></w:r></w:p><w:sectPr/></w:body>` +
      `</w:document>`
    );
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Period detection: only '.' counts ───────────────────────────────────────

describe('CLEAN-010: only a period triggers the rule', () => {
  it('does not treat a question mark as a period', () => {
    // Item ending with '?' does not satisfy the "has period" condition
    const doc = makeDoc(makeListXml(['Item 1?', 'Item 2', 'Item 3']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not treat a semicolon as a period', () => {
    const doc = makeDoc(makeListXml(['Item 1;', 'Item 2', 'Item 3']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not treat a colon as a period', () => {
    const doc = makeDoc(makeListXml(['Item 1:', 'Item 2', 'Item 3']));
    expect(CLEAN_010.check(doc, OPTIONS)).toHaveLength(0);
  });
});
