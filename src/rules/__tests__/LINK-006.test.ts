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
    footnotesXml: '',
    endnotesXml: '',
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
    // No id on heading → suggestion is slugified from heading text
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
    // Suggestion: slugified from matched heading text, not stripped from broken anchor
    expect(issue.inputRequired?.prefill).toBe('Maintenance_of_Effort');
    // Review card UX: heading text appears in description and prefillNote
    expect(issue.description).toContain('Maintenance of Effort');
    expect(issue.inputRequired?.prefillNote).toContain('Maintenance of Effort');
  });

  it('uses heading id as suggestion when heading has an id attribute', () => {
    const doc = makeDoc(
      '<h2 id="award-info">Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('award-info'); // heading's own id
    // For matches resolved via the heading's HTML id (tier 2b), headingText is not set — messaging uses the generic note
    expect(issue.description).not.toContain('via heading');
    expect(issue.inputRequired?.prefillNote).not.toContain('Award Info');
  });

  it('encodes the old anchor verbatim in targetField', () => {
    const doc = makeDoc(
      '<h2>Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Award-Info');
  });

  // Issue 1: containment match for short anchors (no OOXML, no heading id)
  it('matches Attachment_1 to heading "Attachment 1: Accreditation documentation" via containment', () => {
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    // Slug derived from full heading text; colon+space collapsed to single underscore
    expect(issue.inputRequired?.prefill).toBe('Attachment_1_Accreditation_documentation');
    expect(issue.description).toContain('Attachment 1: Accreditation documentation');
  });

  // Issue 2: slugify preserves structure — colon/slash produce underscores, no chars dropped
  it('slugifies heading with colon: "Step 3: Build Your Application" → Step_3_Build_Your_Application', () => {
    const doc = makeDoc(
      '<h2>Step 3: Build Your Application</h2>' +
      '<p><a href="#_Step_3">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Step_3_Build_Your_Application');
  });

  it('slugifies heading with slash: "Step 3/4: Overview" → Step_3_4_Overview', () => {
    const doc = makeDoc(
      '<h2>Step 3/4: Overview</h2>' +
      '<p><a href="#_Step_3">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Step_3_4_Overview');
  });

  // Issue 3: hint is set for heading-derived matches, absent for non-heading matches
  it('includes a hint about underscores for heading-derived matches (no id)', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.hint).toContain('underscores');
  });

  it('does not include the underscore hint for OOXML bookmark matches', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.hint).toBeUndefined();
  });
});

// ─── Numeric suffix stripping (Word duplicate-heading anchors) ────────────────

describe('LINK-006 numeric suffix stripping', () => {
  it('matches _Project_narrative_1 → Project_narrative via OOXML bookmark after stripping _1', () => {
    // First pass: "project narrative 1" ≠ "project narrative" → no match
    // Second pass (strip _1): "project narrative" === "project narrative" → match
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Project_narrative');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Project_narrative_1');
  });

  it('includes a numeric suffix warning in prefillNote when suffix was stripped', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefillNote).toContain('trailing numeric suffix');
    expect(issue.inputRequired?.prefillNote).toContain('multiple headings');
  });

  it('matches _Project_narrative_2 → Project_narrative (higher suffix value)', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_2">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Project_narrative');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark._Project_narrative_2');
  });

  it('matches _Step_3_1 → Step_3 via OOXML bookmark after stripping _1', () => {
    const doc = makeDoc(
      '<p><a href="#_Step_3_1">link</a></p>',
      xmlWithBookmarks('Step_3')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('Step_3');
  });

  it('returns ambiguous when stripped anchor matches multiple OOXML bookmarks', () => {
    // After stripping _1, "project narrative" matches both bookmarks
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative', 'project_narrative')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor is ambiguous');
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT strip suffix when first-pass already matches (Attachment_1 existing behaviour)', () => {
    // Attachment_1 → "attachment 1" is contained in "attachment 1 accreditation documentation"
    // so the first pass matches — no stripping needed, no numeric suffix warning
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefillNote).not.toContain('trailing numeric suffix');
  });

  it('does NOT include numeric suffix warning when no suffix was stripped', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefillNote).not.toContain('trailing numeric suffix');
  });

  it('falls through to broken-link when stripped anchor still has no match', () => {
    const doc = makeDoc(
      '<p><a href="#_Ghost_section_1">link</a></p>',
      xmlWithBookmarks('Unrelated_bookmark')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
    expect(issue.instructionOnly).toBe(true);
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

// ─── Stop-word bidirectional containment ─────────────────────────────────────

describe('LINK-006 stop-word bidirectional match', () => {
  it('matches #Program_requirements_expectations to "Program requirements and expectations"', () => {
    // Direct containment fails: "program requirements expectations" ⊄ "program requirements and expectations"
    // Stop-word match: both de-stopped → "program requirements expectations" ⊆ "program requirements expectations"
    // A link-text suggestion is also emitted because link text "link" doesn't reference the heading.
    const doc = makeDoc(
      '<h2>Program requirements and expectations</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Program_requirements_and_expectations');
    expect(issue.description).toContain('Program requirements and expectations');

    // Second result: link-text improvement suggestion
    const suggestion = results[1] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Consider adding destination heading name to link text');
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Program_requirements_expectations');
    expect(suggestion.inputRequired?.prefill).toBe('link (see Program requirements and expectations)');
  });

  it('stop-word match uses heading id when present', () => {
    const doc = makeDoc(
      '<h2 id="prog-req-and-exp">Program requirements and expectations</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('prog-req-and-exp');
  });

  it('matches anchor missing "or" against heading "Steps or requirements"', () => {
    const doc = makeDoc(
      '<h2>Steps or requirements</h2>' +
      '<p><a href="#Steps_requirements">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.description).toContain('Steps or requirements');
  });

  it('matches anchor missing "of" against heading "Overview of the program"', () => {
    const doc = makeDoc(
      '<h2>Overview of the program</h2>' +
      '<p><a href="#Overview_program">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
  });

  it('returns ambiguous when multiple headings match after stop-word removal', () => {
    // Anchor "requirements expectations" de-stops to "requirements expectations".
    // Both headings de-stop to something that contains "requirements expectations",
    // so two distinct heading suggestions are produced → ambiguous.
    const doc = makeDoc(
      '<h2 id="req-and-exp-overview">Requirements and expectations overview</h2>' +
      '<h2 id="req-or-exp-summary">Requirements or expectations summary</h2>' +
      '<p><a href="#Requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor is ambiguous');
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT use stop-word match when direct containment already succeeds', () => {
    // "attachment 1" IS directly contained in "attachment 1 accreditation documentation"
    // so the stop-word path should never be reached
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    // Standard heading-text note — not a stop-word note
    expect(issue.inputRequired?.prefillNote).toContain('Matched via heading text');
  });

  it('falls through to broken-link when stop-word removal leaves no match', () => {
    const doc = makeDoc(
      '<h2>Completely unrelated heading</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
    expect(issue.instructionOnly).toBe(true);
  });
});

// ─── Numeric extraction fallback (pass 3) ────────────────────────────────────

describe('LINK-006 numeric extraction fallback', () => {
  it('matches Attach8OrgChart to "Attachment 8: Non-duplication of federal funding"', () => {
    // A link-text suggestion is also emitted because link text "link" doesn't reference the heading.
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication of federal funding</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Attachment_8_Non_duplication_of_federal_funding');
    expect(issue.inputRequired?.targetField).toBe('link.bookmark.Attach8OrgChart');

    // Second result: link-text improvement suggestion
    const suggestion = results[1] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Consider adding destination heading name to link text');
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Attach8OrgChart');
    expect(suggestion.inputRequired?.prefill).toBe('link (see Attachment 8: Non-duplication of federal funding)');
  });

  it('description uses "possible match" for numeric extraction (lower confidence)', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Overview</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toContain('possible match');
    expect(issue.description).not.toContain('likely match');
  });

  it('prefillNote contains "number extraction" warning', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Overview</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefillNote).toContain('number extraction');
    expect(issue.inputRequired?.prefillNote).toContain('lower-confidence');
  });

  it('matches Sec3Overview to "Section 3: Background and Need"', () => {
    const doc = makeDoc(
      '<h2>Section 3: Background and Need</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.description).toContain('Section 3');
  });

  it('matches Step2Plan to "Step 2: Planning" (Step keyword)', () => {
    const doc = makeDoc(
      '<h2>Step 2: Planning</h2>' +
      '<p><a href="#Step2Plan">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.description).toContain('Step 2');
  });

  it('uses heading id as suggestion when heading has an id attribute', () => {
    const doc = makeDoc(
      '<h2 id="attachment-8-nondup">Attachment 8: Non-duplication</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired?.prefill).toBe('attachment-8-nondup');
  });

  it('returns ambiguous when two structural headings share the extracted number', () => {
    // Both headings contain a structural keyword + 8 → ambiguous
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication</h2>' +
      '<h2>Section 8: Something else</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor is ambiguous');
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT trigger for anchors with no numbers', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Something</h2>' +
      '<p><a href="#CompletelyTextual">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    // No numeric match possible — falls to broken-link
    expect(issue.title).toBe('Internal bookmark link target not found');
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT match when heading has the number but no structural keyword', () => {
    // "Overview 8: Something" has no structural keyword → no match
    const doc = makeDoc(
      '<h2>Overview 8: Something</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
  });

  it('number 8 does NOT match heading "Attachment 18: Something" (word boundary)', () => {
    const doc = makeDoc(
      '<h2>Attachment 18: Something</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
  });

  it('does NOT match "Section 3.1: Detail" for extracted number 3 (dotted hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3.1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
  });

  it('does NOT match "Section 3-1: Detail" for extracted number 3 (hyphen hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3-1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
  });

  it('does NOT match "Section 3/1: Detail" for extracted number 3 (slash hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3/1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal bookmark link target not found');
  });

  it('still matches "Section 3: Background" for extracted number 3 (standalone)', () => {
    const doc = makeDoc(
      '<h2>Section 3: Background</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.description).toContain('Section 3');
  });

  it('does NOT extract Word suffix digit when pass 2 stripped it (Attach8OrgChart_1)', () => {
    // Without the fix, pass 3 would receive "Attach8OrgChart_1" and extract
    // both 8 and 1, matching both headings and returning ambiguous.
    // With the fix, pass 3 receives "Attach8OrgChart" (suffix stripped) and
    // extracts only 8, returning a single match.
    const doc = makeDoc(
      '<h2>Attachment 1: Something</h2>' +
      '<h2>Attachment 8: Target</h2>' +
      '<p><a href="#Attach8OrgChart_1">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.description).toContain('Attachment 8');
  });

  it('does NOT use numeric extraction when pass 1 already resolved the anchor', () => {
    // Attachment_8 → "attachment 8" IS contained in "attachment 8 non duplication..."
    // so pass 1 should resolve it and pass 3 should never run
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication</h2>' +
      '<p><a href="#Attachment_8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    // Pass 1 (heading containment) — not numeric extraction
    expect(issue.inputRequired?.prefillNote).not.toContain('number extraction');
  });
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
