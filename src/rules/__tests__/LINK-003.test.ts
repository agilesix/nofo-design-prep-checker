import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_003 from '../universal/LINK-003';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

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

/** Minimal document.xml with a single body paragraph containing one text run. */
function makeBodyDocXml(text: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}"><w:body>` +
    `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

/** Minimal document.xml with a hyperlink carrying the given link text. */
function makeHyperlinkDocXml(rId: string, linkText: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>` +
    `<w:p><w:hyperlink r:id="${rId}">` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${linkText}</w:t></w:r>` +
    `</w:hyperlink></w:p>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

describe('LINK-003: Grants.gov capitalization (detection)', () => {
  it('is a silent auto-apply rule', () => {
    expect(LINK_003.autoApply).toBe(true);
  });

  it('detects "grants.gov" as full hyperlink text', () => {
    const doc = makeDoc(makeHyperlinkDocXml('rId1', 'grants.gov'));
    const results = LINK_003.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('LINK-003');
    expect(results[0]!.targetField).toBe('link.grantsgov.capitalization');
    expect(results[0]!.value).toBe('1');
    expect(results[0]!.description).toMatch(/1 location/);
  });

  it('detects "grants.gov" embedded in longer hyperlink text', () => {
    const doc = makeDoc(makeHyperlinkDocXml('rId1', 'visit grants.gov for more details'));
    const results = LINK_003.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('detects "grants.gov" in plain body text', () => {
    const doc = makeDoc(makeBodyDocXml('Submit your application at grants.gov today.'));
    const results = LINK_003.check(doc, OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('detects "GRANTS.GOV" (all caps)', () => {
    const doc = makeDoc(makeBodyDocXml('Apply at GRANTS.GOV.'));
    expect(LINK_003.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('does not flag already-correct "Grants.gov"', () => {
    const doc = makeDoc(makeBodyDocXml('Visit Grants.gov for details.'));
    expect(LINK_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('counts multiple w:t locations and uses plural description', () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>` +
      `<w:p><w:hyperlink r:id="rId1"><w:r><w:t>grants.gov</w:t></w:r></w:hyperlink></w:p>` +
      `<w:p><w:r><w:t>Submit at GRANTS.GOV today.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const results = LINK_003.check(makeDoc(xml), OPTIONS) as AutoAppliedChange[];
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('2');
    expect(results[0]!.description).toMatch(/2 locations/);
  });

  it('returns empty array when documentXml is absent', () => {
    const doc = makeDoc('');
    expect(LINK_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});
