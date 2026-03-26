import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_006 from '../universal/LINK-006';
import type { ParsedDocument, Issue } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDoc(html: string, documentXml = ''): ParsedDocument {
  return {
    html,
    sections: [
      {
        id: 'section-preamble',
        heading: 'Document start',
        headingLevel: 0,
        html,
        rawText: html.replace(/<[^>]+>/g, ''),
        startPage: 1,
      },
    ],
    rawText: html.replace(/<[^>]+>/g, ''),
    zipArchive: new JSZip(),
    documentXml,
    activeContentGuide: null,
  };
}

/** Build a minimal OOXML snippet containing the given bookmark names. */
function xmlWithBookmarks(...names: string[]): string {
  const bms = names
    .map((n, i) => `<w:bookmarkStart w:id="${i}" w:name="${n}"/><w:bookmarkEnd w:id="${i}"/>`)
    .join('');
  return (
    `<?xml version="1.0"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body><w:p>${bms}</w:p></w:body></w:document>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Tier 1: Exact match ──────────────────────────────────────────────────────

describe('LINK-006 exact match', () => {
  it('produces no issue when the anchor ID exists in the HTML', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#Eligibility">See Eligibility</a></p>'
    );
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no issue when the anchor exists as an OOXML bookmark (no HTML id)', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#Eligibility">See Eligibility</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no results when there are no bookmark links', () => {
    const doc = makeDoc('<p><a href="https://example.com">external</a></p>');
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Tier 2a: Fuzzy match via OOXML bookmarks (primary source) ───────────────

describe('LINK-006 fuzzy match — OOXML bookmarks', () => {
  it('matches _Eligibility → Eligibility via OOXML bookmark', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.instructionOnly).toBeFalsy();
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Eligibility');
  });

  it('matches _Maintenance_of_effort → Maintenance_of_effort via OOXML bookmark', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>',
      xmlWithBookmarks('Maintenance_of_effort')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Maintenance_of_effort');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Maintenance_of_effort');
  });

  it('description contains both the old anchor and the suggestion', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('#_Eligibility');
    expect(issue.description).toContain('#Eligibility');
  });

  it('ignores the _GoBack internal Word bookmark', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('_GoBack') // only internal bookmark — no real match
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true); // falls to tier 3
  });

  it('surfaces an ambiguous-anchor card when two OOXML bookmarks normalize identically', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility', 'eligibility') // both → 'eligibility'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor is ambiguous');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Tier 2b: Fuzzy match via HTML element IDs (secondary source) ─────────────

describe('LINK-006 fuzzy match — HTML element IDs', () => {
  it('matches _Eligibility → Eligibility via HTML id when no OOXML given', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Eligibility');
  });

  it('matches case-variant anchor to existing id', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#eligibility">See Eligibility</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
  });
});

// ─── Tier 2c: Fuzzy match via heading text (tertiary source) ─────────────────

describe('LINK-006 fuzzy match — heading text', () => {
  it('matches _Eligibility → Eligibility via heading text when heading has no id', () => {
    // No OOXML, heading has no id — heading text "Eligibility" matches normalized "_Eligibility"
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    // No id on heading → suggestion is anchor with leading _ stripped
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Eligibility');
  });

  it('matches _Maintenance_of_effort via heading text "Maintenance of Effort"', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    // Suggestion: leading _ stripped from original anchor
    expect(issue.inputRequired?.prefill).toBe('Maintenance_of_effort');
  });

  it('uses heading id as suggestion when heading has an id attribute', () => {
    const doc = makeDoc(
      '<h2 id="award-info">Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('award-info'); // heading's own id
  });

  it('encodes the old anchor verbatim in targetField', () => {
    const doc = makeDoc(
      '<h2>Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Award-Info');
  });
});

  it('matches via containment when anchor is a subset of heading text', () => {
    // "Attachment_1" normalizes to "attachment 1", which is contained in
    // "attachment 1 instructions for applicants"
    const doc = makeDoc(
      '<h2 id="attachment-1-instructions-for-applicants">Attachment 1: Instructions for Applicants</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('attachment-1-instructions-for-applicants');
  });

  it('surfaces an ambiguous-anchor card when multiple headings contain the anchor text', () => {
    // Both headings contain "attachment 1" and have distinct ids, so two different
    // suggestions are produced — the result is ambiguous, no fix is applied.
    const doc = makeDoc(
      '<h2 id="attachment-1-overview">Attachment 1: Overview</h2>' +
      '<h2 id="attachment-1-instructions">Attachment 1: Instructions</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor is ambiguous');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

// ─── Tier 3: No match (broken link) ──────────────────────────────────────────

describe('LINK-006 no match (broken link)', () => {
  it('surfaces an instructionOnly issue when anchor is completely unresolvable', () => {
    const doc = makeDoc('<p><a href="#ghost-section">broken link</a></p>');
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('sets severity to warning', () => {
    const doc = makeDoc('<p><a href="#missing">link</a></p>');
    expect((LINK_006.check(doc, OPTIONS)[0] as Issue).severity).toBe('warning');
  });

  it('falls to broken-link when no heading or bookmark matches the anchor', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_CompletelyUnrelated">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});
