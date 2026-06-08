import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CDC_001 from '../opdiv/CDC-001';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const OPTIONS = { contentGuideId: 'cdc' as const };

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml: '',
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
