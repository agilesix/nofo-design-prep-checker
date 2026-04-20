import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_004 from '../universal/HEAD-004';
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

// ─── Threshold detection ──────────────────────────────────────────────────────

describe('HEAD-004: flags headings that exceed word or character limits', () => {
  it('flags an H3 with more than 10 words and describes it in words', () => {
    // 11 words, under 80 chars — only the word threshold fires
    const text = 'This heading has eleven words so it should be flagged here';
    expect(text.split(/\s+/).length).toBe(11);
    expect(text.length).toBeLessThanOrEqual(80);
    const doc = makeDoc(`<h3>${text}</h3>`);
    const results = HEAD_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-004');
    expect(issue.severity).toBe('suggestion');
    expect(issue.title).toBe('Heading may be too long');
    expect(issue.description).toContain(text);
    expect(issue.description).toContain('11 words long');
    expect(issue.description).not.toContain('characters');
    expect(issue.description).toContain('WCAG 2.0 G130');
  });

  it('flags an H3 over 80 characters (≤ 10 words) and describes it in characters', () => {
    // 7 words, 81+ characters — only the character threshold fires
    const text = 'Eligibility requirements for supplemental emergency preparedness funding applicants';
    expect(text.length).toBeGreaterThan(80);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(10);
    const doc = makeDoc(`<h3>${text}</h3>`);
    const results = HEAD_004.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.description).toContain(`${text.length} characters long`);
    expect(issue.description).not.toContain('words long');
  });

  it('flags an H3 over both thresholds and includes both counts in the description', () => {
    // 12 words, 93+ characters — both thresholds fire
    const text = 'Eligibility requirements for supplemental emergency preparedness funding applicants in your state';
    expect(text.split(/\s+/).length).toBeGreaterThan(10);
    expect(text.length).toBeGreaterThan(80);
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_004.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('words');
    expect(issue.description).toContain('characters');
  });

  it('does not flag an H3 under both thresholds', () => {
    const text = 'Eligibility requirements';
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 with exactly 10 words', () => {
    const doc = makeDoc('<h3>One two three four five six seven eight nine ten</h3>');
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 with exactly 80 characters', () => {
    const text = 'a'.repeat(80);
    const doc = makeDoc(`<h3>${text}</h3>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Heading level exclusions ─────────────────────────────────────────────────

describe('HEAD-004: does not check H1 or H2', () => {
  it('does not flag an H1 over both thresholds', () => {
    const text = 'This heading has eleven words so it should never be flagged here';
    const doc = makeDoc(`<h1>${text}</h1>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 over both thresholds', () => {
    const text = 'This heading has eleven words so it should never be flagged here';
    const doc = makeDoc(`<h2>${text}</h2>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags H4, H5, and H6 in addition to H3', () => {
    const text = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h4>${text}</h4><h5>${text}</h5><h6>${text}</h6>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(3);
  });
});

// ─── Proper noun phrase exclusion ─────────────────────────────────────────────

describe('HEAD-004: skips proper noun phrases', () => {
  it('does not flag a heading that is entirely a proper noun phrase', () => {
    const doc = makeDoc(
      '<h3>National Center for the Advancement of Community Health and Social Services</h3>'
    );
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags a long heading that is not a proper noun phrase', () => {
    const doc = makeDoc(
      '<h3>This section describes the eligibility requirements that applicants must meet to be considered</h3>'
    );
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── inputRequired ────────────────────────────────────────────────────────────

describe('HEAD-004: inputRequired wiring', () => {
  it('provides a text input pre-filled with the current heading text', () => {
    const text = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_004.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired).toBeDefined();
    expect(issue.inputRequired!.type).toBe('text');
    expect(issue.inputRequired!.label).toBe('Revised heading');
    expect(issue.inputRequired!.prefill).toBe(text);
    expect(issue.inputRequired!.fieldDescription).toContain('H3');
  });

  it('encodes heading level and ordinal index in the targetField', () => {
    // H1(0), H2(1), H3(2=first h3), H3(3=second h3, flagged)
    const shortText = 'Short heading';
    const longText = 'This heading has eleven words so it should be flagged and fixed here';
    const doc = makeDoc(
      `<h1>Title</h1><h2>Step 1</h2><h3>${shortText}</h3><h3>${longText}</h3>`
    );
    const issue = HEAD_004.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.targetField).toBe(`heading.text.H3.3::${longText}`);
  });

  it('uses the heading text exactly as the prefill (no truncation)', () => {
    const text = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_004.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.prefill).toBe(text);
  });
});

// ─── Multiple issues ──────────────────────────────────────────────────────────

describe('HEAD-004: one issue per long heading', () => {
  it('returns two issues for two long H3 headings', () => {
    const long = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h3>${long}</h3><h3>${long} and more</h3>`);
    expect(HEAD_004.check(doc, OPTIONS)).toHaveLength(2);
  });

  it('each issue has a unique id', () => {
    const long = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h3>${long}</h3><h3>${long} extra</h3>`);
    const results = HEAD_004.check(doc, OPTIONS) as Issue[];
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nearestHeading is set to the flagged heading text', () => {
    const text = 'This heading has eleven words so it should be flagged here';
    const doc = makeDoc(`<h3>${text}</h3>`);
    const issue = HEAD_004.check(doc, OPTIONS)[0] as Issue;
    expect(issue.nearestHeading).toBe(text);
  });
});
