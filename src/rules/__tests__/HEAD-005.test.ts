import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_004 from '../universal/HEAD-004';
import HEAD_005 from '../universal/HEAD-005';
import type { ParsedDocument, Issue } from '../../types';

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

// ─── HEAD-005 threshold detection ────────────────────────────────────────────

describe('HEAD-005: flags headings that exceed 20 words or 150 characters', () => {
  it('flags an H3 with more than 20 words', () => {
    // 21 words
    const text =
      'This heading has twenty one words and is therefore long enough to be flagged by the HEAD 005 rule right here';
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    const results = HEAD_005.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-005');
    expect(issue.severity).toBe('suggestion');
    expect(issue.title).toBe('Heading may be misformatted normal text');
  });

  it('flags an H3 over 150 characters (≤ 20 words)', () => {
    // 10 words but > 150 chars
    const text = 'Eligibility requirements for '.repeat(6).trim();
    expect(text.length).toBeGreaterThan(150);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    const results = HEAD_005.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('does not flag an H3 at exactly 20 words', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
    expect(text.split(/\s+/).length).toBe(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 at exactly 150 characters', () => {
    const text = 'a'.repeat(150);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 under both thresholds', () => {
    const text = 'Short heading for a section';
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Heading level exclusions ─────────────────────────────────────────────────

describe('HEAD-005: does not check H1 or H2', () => {
  it('does not flag an H1 over both thresholds', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h1>${text}</h1>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 over both thresholds', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h2>${text}</h2>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags H4, H5, and H6 in addition to H3', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h4>${text}</h4><h5>${text}</h5><h6>${text}</h6>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(3);
  });
});

// ─── Colon exception ──────────────────────────────────────────────────────────

describe('HEAD-005: does not flag headings ending with a colon', () => {
  it('skips a very long H3 that ends with a colon', () => {
    const text =
      'This is an extremely long heading that ends with a colon and should therefore never be flagged by either rule regardless of length:';
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags a long H3 that does not end with a colon', () => {
    const text =
      'This is an extremely long heading that does not end with a colon and should therefore be flagged by the rule here';
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── Description and accept wiring ───────────────────────────────────────────

describe('HEAD-005: description and issue fields', () => {
  it('truncates heading text to 60 chars with ellipsis in the description', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('…'); // ellipsis character
    expect(issue.description).not.toContain(text); // full text should not appear
  });

  it('includes the word count in the description', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const wordCount = text.split(/\s+/).length;
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain(`${wordCount} word`);
  });

  it('uses the acceptLabel "Change to normal text"', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.acceptLabel).toBe('Change to normal text');
  });

  it('has no inputRequired (accept-only card)', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired).toBeUndefined();
  });

  it('encodes heading level and ordinal index in the targetField', () => {
    // H1(0), H2(1), H3(2) short, H3(3) long — index for the long one is 3
    const shortText = 'Short heading';
    const longText =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(
      `<h1>Title</h1><h2>Step 1</h2><h3>${shortText}</h3><h3>${longText}</h3>`
    );
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.targetField).toBe(`heading.style.H3.3::${longText}`);
  });

  it('sets nearestHeading to the full (untruncated) heading text', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_005.check(doc, OPTIONS)[0] as Issue;
    expect(issue.nearestHeading).toBe(text);
  });
});

// ─── HEAD-004 suppression ─────────────────────────────────────────────────────

describe('HEAD-004 is suppressed when HEAD-005 fires on the same heading', () => {
  it('HEAD-005 fires and HEAD-004 does not for a heading over 20 words', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one';
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(1);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('HEAD-004 fires and HEAD-005 does not for a heading between 10 and 20 words', () => {
    // 11 words — above HEAD-004 threshold, below HEAD-005 threshold
    const text = 'This heading has eleven words so it should be flagged here';
    expect(text.split(/\s+/).length).toBe(11);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(1);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('neither HEAD-004 nor HEAD-005 fires for a long heading ending with a colon', () => {
    const text =
      'This is an extremely long heading that ends with a colon and should not be flagged by either rule regardless of length:';
    expect(text.split(/\s+/).length).toBeGreaterThan(20);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
    expect(HEAD_005.check(doc, OPTIONS)).toHaveLength(0);
  });
});
