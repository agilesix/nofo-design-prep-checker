import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_007 from '../universal/LINK-007';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection ────────────────────────────────────────────────────────────────

describe('LINK-007: detection', () => {
  it('detects an external PDF link without [PDF] label', () => {
    const doc = makeDoc('<p><a href="https://example.com/report.pdf">Annual Report</a></p>');
    const results = LINK_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-007');
    expect(change.targetField).toBe('link.pdf.label');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 external PDF link');
  });

  it('uses plural description for multiple links', () => {
    const doc = makeDoc(
      '<p><a href="https://example.com/a.pdf">Report A</a></p>' +
      '<p><a href="https://example.com/b.pdf">Report B</a></p>'
    );
    const results = LINK_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
    expect(change.description).toContain('2 external PDF links');
  });

  it('counts three links needing [PDF] label', () => {
    const doc = makeDoc(
      '<p><a href="https://example.com/a.pdf">A</a></p>' +
      '<p><a href="https://example.com/b.pdf">B</a></p>' +
      '<p><a href="https://example.com/c.pdf">C</a></p>'
    );
    const results = LINK_007.check(doc, OPTIONS);
    expect((results[0] as AutoAppliedChange).value).toBe('3');
  });

  it('flags a PDF link where [PDF] appears in the middle but not at the end', () => {
    const doc = makeDoc('<p><a href="https://example.com/report.pdf">[PDF] Annual Report</a></p>');
    const results = LINK_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects a PDF link with uppercase .PDF in the URL', () => {
    const doc = makeDoc('<p><a href="https://example.com/REPORT.PDF">Annual Report</a></p>');
    const results = LINK_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });
});

// ─── No-ops ───────────────────────────────────────────────────────────────────

describe('LINK-007: no changes when [PDF] is already present', () => {
  it('does not flag a PDF link that already ends with [PDF]', () => {
    const doc = makeDoc('<p><a href="https://example.com/report.pdf">Annual Report [PDF]</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a PDF link that ends with [pdf] (case-insensitive)', () => {
    const doc = makeDoc('<p><a href="https://example.com/report.pdf">Annual Report [pdf]</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a PDF link that ends with [PDF] when URL is uppercase .PDF', () => {
    const doc = makeDoc('<p><a href="https://example.com/REPORT.PDF">Annual Report [PDF]</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Exclusions ───────────────────────────────────────────────────────────────

describe('LINK-007: exclusions', () => {
  it('does not flag a non-PDF external link', () => {
    const doc = makeDoc('<p><a href="https://example.com/page.html">Page</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an internal anchor link that contains .pdf', () => {
    const doc = makeDoc('<p><a href="#annual-report.pdf">See report</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a mailto link', () => {
    const doc = makeDoc('<p><a href="mailto:user@example.pdf">Email</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an http-less URL containing .pdf', () => {
    const doc = makeDoc('<p><a href="example.com/report.pdf">Report</a></p>');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when doc.html is empty', () => {
    const doc = makeDoc('');
    expect(LINK_007.check(doc, OPTIONS)).toHaveLength(0);
  });
});
