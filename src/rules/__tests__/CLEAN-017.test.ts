import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_017 from '../universal/CLEAN-017';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function makeDocXml(...texts: string[]): string {
  const paras = texts.map(t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>${paras}<w:sectPr/></w:body></w:document>`
  );
}

function makeHyperlinkDocXml(linkText: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body><w:p><w:hyperlink r:id="rId1">` +
    `<w:r><w:t>${linkText}</w:t></w:r>` +
    `</w:hyperlink></w:p><w:sectPr/></w:body></w:document>`
  );
}

function makeDoc(
  documentXml: string,
  { footnotesXml = '', endnotesXml = '' }: { footnotesXml?: string; endnotesXml?: string } = {}
): ParsedDocument {
  return {
    html: '',
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml,
    endnotesXml,
    activeContentGuide: null,
  };
}

function makeFootnotesXml(text: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:footnotes xmlns:w="${W_NS}">` +
    `<w:footnote w:id="1"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:footnote>` +
    `</w:footnotes>`
  );
}

function makeEndnotesXml(text: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:endnotes xmlns:w="${W_NS}">` +
    `<w:endnote w:id="1"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:endnote>` +
    `</w:endnotes>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

function check(documentXml: string): AutoAppliedChange[] {
  return CLEAN_017.check(makeDoc(documentXml), OPTIONS) as AutoAppliedChange[];
}

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-017: detects incorrect Grants.gov capitalization', () => {
  it('flags hyperlink run w:t containing "grants.gov"', () => {
    const results = check(makeHyperlinkDocXml('grants.gov'));
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('CLEAN-017');
    expect(results[0]!.targetField).toBe('text.grantsgov.capitalize');
    expect(results[0]!.value).toBe('1');
    expect(results[0]!.description).toContain('1 location');
  });

  it('flags plain body text containing "grants.gov"', () => {
    const results = check(makeDocXml('Visit grants.gov for more information.'));
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('flags "GRANTS.GOV" (all-caps, case-insensitive)', () => {
    const results = check(makeDocXml('GRANTS.GOV'));
    expect(results).toHaveLength(1);
  });

  it('flags "Grants.Gov" (wrong internal capitalization)', () => {
    const results = check(makeDocXml('Grants.Gov'));
    expect(results).toHaveLength(1);
  });

  it('counts multiple incorrect occurrences across the document', () => {
    const results = check(makeDocXml('grants.gov', 'GRANTS.GOV', 'grants.gov'));
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('3');
    expect(results[0]!.description).toContain('3 locations');
  });

  it('uses singular "location" for a single correction', () => {
    const results = check(makeDocXml('grants.gov'));
    expect(results[0]!.description).toContain('1 location.');
    expect(results[0]!.description).not.toContain('locations');
  });
});

// ─── No-op cases ──────────────────────────────────────────────────────────────

describe('CLEAN-017: no AutoAppliedChange when no correction needed', () => {
  it('does not flag already-correct "Grants.gov"', () => {
    expect(check(makeDocXml('Grants.gov'))).toHaveLength(0);
  });

  it('does not flag a hyperlink run whose text is already "Grants.gov"', () => {
    expect(check(makeHyperlinkDocXml('Grants.gov'))).toHaveLength(0);
  });

  it('does not flag unrelated text', () => {
    expect(check(makeDocXml('Visit our website for more information.'))).toHaveLength(0);
  });

  it('returns empty array for empty documentXml', () => {
    expect(check('')).toHaveLength(0);
  });
});

// ─── Boundary cases ───────────────────────────────────────────────────────────

describe('CLEAN-017: boundary matching — does not flag substrings in other domains', () => {
  it('does not flag "notgrants.gov" (word char immediately before)', () => {
    expect(check(makeDocXml('See notgrants.gov for details.'))).toHaveLength(0);
  });

  it('does not flag "grants.gov.uk" (dot + alpha TLD extension after)', () => {
    expect(check(makeDocXml('Visit grants.gov.uk for UK info.'))).toHaveLength(0);
  });

  it('does not flag "apply.grants.gov" (dot immediately before)', () => {
    expect(check(makeDocXml('Go to apply.grants.gov to submit.'))).toHaveLength(0);
  });

  it('flags "grants.gov" that appears before a path slash (not a TLD)', () => {
    const results = check(makeDocXml('grants.gov/apply'));
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });
});

// ─── Footnotes and endnotes coverage ─────────────────────────────────────────

describe('CLEAN-017: detects incorrect Grants.gov capitalization in footnotes and endnotes', () => {
  it('detects "grants.gov" in footnotesXml', () => {
    const doc = makeDoc('', { footnotesXml: makeFootnotesXml('See grants.gov for details.') });
    const results = CLEAN_017.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('CLEAN-017');
    expect(results[0]!.value).toBe('1');
  });

  it('detects "grants.gov" in endnotesXml', () => {
    const doc = makeDoc('', { endnotesXml: makeEndnotesXml('Source: GRANTS.GOV.') });
    const results = CLEAN_017.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('counts matches across document body, footnotes, and endnotes', () => {
    const doc = makeDoc(
      makeDocXml('grants.gov'),
      {
        footnotesXml: makeFootnotesXml('grants.gov'),
        endnotesXml: makeEndnotesXml('grants.gov'),
      }
    );
    const results = CLEAN_017.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results[0]!.value).toBe('3');
    expect(results[0]!.description).toMatch(/3 locations/);
  });

  it('does not flag already-correct "Grants.gov" in footnotes', () => {
    const doc = makeDoc('', { footnotesXml: makeFootnotesXml('See Grants.gov for details.') });
    expect(CLEAN_017.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('applies boundary rules to footnote content — does not flag "apply.grants.gov"', () => {
    const doc = makeDoc('', { footnotesXml: makeFootnotesXml('Go to apply.grants.gov to submit.') });
    expect(CLEAN_017.check(doc, OPTIONS)).toHaveLength(0);
  });
});
