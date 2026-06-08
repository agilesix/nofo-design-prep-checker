import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CDC_001 from '../opdiv/CDC-001';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OPTIONS = { contentGuideId: 'cdc' as const };

function makeDoc(html: string, documentXml = ''): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: {
      id: 'cdc',
      source: 'detected',
      entry: {
        id: 'cdc',
        displayName: 'CDC',
        opDiv: 'CDC',
        version: '1.0',
        updatedAt: '2024-01-01',
        detectionSignals: { names: [], abbreviations: [] },
      },
    },
  };
}

function wrapXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}

function makeH2Para(text: string): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r></w:p>`
  );
}

function makeH5ParaWithBookmark(text: string, bookmarkName: string): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr>` +
    `<w:bookmarkStart w:id="1" w:name="${bookmarkName}"/>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `<w:bookmarkEnd w:id="1"/></w:p>`
  );
}

function makeBulletPara(text: string): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Bulletlevel1"/></w:pPr>` +
    `<w:r><w:rPr><w:u w:val="single"/><w:highlight w:val="yellow"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

// ─── Canonical trigger case ───────────────────────────────────────────────────

describe('CDC-001: fires when all conditions are met', () => {
  it('emits a CDC-001 AutoAppliedChange with the correct anchor slug', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul>
        <li>Approach</li>
        <li>Financial capability statement</li>
      </ul>
      <h4>Financial capability statement</h4>
      <p>Details here.</p>
      <h2>Evaluation</h2>
    `;
    const results = CDC_001.check(makeDoc(html), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CDC-001');
    expect(change.targetField).toBe('cdc.financial.capability.link');
    expect(change.value).toBe('Financial_capability_statement');
  });

  it('matches the bullet text case-insensitively', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>FINANCIAL CAPABILITY STATEMENT</li></ul>
      <h5>Financial capability statement</h5>
    `;
    const results = CDC_001.check(makeDoc(html), OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('Financial_capability_statement');
  });

  it('accepts the bullet as a <p> paragraph (not only <li>)', () => {
    const html = `
      <h2>Project narrative</h2>
      <p>Financial capability statement</p>
      <h4>Financial capability statement</h4>
    `;
    const results = CDC_001.check(makeDoc(html), OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('accepts an H5 heading as the link target', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Financial capability statement</li></ul>
      <h5>Financial capability statement</h5>
    `;
    const results = CDC_001.check(makeDoc(html), OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('accepts an H6 heading as the link target', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Financial capability statement</li></ul>
      <h6>Financial capability statement</h6>
    `;
    const results = CDC_001.check(makeDoc(html), OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('fires for cdc-dght-ssj guide', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Financial capability statement</li></ul>
      <h4>Financial capability statement</h4>
    `;
    const doc = { ...makeDoc(html), activeContentGuide: null };
    const results = CDC_001.check(doc, { contentGuideId: 'cdc-dght-ssj' });
    expect(results).toHaveLength(1);
  });
});

// ─── Silent-skip conditions ───────────────────────────────────────────────────

describe('CDC-001: skips silently when conditions are not met', () => {
  it('skips when no "Project narrative" H2 exists', () => {
    const html = `
      <h2>Background</h2>
      <ul><li>Financial capability statement</li></ul>
      <h4>Financial capability statement</h4>
    `;
    expect(CDC_001.check(makeDoc(html), OPTIONS)).toHaveLength(0);
  });

  it('skips when no matching H4–H6 heading exists in the document', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Financial capability statement</li></ul>
      <h4>Some other heading</h4>
    `;
    expect(CDC_001.check(makeDoc(html), OPTIONS)).toHaveLength(0);
  });

  it('skips when the matching heading is at H3 (out of H4–H6 range)', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Financial capability statement</li></ul>
      <h3>Financial capability statement</h3>
    `;
    expect(CDC_001.check(makeDoc(html), OPTIONS)).toHaveLength(0);
  });

  it('skips when the bullet already has an internal hyperlink', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li><a href="#Financial_capability_statement">Financial capability statement</a></li></ul>
      <h4>Financial capability statement</h4>
    `;
    expect(CDC_001.check(makeDoc(html), OPTIONS)).toHaveLength(0);
  });

  it('skips when "Financial capability statement" is outside the Project narrative section', () => {
    const html = `
      <h2>Project narrative</h2>
      <ul><li>Approach</li></ul>
      <h2>Other section</h2>
      <ul><li>Financial capability statement</li></ul>
      <h4>Financial capability statement</h4>
    `;
    expect(CDC_001.check(makeDoc(html), OPTIONS)).toHaveLength(0);
  });

  it('skips when the document has no html content', () => {
    expect(CDC_001.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });
});

// ─── OOXML bookmark regression ────────────────────────────────────────────────

describe('CDC-001: OOXML-based heading detection', () => {
  it('uses existing w:bookmarkStart name directly when heading already has one', () => {
    // The heading in OOXML has style "Heading5" (no space — mammoth would emit
    // <p> not <h5>) and carries bookmark "_Financial_capability_statement".
    // The rule must emit that exact name rather than slugifyHeading's output.
    const html = `
      <h2>Project narrative</h2>
      <p>Financial capability statement</p>
    `;
    const documentXml = wrapXml(
      makeH2Para('Project narrative') +
      makeBulletPara('Financial capability statement') +
      makeH5ParaWithBookmark('Financial capability statement', '_Financial_capability_statement')
    );
    const results = CDC_001.check(makeDoc(html, documentXml), OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CDC-001');
    expect(change.targetField).toBe('cdc.financial.capability.link');
    expect(change.value).toBe('_Financial_capability_statement');
  });

  it('skips silently when no matching H4–H6 heading exists in OOXML', () => {
    // documentXml is present but contains no H4–H6 heading with matching text,
    // so OOXML detection returns null and the rule must return [].
    const html = `
      <h2>Project narrative</h2>
      <p>Financial capability statement</p>
    `;
    const documentXml = wrapXml(
      makeH2Para('Project narrative') +
      makeBulletPara('Financial capability statement') +
      `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr>` +
      `<w:r><w:t>Some other heading</w:t></w:r></w:p>`
    );
    expect(CDC_001.check(makeDoc(html, documentXml), OPTIONS)).toHaveLength(0);
  });
});
