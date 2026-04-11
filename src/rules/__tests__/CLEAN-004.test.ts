import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_004 from '../universal/CLEAN-004';
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

describe('CLEAN-004: detection', () => {
  it('detects a double space in a paragraph', () => {
    const doc = makeDoc('<p>Hello  world.</p>');
    const results = CLEAN_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-004');
    expect(change.targetField).toBe('text.doublespace');
    expect(change.value).toBe('1');
  });

  it('detects a run of three consecutive spaces as one instance', () => {
    // Three spaces form a single run — the regex / {2,}/g matches the entire
    // run in one pass, producing one match and one instance count.
    const doc = makeDoc('<p>Hello   world.</p>');
    const results = CLEAN_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 instance');
  });

  it('detects a run of four consecutive spaces as one instance', () => {
    const doc = makeDoc('<p>Hello    world.</p>');
    const results = CLEAN_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts two separate double-space runs as two instances', () => {
    const doc = makeDoc('<p>A  B  C.</p>');
    const results = CLEAN_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });

  it('returns no changes when there are no double spaces', () => {
    const doc = makeDoc('<p>Hello world.</p>');
    expect(CLEAN_004.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Exclusions ───────────────────────────────────────────────────────────────

describe('CLEAN-004: exclusions', () => {
  it('does not flag double spaces inside a heading', () => {
    const doc = makeDoc('<h2>Hello  World</h2>');
    expect(CLEAN_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag double spaces inside a table cell', () => {
    const doc = makeDoc('<table><tr><td>Hello  world</td></tr></table>');
    expect(CLEAN_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag double spaces inside a code block', () => {
    const doc = makeDoc('<p><code>foo  bar</code></p>');
    expect(CLEAN_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag double spaces inside a pre block', () => {
    const doc = makeDoc('<pre>foo  bar</pre>');
    expect(CLEAN_004.check(doc, OPTIONS)).toHaveLength(0);
  });
});
