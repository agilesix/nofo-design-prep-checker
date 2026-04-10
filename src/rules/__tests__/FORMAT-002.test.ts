import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import FORMAT_002 from '../universal/FORMAT-002';
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
const HRSA_OPTIONS = { contentGuideId: 'hrsa-bhw' } as const;

// ─── Detection: numeric formats ───────────────────────────────────────────────

describe('FORMAT-002: detects numeric date formats', () => {
  it('detects YYYY-MM-DD', () => {
    const doc = makeDoc('<p>Due date: 2026-04-16.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('FORMAT-002');
    expect(change.targetField).toBe('format.date.correct');
    expect(change.value).toBe('1');
  });

  it('detects MM/DD/YYYY', () => {
    const doc = makeDoc('<p>Due date: 04/16/2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('does not detect MM/DD/YY (2-digit year)', () => {
    const doc = makeDoc('<p>Due date: 04/16/26.</p>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Detection: month-name formats ───────────────────────────────────────────

describe('FORMAT-002: detects month-name date format issues', () => {
  it('detects ordinal suffix: April 16th, 2026', () => {
    const doc = makeDoc('<p>Due date: April 16th, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects ordinal suffix for first-of-month: April 1st, 2026', () => {
    const doc = makeDoc('<p>Due date: April 1st, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects missing comma: April 16 2026', () => {
    const doc = makeDoc('<p>Due date: April 16 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects abbreviated month with period: Apr. 2, 2026', () => {
    const doc = makeDoc('<p>Due date: Apr. 2, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects abbreviated month without period: Apr 2, 2026', () => {
    const doc = makeDoc('<p>Due date: Apr 2, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects Sept abbreviation: Sept 2, 2026', () => {
    const doc = makeDoc('<p>Due date: Sept 2, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects leading-zero day: April 02, 2026', () => {
    const doc = makeDoc('<p>Due date: April 02, 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects combined issues: abbreviated month + ordinal + missing comma', () => {
    const doc = makeDoc('<p>Due date: Apr. 16th 2026.</p>');
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts multiple non-standard dates across patterns', () => {
    const doc = makeDoc(
      '<p>Start: 2026-04-01. Due: 04/30/2026. Close: April 16th, 2026. Also: Apr 5, 2026.</p>'
    );
    const results = FORMAT_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('4');
  });
});

// ─── No-op: already correct or excluded ──────────────────────────────────────

describe('FORMAT-002: does not detect standard or excluded dates', () => {
  it('returns no changes for an already-correct date: April 16, 2026', () => {
    const doc = makeDoc('<p>Due date: April 16, 2026.</p>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when document has no dates', () => {
    const doc = makeDoc('<p>No dates here.</p>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a date in a heading', () => {
    const doc = makeDoc('<h2>Deadline: 2026-04-16</h2>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a date nested inside a heading', () => {
    const doc = makeDoc('<h1><strong>Deadline: April 16th, 2026</strong></h1>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for HRSA content guide', () => {
    const doc = makeDoc('<p>Due date: 2026-04-16.</p>');
    expect(FORMAT_002.check(doc, HRSA_OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for an empty document', () => {
    const doc = makeDoc('');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not detect a date in a <code> block', () => {
    const doc = makeDoc('<p><code>2026-04-16</code></p>');
    expect(FORMAT_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Description field ───────────────────────────────────────────────────────

describe('FORMAT-002: AutoAppliedChange shape', () => {
  it('uses singular "instance" when only one date is corrected', () => {
    const doc = makeDoc('<p>Due: 2026-04-16.</p>');
    const change = FORMAT_002.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('1 instance(s)');
  });

  it('includes the count in the description for multiple instances', () => {
    const doc = makeDoc('<p>2026-04-01 and 04/16/2026.</p>');
    const change = FORMAT_002.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('2 instance(s)');
  });
});
