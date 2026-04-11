import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_001 from '../universal/HEAD-001';
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

// ─── H2: must use title case ─────────────────────────────────────────────────

describe('HEAD-001: H2 sentence case detection', () => {
  it('flags an H2 in sentence case', () => {
    const doc = makeDoc('<h2>Program description information</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-001');
    expect(issue.title).toBe('H2 heading may need title case');
    expect(issue.severity).toBe('suggestion');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.description).toContain('sentence case');
    expect(issue.description).toContain('title case');
  });

  it('flags an H2 where a major word is lowercase', () => {
    // "review" is a non-minor word starting lowercase → sentence case
    const doc = makeDoc('<h2>Types of awards and review criteria</h2>');
    const issue = (HEAD_001.check(doc, OPTIONS)[0] as Issue);
    expect(issue.title).toBe('H2 heading may need title case');
  });

  it('does not flag a correctly cased H2 in title case', () => {
    const doc = makeDoc('<h2>Program Description Information</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 where all non-minor words are capitalised', () => {
    const doc = makeDoc('<h2>Award and Submission Requirements</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 with a single word', () => {
    // Single-word headings have no second word to detect case from
    const doc = makeDoc('<h2>Eligibility</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 where all non-first words are minor words', () => {
    // Only minor words follow the first — no evidence of sentence case
    const doc = makeDoc('<h2>Award in the</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── H3–H6: must use sentence case ───────────────────────────────────────────

describe('HEAD-001: H3–H6 title case detection', () => {
  it('flags an H3 in title case', () => {
    const doc = makeDoc('<h3>Contact and Support Information</h3>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-001');
    expect(issue.title).toBe('H3 heading may need sentence case');
    expect(issue.severity).toBe('suggestion');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.description).toContain('title case');
    expect(issue.description).toContain('sentence case');
  });

  it('flags an H4 in title case', () => {
    const doc = makeDoc('<h4>Award Review Criteria</h4>');
    const issue = HEAD_001.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('H4 heading may need sentence case');
  });

  it('does not flag a correctly cased H3 in sentence case', () => {
    const doc = makeDoc('<h3>Contact and support information</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 with only one word', () => {
    const doc = makeDoc('<h3>Overview</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 where only the first word is capitalised', () => {
    const doc = makeDoc('<h3>Award and outreach requirements</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── H1: not checked ─────────────────────────────────────────────────────────

describe('HEAD-001: H1 is not checked', () => {
  it('does not flag an H1 in sentence case', () => {
    const doc = makeDoc('<h1>Program description for the nofo</h1>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H1 in title case', () => {
    const doc = makeDoc('<h1>Program Description For The NOFO</h1>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Acronym / ALL-CAPS exceptions ───────────────────────────────────────────

describe('HEAD-001: ALL-CAPS words are skipped', () => {
  it('does not flag an H3 whose only non-first capitalised word is an acronym', () => {
    // "CDC" is ALL CAPS → skipped; "contact" is lowercase → not a title-case indicator
    const doc = makeDoc('<h3>Contact CDC for more information</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still flags an H2 when an ALL-CAPS acronym is mixed with lowercase major words', () => {
    // "HRSA" is ALL CAPS → skipped; "funding" and "overview" are lowercase
    // non-minor words → sentence case is still detected and the heading is flagged
    const doc = makeDoc('<h2>HRSA funding overview</h2>');
    const issue = HEAD_001.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('H2 heading may need title case');
  });
});

// ─── Colon restart ───────────────────────────────────────────────────────────

describe('HEAD-001: word after colon treated as sentence start', () => {
  it('does not flag an H3 where the only capitalised word follows a colon', () => {
    // "Background:" ends with colon → "Why" is a sentence restart → skipped
    const doc = makeDoc('<h3>Background: Why this matters</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags an H3 with a capitalised word that does NOT follow a colon', () => {
    const doc = makeDoc('<h3>Contact and Support: details and background</h3>');
    // "Support" is capitalised and is not a sentence start → title case detected
    const issue = HEAD_001.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('H3 heading may need sentence case');
  });
});
