import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_003 from '../universal/HEAD-003';
import type { ParsedDocument, Issue } from '../../types';

function makeDoc(html: string, documentXml = ''): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Sequential headings — not flagged ───────────────────────────────────────

describe('HEAD-003: Sequential headings — not flagged', () => {
  it('does not flag H1 → H2 → H3 (sequential descent)', () => {
    const doc = makeDoc('<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag H1 → H2 → H2 (same level)', () => {
    const doc = makeDoc('<h1>Title</h1><h2>Section A</h2><h2>Section B</h2>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag H3 → H2 (going up is not a violation)', () => {
    const doc = makeDoc('<h2>A</h2><h3>B</h3><h2>C</h2>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a single heading', () => {
    const doc = makeDoc('<h1>Title</h1>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag H1 → H2 (one level descent)', () => {
    const doc = makeDoc('<h1>Title</h1><h2>Section</h2>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag H2 → H3 → H3 (repeat at same level)', () => {
    const doc = makeDoc('<h2>A</h2><h3>B</h3><h3>C</h3>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an empty document', () => {
    const doc = makeDoc('<p>No headings here</p>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Skipped heading — determinable fix ──────────────────────────────────────

describe('HEAD-003: Skipped heading — determinable fix (accept-to-fix)', () => {
  it('flags H1 → H3 when followed by H3 (same depth) and suggests H2', () => {
    // H3 follows H3 → next.level >= curr.level → suggest preceding+1 = H2
    const doc = makeDoc(
      '<h1>NOFO Title</h1>' +
      '<h3>Skipped Heading</h3>' +
      '<h3>Another Heading</h3>'
    );
    const results = HEAD_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('HEAD-003');
    expect(issue.severity).toBe('warning');
    expect(issue.title).toBe('Heading levels skip a level');
    expect(issue.description).toContain('H3');
    expect(issue.description).toContain('H1');
    expect(issue.instructionOnly).toBeFalsy();
    expect(issue.inputRequired).toBeDefined();
    expect(issue.inputRequired!.prefill).toBe('2');
    expect(issue.suggestedFix).toContain('H2');
  });

  it('targetField encodes the from-level, ordinal index, and heading text', () => {
    // headingData[0]=H1, headingData[1]=H3 (flagged at i=1), headingData[2]=H3
    const doc = makeDoc(
      '<h1>Title</h1><h3>Skipped Heading</h3><h3>Next</h3>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.targetField).toBe('heading.level.H3.1::Skipped Heading');
  });

  it('two skipped headings get distinct targetFields using their ordinal positions', () => {
    // H1(0), H3(1, skipped), H5(2, skipped)
    const doc = makeDoc('<h1>Title</h1><h3>First Skip</h3><h5>Second Skip</h5>');
    const issues = HEAD_003.check(doc, OPTIONS) as Issue[];
    // Both are ambiguous (no following after last), but first skip has next=H5
    // H3 at index 1: next.level(5) >= curr.level(3) → determinable, suggest H2
    // H5 at index 2: no following → ambiguous (instruction-only)
    const fixableIssue = issues.find(r => !r.instructionOnly);
    expect(fixableIssue?.inputRequired?.targetField).toBe('heading.level.H3.1::First Skip');
  });

  it('flags H2 → H4 when followed by H2 (same as preceding) and suggests H2', () => {
    // next.level (2) <= precedingLevel (2) → suggest H2
    const doc = makeDoc(
      '<h2>Section</h2>' +
      '<h4>Deep Heading</h4>' +
      '<h2>Next Section</h2>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.prefill).toBe('2');
    expect(issue.suggestedFix).toContain('H2');
  });

  it('flags H2 → H4 when followed by H5 (deeper than current) and suggests H3', () => {
    // next.level (5) >= curr.level (4) → suggest preceding+1 = H3
    const doc = makeDoc(
      '<h2>Section</h2>' +
      '<h4>Deep Heading</h4>' +
      '<h5>Even Deeper</h5>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.prefill).toBe('3');
  });

  it('flags H1 → H3 when followed by H3 and suggests H2', () => {
    const doc = makeDoc(
      '<h1>NOFO Title</h1><h3>Step heading</h3><h3>Another step</h3>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.prefill).toBe('2');
    expect(issue.inputRequired!.validationPattern).toBe('^[1-6]$');
  });

  it('inputRequired has correct label and validation', () => {
    const doc = makeDoc('<h1>T</h1><h3>S</h3><h3>N</h3>');
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    const { label, validationPattern, validationMessage } = issue.inputRequired!;
    expect(label).toContain('1');
    expect(label).toContain('6');
    expect(validationPattern).toBe('^[1-6]$');
    expect(validationMessage).toBeTruthy();
  });

  it('following H1 (shallower than preceding H2) → suggests H2 as a peer', () => {
    // next.level (1) <= precedingLevel (2)? 1 <= 2 → yes → suggest H2
    const doc = makeDoc(
      '<h2>Section</h2>' +
      '<h4>Deep Heading</h4>' +
      '<h1>Next Chapter</h1>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired!.prefill).toBe('2');
  });
});

// ─── Skipped heading — ambiguous context ─────────────────────────────────────

describe('HEAD-003: Skipped heading — ambiguous context (instruction-only)', () => {
  it('falls back to instruction-only when there is no following heading', () => {
    const doc = makeDoc('<h1>Title</h1><h3>Skipped — no following heading</h3>');
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
    expect(issue.suggestedFix).toContain('Word');
  });

  it('falls back to instruction-only when following is between preceding and current', () => {
    // M=2, N=4, following=3 → 2 < 3 < 4 → ambiguous
    const doc = makeDoc(
      '<h2>Section</h2>' +
      '<h4>Deep Heading</h4>' +
      '<h3>Middle Heading</h3>'
    );
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('description includes the heading text and both levels', () => {
    const doc = makeDoc('<h1>Title</h1><h3>My Skipped Heading</h3>');
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('My Skipped Heading');
    expect(issue.description).toContain('H3');
    expect(issue.description).toContain('H1');
  });

  it('nearestHeading is set to the skipped heading text', () => {
    const doc = makeDoc('<h1>Title</h1><h3>My Skipped Heading</h3>');
    const issue = HEAD_003.check(doc, OPTIONS)[0] as Issue;
    expect(issue.nearestHeading).toBe('My Skipped Heading');
  });
});

// ─── One issue per skipped heading ───────────────────────────────────────────

describe('HEAD-003: One issue card per skipped heading', () => {
  it('surfaces two issues when two headings each skip a level', () => {
    // H1 → H3 (skip) → H5 (skip)
    const doc = makeDoc('<h1>Title</h1><h3>First Skip</h3><h5>Second Skip</h5>');
    const results = HEAD_003.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
  });

  it('surfaces one issue per skipped heading, not one per level skipped', () => {
    // H1 → H4 (skips 2 levels, but is still one heading) → no more
    const doc = makeDoc('<h1>Title</h1><h4>Big Skip</h4>');
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('each issue has a unique id', () => {
    const doc = makeDoc('<h1>T</h1><h3>A</h3><h5>B</h5>');
    const results = HEAD_003.check(doc, OPTIONS) as Issue[];
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Rule is content-guide-agnostic ──────────────────────────────────────────

describe('HEAD-003: Content guide agnostic', () => {
  it('flags skipped headings regardless of contentGuideId', () => {
    const doc = makeDoc('<h1>Title</h1><h3>Skipped</h3>');
    expect(HEAD_003.check(doc, { contentGuideId: 'hrsa-rr' })).toHaveLength(1);
    expect(HEAD_003.check(doc, { contentGuideId: 'acf' })).toHaveLength(1);
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── Headings inside w:sdt content controls ──────────────────────────────────

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function makeXmlDoc(bodyInnerXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document ${W_NS}><w:body>${bodyInnerXml}</w:body></w:document>`
  );
}

function xmlHeading(level: number, text: string): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r></w:p>`
  );
}

describe('HEAD-003: w:sdt content control traversal', () => {
  it('does not flag H3 → H4 (in sdt) → H5 (in sdt) → H5 as a skip', () => {
    // Mammoth would emit H3 → H5 from this doc (missing the sdt headings),
    // which looks like a skip. The rule must use the documentXml path to see
    // the intervening H4 and first H5 inside the content control.
    const documentXml = makeXmlDoc(
      xmlHeading(3, 'Level Three') +
      `<w:sdt><w:sdtContent>` +
        xmlHeading(4, 'Level Four in Control') +
        xmlHeading(5, 'Level Five in Control') +
      `</w:sdtContent></w:sdt>` +
      xmlHeading(5, 'Level Five')
    );
    // html represents what mammoth would have produced — sdt headings absent
    const doc = makeDoc('<h3>Level Three</h3><h5>Level Five</h5>', documentXml);
    expect(HEAD_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still flags a genuine skip that spans content controls', () => {
    // H3 → H6 (in sdt) is a real two-level skip regardless of the wrapper
    const documentXml = makeXmlDoc(
      xmlHeading(3, 'Level Three') +
      `<w:sdt><w:sdtContent>` +
        xmlHeading(6, 'Level Six in Control') +
      `</w:sdtContent></w:sdt>`
    );
    const doc = makeDoc('<h3>Level Three</h3>', documentXml);
    const results = HEAD_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('HEAD-003');
  });
});
