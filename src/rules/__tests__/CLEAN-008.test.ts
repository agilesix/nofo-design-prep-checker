import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_008 from '../universal/CLEAN-008';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: html.replace(/<[^>]+>/g, ''),
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection: headings with leading spaces ──────────────────────────────────

describe('CLEAN-008: leading space detected in headings', () => {
  it('detects a single heading with a leading space and returns an AutoAppliedChange', () => {
    const doc = makeDoc('<h2> Introduction</h2><p>Body text here.</p>');
    const results = CLEAN_008.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-008');
    expect(change.targetField).toBe('heading.leadingspace');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 heading');
  });

  it('counts multiple headings with leading spaces and reports singular/plural correctly', () => {
    const doc = makeDoc('<h1> Title</h1><h2> Section</h2><h3>No space here</h3>');
    const results = CLEAN_008.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
    expect(change.description).toContain('2 headings');
  });

  it('detects leading spaces on all heading levels h1 through h6', () => {
    const doc = makeDoc(
      '<h1> H1</h1><h2> H2</h2><h3> H3</h3><h4> H4</h4><h5> H5</h5><h6> H6</h6>'
    );
    const results = CLEAN_008.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('6');
  });

  it('uses singular "heading" when exactly one heading is affected', () => {
    const doc = makeDoc('<h1> Only One</h1>');
    const results = CLEAN_008.check(doc, OPTIONS);
    const change = results[0] as AutoAppliedChange;
    expect(change.description).toMatch(/1 heading[^s]/);
  });
});

// ─── No-op: headings without leading spaces ───────────────────────────────────

describe('CLEAN-008: no changes when headings have no leading spaces', () => {
  it('returns no changes for a heading with no leading space', () => {
    const doc = makeDoc('<h2>Introduction</h2><p>Body text here.</p>');
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when document has no headings', () => {
    const doc = makeDoc('<p>Just a paragraph.</p>');
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for an empty document', () => {
    const doc = makeDoc('');
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Scope: only headings, not body paragraphs ───────────────────────────────

describe('CLEAN-008: does not flag non-heading paragraphs', () => {
  it('does not flag a body paragraph with a leading space', () => {
    const doc = makeDoc('<p> This paragraph has a leading space.</p><h2>Clean Heading</h2>');
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a list item with a leading space', () => {
    const doc = makeDoc('<ul><li> Item with leading space</li></ul><h2>Clean Heading</h2>');
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table cell with a leading space', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td> Cell with leading space</td></tr></tbody></table>' +
      '<h2>Clean Heading</h2>'
    );
    expect(CLEAN_008.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('detects the heading with leading space while ignoring body paragraphs with leading spaces', () => {
    const doc = makeDoc('<p> Body leading space</p><h2> Heading leading space</h2>');
    const results = CLEAN_008.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
  });
});
