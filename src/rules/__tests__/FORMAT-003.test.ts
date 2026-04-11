import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import FORMAT_003 from '../universal/FORMAT-003';
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

// ─── Detection: AM/PM normalization ──────────────────────────────────────────

describe('FORMAT-003: detects non-standard AM/PM forms', () => {
  it('detects uppercase AM', () => {
    const doc = makeDoc('<p>Applications close at 11:00 AM.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('FORMAT-003');
    expect(change.targetField).toBe('format.time.correct');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 instance');
  });

  it('detects uppercase PM', () => {
    const doc = makeDoc('<p>Deadline is 3:30 PM EDT.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects uppercase A.M. (with periods)', () => {
    const doc = makeDoc('<p>Due at 9:00 A.M.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects uppercase P.M. (with periods)', () => {
    const doc = makeDoc('<p>Due at 5:00 P.M.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects A.M without trailing period', () => {
    const doc = makeDoc('<p>Due at 9:00 A.M.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects lowercase am (no periods)', () => {
    const doc = makeDoc('<p>Due at 9:00 am.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects lowercase pm (no periods)', () => {
    const doc = makeDoc('<p>Due at 3:30 pm EDT.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects time without space before AM: "11AM"', () => {
    const doc = makeDoc('<p>Submit by 11AM.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── Detection: :00 removal ───────────────────────────────────────────────────

describe('FORMAT-003: detects :00 on exact hours', () => {
  it('detects :00 on correct a.m. form', () => {
    const doc = makeDoc('<p>Applications close at 11:00 a.m.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects :00 on correct p.m. form', () => {
    const doc = makeDoc('<p>Deadline is 3:00 p.m.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('does not flag non-zero minutes: "3:30 p.m." unchanged', () => {
    const doc = makeDoc('<p>The event is at 3:30 p.m.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag non-zero minutes: "11:30 a.m." unchanged', () => {
    const doc = makeDoc('<p>Webinar at 11:30 a.m. ET.</p>');
    // "a.m." is correct and :30 is not :00 — only flag if timezone present
    // "ET" is already correct (not a conversion target) → no detection
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Detection: timezone normalization ────────────────────────────────────────

describe('FORMAT-003: detects non-standard timezone abbreviations', () => {
  it('detects EST after time expression', () => {
    const doc = makeDoc('<p>At 11:00 AM EST.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects EDT after time expression', () => {
    const doc = makeDoc('<p>Deadline: 3:30 PM EDT.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects CST after time expression', () => {
    const doc = makeDoc('<p>At 2:00 PM CST.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects PST after correct a.m./p.m. form', () => {
    const doc = makeDoc('<p>At 11 a.m. PST.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── Detection: combined and multiple instances ──────────────────────────────

describe('FORMAT-003: counts multiple instances', () => {
  it('counts "11:00 AM EST → 11 a.m. ET" as one instance', () => {
    const doc = makeDoc('<p>Applications close at 11:00 AM EST.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts "3:30 PM EDT → 3:30 p.m. ET" as one instance', () => {
    const doc = makeDoc('<p>Deadline is 3:30 PM EDT.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts "9:00 am → 9 a.m." as one instance', () => {
    const doc = makeDoc('<p>Due at 9:00 am.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('counts multiple time expressions across paragraphs', () => {
    const doc = makeDoc(
      '<p>Open: 9:00 AM EST.</p>' +
      '<p>Close: 5:00 PM EST.</p>'
    );
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
    expect((results[0] as AutoAppliedChange).description).toContain('2 instances');
  });

  it('counts multiple time expressions in same paragraph', () => {
    const doc = makeDoc('<p>Open at 9:00 AM and close at 5:00 PM EST.</p>');
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });
});

// ─── Detection: list items ────────────────────────────────────────────────────

describe('FORMAT-003: detects non-standard times in list items', () => {
  it('detects time in an unordered list item', () => {
    const doc = makeDoc(
      '<ul><li>Submit applications by 11:00 AM.</li></ul>'
    );
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects time in an ordered list item', () => {
    const doc = makeDoc(
      '<ol><li>Applications close at 9:00 am EST.</li></ol>'
    );
    const results = FORMAT_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-ops: already correct or absent ───────────────────────────────────────

describe('FORMAT-003: does not flag correct or absent times', () => {
  it('returns no changes for already-correct "11 a.m."', () => {
    const doc = makeDoc('<p>Applications close at 11 a.m.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for already-correct "3:30 p.m. ET"', () => {
    const doc = makeDoc('<p>Deadline is 3:30 p.m. ET.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for already-correct "11 a.m. CT"', () => {
    const doc = makeDoc('<p>Call begins at 11 a.m. CT.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when no times present', () => {
    const doc = makeDoc('<p>No time references here.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for an empty document', () => {
    const doc = makeDoc('');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag standalone "EST" not following a time', () => {
    const doc = makeDoc('<p>This is EST funding.</p>');
    expect(FORMAT_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Description field ───────────────────────────────────────────────────────

describe('FORMAT-003: AutoAppliedChange shape', () => {
  it('includes the count in the description for a single instance', () => {
    const doc = makeDoc('<p>Due at 11:00 AM.</p>');
    const change = FORMAT_003.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('1 instance');
    expect(change.description).not.toContain('instances');
  });

  it('includes the count in the description for multiple instances', () => {
    const doc = makeDoc('<p>Open 9:00 AM, close 5:00 PM.</p>');
    const change = FORMAT_003.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toContain('2 instances');
  });
});
