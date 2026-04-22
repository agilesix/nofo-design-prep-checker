import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_017, { findOrphanedFootnotesIndex } from '../opdiv/CLEAN-017';
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

function para(style: string, text: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function emptyPara(): string {
  return `<w:p/>`;
}

function wrapBody(content: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}"><w:body>` +
    content +
    `<w:sectPr/></w:body></w:document>`
  );
}

const OPTIONS_HRSA = { contentGuideId: 'hrsa-rr' } as const;

// ─── Four required test cases ─────────────────────────────────────────────────

describe('CLEAN-017: orphaned Footnotes heading as last content (HRSA)', () => {
  it('fires when a Heading-styled "Footnotes" paragraph is the last content', () => {
    const xml = wrapBody(
      para('Normal', 'Some document content.') +
      para('Heading2', 'Footnotes')
    );
    const results = CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-017');
    expect(change.targetField).toBe('struct.hrsa.removefootnotesheading');
    expect(change.description).toBe('Removed empty "Footnotes" heading at end of document.');
  });

  it('does not fire when a "Footnotes" heading is followed by actual content', () => {
    const xml = wrapBody(
      para('Heading2', 'Footnotes') +
      para('Normal', '1. This is a real footnote.')
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });

  it('does not fire when there is no "Footnotes" heading', () => {
    const xml = wrapBody(
      para('Normal', 'Introduction.') +
      para('Heading2', 'Background')
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });
});

describe('CLEAN-017: content guide scope', () => {
  it('contentGuideIds covers all five HRSA variants', () => {
    expect(CLEAN_017.contentGuideIds).toEqual(
      expect.arrayContaining([
        'hrsa-bhw',
        'hrsa-bphc',
        'hrsa-construction',
        'hrsa-mchb',
        'hrsa-rr',
      ])
    );
    expect(CLEAN_017.contentGuideIds).toHaveLength(5);
  });

  it('contentGuideIds does not include non-HRSA guides', () => {
    const nonHrsa = ['cdc', 'cdc-research', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cdc-dghp', 'acf', 'acl', 'cms', 'ihs'];
    for (const guideId of nonHrsa) {
      expect(CLEAN_017.contentGuideIds).not.toContain(guideId);
    }
  });
});

// ─── Text matching ────────────────────────────────────────────────────────────

describe('CLEAN-017: text matching', () => {
  it('matches "Footnote" (singular)', () => {
    const xml = wrapBody(para('Heading2', 'Footnote'));
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('matches "FOOTNOTES" (all-caps)', () => {
    const xml = wrapBody(para('Heading2', 'FOOTNOTES'));
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('matches with surrounding whitespace', () => {
    const xml = wrapBody(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">  Footnotes  </w:t></w:r></w:p>`
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('does not match partial text like "Footnotes Section"', () => {
    const xml = wrapBody(para('Heading2', 'Footnotes Section'));
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });
});

// ─── Style matching ───────────────────────────────────────────────────────────

describe('CLEAN-017: paragraph style matching', () => {
  it('matches a Normal-style paragraph', () => {
    const xml = wrapBody(para('Normal', 'Footnotes'));
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('matches a paragraph with no explicit style (defaults to Normal)', () => {
    const xml = wrapBody(
      `<w:p><w:r><w:t>Footnotes</w:t></w:r></w:p>`
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('matches Heading1 through Heading6 styles', () => {
    for (let level = 1; level <= 6; level++) {
      const xml = wrapBody(para(`Heading${level}`, 'Footnotes'));
      expect(
        CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA),
        `should fire for Heading${level}`
      ).toHaveLength(1);
    }
  });
});

// ─── Trailing content after orphaned heading ─────────────────────────────────

describe('CLEAN-017: trailing empty paragraphs are allowed', () => {
  it('fires when empty paragraphs follow the heading before sectPr', () => {
    const xml = wrapBody(
      para('Heading2', 'Footnotes') +
      emptyPara() +
      emptyPara()
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(1);
  });

  it('does not fire when a non-empty paragraph follows the heading', () => {
    const xml = wrapBody(
      para('Heading2', 'Footnotes') +
      para('Normal', 'Non-empty paragraph.')
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });

  it('does not fire when a table follows the heading', () => {
    const xml = wrapBody(
      para('Heading2', 'Footnotes') +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
    );
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('CLEAN-017: edge cases', () => {
  it('returns [] when documentXml is empty', () => {
    expect(CLEAN_017.check(makeDoc(''), OPTIONS_HRSA)).toHaveLength(0);
  });

  it('does not fire when the document has no body', () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"/>`;
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });

  it('does not fire when the "Footnotes" heading is more than 10 body elements from the end', () => {
    const filler = Array.from({ length: 11 }, (_, i) => para('Normal', `Paragraph ${i + 1}.`)).join('');
    const xml = wrapBody(para('Heading2', 'Footnotes') + filler);
    expect(CLEAN_017.check(makeDoc(xml), OPTIONS_HRSA)).toHaveLength(0);
  });
});

// ─── findOrphanedFootnotesIndex unit tests ────────────────────────────────────

describe('findOrphanedFootnotesIndex', () => {
  function parseElements(xml: string): Element[] {
    const fullXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<root xmlns:w="${W_NS}">${xml}</root>`;
    const doc = new DOMParser().parseFromString(fullXml, 'application/xml');
    return Array.from(doc.documentElement.childNodes).filter(
      n => n.nodeType === Node.ELEMENT_NODE
    ) as Element[];
  }

  it('returns 0 when only element is an orphaned Footnotes heading', () => {
    const els = parseElements(para('Heading2', 'Footnotes') + `<w:sectPr/>`);
    expect(findOrphanedFootnotesIndex(els)).toBe(0);
  });

  it('returns -1 when Footnotes is followed by content', () => {
    const els = parseElements(
      para('Heading2', 'Footnotes') +
      para('Normal', 'Actual content.')
    );
    expect(findOrphanedFootnotesIndex(els)).toBe(-1);
  });

  it('returns the correct index when Footnotes is preceded by other elements', () => {
    const els = parseElements(
      para('Normal', 'Content.') +
      para('Heading2', 'Footnotes') +
      `<w:sectPr/>`
    );
    expect(findOrphanedFootnotesIndex(els)).toBe(1);
  });

  it('returns -1 for an empty element array', () => {
    expect(findOrphanedFootnotesIndex([])).toBe(-1);
  });
});
