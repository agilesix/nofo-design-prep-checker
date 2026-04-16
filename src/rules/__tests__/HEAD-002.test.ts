import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_002 from '../universal/HEAD-002';
import type { ParsedDocument, Issue, RuleRunnerOptions } from '../../types';

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

const OPTIONS: RuleRunnerOptions = { contentGuideId: null };

// ─── Not flagged ──────────────────────────────────────────────────────────────

describe('HEAD-002: Multiple H1 headings — not flagged', () => {
  it('does not flag a document with a single H1', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h2>Basic Information</h2>');
    expect(HEAD_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a document with no H1 headings', () => {
    const doc = makeDoc('<h2>Basic Information</h2><h2>Eligibility</h2>');
    expect(HEAD_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a document with zero headings at all', () => {
    const doc = makeDoc('<p>Just body text</p>');
    expect(HEAD_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Flagged on non-HRSA guides ───────────────────────────────────────────────

describe('HEAD-002: Multiple H1 headings — flagged', () => {
  it('flags a document with two H1 headings when no content guide is selected', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1: Review the Opportunity</h1>');
    const results = HEAD_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-002');
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
  });

  it('flags a document with three H1 headings (non-HRSA guide)', () => {
    const doc = makeDoc(
      '<h1>NOFO Title</h1>' +
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>Step 2: Eligibility</h1>'
    );
    const results = HEAD_002.check(doc, { contentGuideId: 'acf' });
    expect(results).toHaveLength(1);
  });

  it('emits a single issue regardless of how many H1s are present', () => {
    const doc = makeDoc(
      '<h1>Title</h1><h1>Step 1</h1><h1>Step 2</h1><h1>Step 3</h1>'
    );
    expect(HEAD_002.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('issue title is "Document has more than one H1 heading"', () => {
    const doc = makeDoc('<h1>Title</h1><h1>Step 1</h1>');
    const issue = HEAD_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Document has more than one H1 heading');
  });

  it('issue description mentions NOFO Builder and H2', () => {
    const doc = makeDoc('<h1>Title</h1><h1>Step 1</h1>');
    const issue = HEAD_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('NOFO Builder');
    expect(issue.description).toContain('H2');
  });

  it('issue suggestedFix mentions Heading 1 and Heading 2', () => {
    const doc = makeDoc('<h1>Title</h1><h1>Step 1</h1>');
    const issue = HEAD_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.suggestedFix).toContain('Heading 1');
    expect(issue.suggestedFix).toContain('Heading 2');
  });

  it('flags when contentGuideId is a non-HRSA guide (acl)', () => {
    const doc = makeDoc('<h1>Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'acl' })).toHaveLength(1);
  });

  it('flags when contentGuideId is a non-HRSA guide (cdc)', () => {
    const doc = makeDoc('<h1>Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'cdc' })).toHaveLength(1);
  });
});

// ─── HRSA exception ───────────────────────────────────────────────────────────

describe('HEAD-002: Multiple H1 headings — HRSA exception', () => {
  it('does not flag two H1 headings on hrsa-rr', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1: Review the Opportunity</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-rr' })).toHaveLength(0);
  });

  it('does not flag two H1 headings on hrsa-bhw', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-bhw' })).toHaveLength(0);
  });

  it('does not flag two H1 headings on hrsa-bphc', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-bphc' })).toHaveLength(0);
  });

  it('does not flag two H1 headings on hrsa-construction', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-construction' })).toHaveLength(0);
  });

  it('does not flag two H1 headings on hrsa-mchb', () => {
    const doc = makeDoc('<h1>NOFO Title</h1><h1>Step 1</h1>');
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-mchb' })).toHaveLength(0);
  });

  it('does not flag four H1 headings on hrsa-rr (many step titles)', () => {
    const doc = makeDoc(
      '<h1>Title</h1><h1>Step 1</h1><h1>Step 2</h1><h1>Step 3</h1>'
    );
    expect(HEAD_002.check(doc, { contentGuideId: 'hrsa-rr' })).toHaveLength(0);
  });
});
