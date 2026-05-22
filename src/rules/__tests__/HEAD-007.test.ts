import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_007 from '../universal/HEAD-007';
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

// ─── Detection: emits AutoAppliedChange ──────────────────────────────────────

describe('HEAD-007: detects "Intergovernmental Review" and emits AutoAppliedChange', () => {
  it('emits a change for an H2 with title-case "Intergovernmental Review"', () => {
    const doc = makeDoc('<h2>Intergovernmental Review</h2>');
    const results = HEAD_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('HEAD-007');
    expect(change.targetField).toBe('heading.intergovernmentalreview.sentencecase');
  });

  it('emits a change for an H3 with title-case "Intergovernmental Review"', () => {
    const doc = makeDoc('<h3>Intergovernmental Review</h3>');
    const results = HEAD_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).ruleId).toBe('HEAD-007');
  });

  it('emits a change for an H4 with title-case "Intergovernmental Review"', () => {
    const doc = makeDoc('<h4>Intergovernmental Review</h4>');
    const results = HEAD_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).ruleId).toBe('HEAD-007');
  });

  it('matches case-insensitively (all-caps variant)', () => {
    const doc = makeDoc('<h3>INTERGOVERNMENTAL REVIEW</h3>');
    const results = HEAD_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('matches case-insensitively (all-lowercase variant)', () => {
    const doc = makeDoc('<h3>intergovernmental review</h3>');
    const results = HEAD_007.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('description mentions the correction', () => {
    const doc = makeDoc('<h2>Intergovernmental Review</h2>');
    const change = HEAD_007.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('Intergovernmental');
    expect(change.description).toContain('sentence case');
  });

  it('value reflects the number of matching headings', () => {
    const doc = makeDoc(
      '<h2>Intergovernmental Review</h2>' +
      '<h3>Intergovernmental Review</h3>'
    );
    const change = HEAD_007.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
  });
});

// ─── No match: returns [] ─────────────────────────────────────────────────────

describe('HEAD-007: returns [] when no matching heading is present', () => {
  it('returns [] when there are no headings at all', () => {
    const doc = makeDoc('<p>Some body text.</p>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns [] when the heading text is different', () => {
    const doc = makeDoc('<h2>Program Description</h2>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns [] when the heading contains extra surrounding text', () => {
    const doc = makeDoc('<h3>About Intergovernmental Review processes</h3>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not match H1 headings', () => {
    const doc = makeDoc('<h1>Intergovernmental Review</h1>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not match H5 headings', () => {
    const doc = makeDoc('<h5>Intergovernmental Review</h5>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Already correct: returns [] ─────────────────────────────────────────────

describe('HEAD-007: returns [] when heading is already "Intergovernmental review"', () => {
  it('returns [] for an H2 already in sentence case', () => {
    const doc = makeDoc('<h2>Intergovernmental review</h2>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns [] for an H3 already in sentence case', () => {
    const doc = makeDoc('<h3>Intergovernmental review</h3>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns [] for an H4 already in sentence case', () => {
    const doc = makeDoc('<h4>Intergovernmental review</h4>');
    expect(HEAD_007.check(doc, OPTIONS)).toHaveLength(0);
  });
});
