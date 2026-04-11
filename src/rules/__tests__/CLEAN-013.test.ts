import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_013 from '../universal/CLEAN-013';
import type { ParsedDocument, Issue } from '../../types';

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [{ id: 'section-basic', heading: 'Basic Information', headingLevel: 2, html: '', rawText: '', startPage: 1 }],
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

describe('CLEAN-013: detects unfilled placeholder text', () => {
  it('detects a single {Insert...} placeholder', () => {
    const doc = makeDoc(
      '<h2>Grants management</h2>' +
      '<p>Contact: {Insert name}</p>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    const issue = results[0]!;
    expect(issue.ruleId).toBe('CLEAN-013');
    expect(issue.severity).toBe('warning');
    expect(issue.title).toBe('Unfilled placeholder text found');
    expect(issue.instructionOnly).toBe(true);
  });

  it('description lists the placeholder with its nearest heading', () => {
    const doc = makeDoc(
      '<h2>Grants management</h2>' +
      '<p>Call {Insert name} at {Insert phone}.</p>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    const { description } = results[0]!;
    expect(description).toContain('{Insert name}');
    expect(description).toContain('{Insert phone}');
    expect(description).toContain('Near: Grants management');
  });

  it('groups multiple placeholders into a single issue', () => {
    const doc = makeDoc(
      '<h2>Section A</h2>' +
      '<p>Contact: {Insert name}</p>' +
      '<p>Phone: {Insert phone}</p>' +
      '<h2>Section B</h2>' +
      '<p>Email: {Insert email address}</p>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    const { description } = results[0]!;
    expect(description).toContain('{Insert name}');
    expect(description).toContain('{Insert phone}');
    expect(description).toContain('{Insert email address}');
    expect(description).toContain('Near: Section A');
    expect(description).toContain('Near: Section B');
  });

  it('is case-insensitive for the word "insert"', () => {
    const doc = makeDoc('<p>{INSERT NAME}</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects placeholder in a list item', () => {
    const doc = makeDoc(
      '<h2>Contact</h2>' +
      '<ul><li>Name: {Insert name}</li></ul>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toContain('{Insert name}');
  });

  it('records nearest heading as null when placeholder appears before any heading', () => {
    const doc = makeDoc('<p>Contact: {Insert name}</p>');
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    // No "Near:" line when heading is null
    expect(results[0]!.description).not.toContain('Near:');
  });
});

// ─── Deduplication ───────────────────────────────────────────────────────────

describe('CLEAN-013: deduplicates identical placeholder + heading pairs', () => {
  it('shows each unique (placeholder, heading) pair only once', () => {
    const doc = makeDoc(
      '<h2>Contact</h2>' +
      '<p>{Insert name} — primary contact</p>' +
      '<p>{Insert name} — secondary contact</p>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    const { description } = results[0]!;
    // Should appear exactly once
    const occurrences = (description.match(/\{Insert name\}/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('shows the same placeholder text separately when it appears under different headings', () => {
    const doc = makeDoc(
      '<h2>Section A</h2>' +
      '<p>{Insert name}</p>' +
      '<h2>Section B</h2>' +
      '<p>{Insert name}</p>'
    );
    const results = CLEAN_013.check(doc, OPTIONS) as Issue[];
    expect(results).toHaveLength(1);
    const { description } = results[0]!;
    // Should appear twice (different headings)
    const occurrences = (description.match(/\{Insert name\}/g) ?? []).length;
    expect(occurrences).toBe(2);
  });
});

// ─── Exclusions ──────────────────────────────────────────────────────────────

describe('CLEAN-013: does not flag excluded contexts', () => {
  it('does not flag a metadata author paragraph', () => {
    const doc = makeDoc('<p>Author: {Insert author name}</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a "Metadata author:" paragraph', () => {
    const doc = makeDoc('<p>Metadata author: {Insert full opdiv name}</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a "Metadata subject:" paragraph', () => {
    const doc = makeDoc('<p>Metadata subject: {Insert NOFO description}</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a "Keywords:" paragraph', () => {
    const doc = makeDoc('<p>Keywords: {Insert keyword 1}</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag content in a single-cell table (callout box)', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td>' +
      '<p>Note: replace {Insert name} before submitting.</p>' +
      '</td></tr></tbody></table>'
    );
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag text with curly braces that does not contain "insert"', () => {
    const doc = makeDoc('<p>See section {3.2} for details.</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no issues when there are no placeholders', () => {
    const doc = makeDoc('<p>No placeholder text here.</p>');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no issues for an empty document', () => {
    const doc = makeDoc('');
    expect(CLEAN_013.check(doc, OPTIONS)).toHaveLength(0);
  });
});
