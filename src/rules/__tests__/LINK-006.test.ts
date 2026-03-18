import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_006 from '../universal/LINK-006';
import type { ParsedDocument, Issue } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDoc(html: string): ParsedDocument {
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
    documentXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Exact match ──────────────────────────────────────────────────────────────

describe('LINK-006 exact match', () => {
  it('produces no issue when the anchor ID exists in the document', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });

  it('produces no issue for every link whose target exists', () => {
    const doc = makeDoc(
      '<h2 id="Section1">Section 1</h2>' +
      '<h2 id="Section2">Section 2</h2>' +
      '<p><a href="#Section1">jump to 1</a> <a href="#Section2">jump to 2</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });
});

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

describe('LINK-006 fuzzy match', () => {
  it('surfaces a user-confirmed issue with prefilled anchor when anchor has a leading underscore', () => {
    // "_Eligibility" should fuzzy-match the ID "Eligibility"
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('LINK-006');
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.instructionOnly).toBeFalsy();
    expect(issue.inputRequired).toBeDefined();
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Eligibility');
  });

  it('surfaces a fuzzy issue when anchor differs only in case', () => {
    // "eligibility" should fuzzy-match ID "Eligibility"
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Eligibility');
  });

  it('encodes the old anchor verbatim in targetField', () => {
    const doc = makeDoc(
      '<h2 id="Award-Info">Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Award-Info');
  });
});

// ─── Ambiguous fuzzy match (multiple candidates) ──────────────────────────────

describe('LINK-006 ambiguous fuzzy match', () => {
  it('falls through to broken-link issue when normalized anchor matches more than one ID', () => {
    // Both "Eligibility-A" and "Eligibility-B" normalize to "eligibility a" / "eligibility b"
    // but "_Eligibility" normalizes to "eligibility" which matches neither verbatim.
    // Use two IDs that share the same normalization to force ambiguity:
    // "eligibility" (id) and "Eligibility" (id) both normalize to "eligibility"
    const doc = makeDoc(
      '<span id="eligibility">a</span>' +
      '<span id="Eligibility">b</span>' +
      '<p><a href="#_Eligibility">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    // Multiple matches → no suggestion → broken link tier
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('falls through to broken-link issue when no candidate matches at all', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#_CompletelyUnrelated">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── No match (broken link) ───────────────────────────────────────────────────

describe('LINK-006 no match (broken link)', () => {
  it('surfaces an instructionOnly issue when anchor is completely unresolvable', () => {
    const doc = makeDoc(
      '<p><a href="#ghost-section">broken link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('LINK-006');
    expect(issue.title).toBe('Internal bookmark link target not found');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('sets severity to warning for broken bookmark links', () => {
    const doc = makeDoc('<p><a href="#missing">link</a></p>');
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results[0] as Issue;
    expect(issue.severity).toBe('warning');
  });

  it('produces no results when there are no bookmark links', () => {
    const doc = makeDoc('<p><a href="https://example.com">external</a></p>');
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(0);
  });
});
