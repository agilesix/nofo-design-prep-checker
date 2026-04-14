import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_006 from '../universal/LINK-006';
import type { ParsedDocument, Issue, AutoAppliedChange } from '../../types';

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
  it('auto-fixes _Eligibility → Eligibility via OOXML bookmark (leading underscore only)', () => {
    // Underscore-only difference → high-confidence auto-fix, no Issue surfaced
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('title' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Eligibility', new: 'Eligibility' }]);
  });

  it('auto-fixes _Maintenance_of_effort → Maintenance_of_effort via OOXML bookmark', () => {
    // Leading underscore + capitalization → high-confidence auto-fix
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>',
      xmlWithBookmarks('Maintenance_of_effort')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt') as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    const pairs = JSON.parse(change!.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Maintenance_of_effort', new: 'Maintenance_of_effort' }]);
  });

  it('value contains both the old and new anchor for an underscore-prefix anchor', () => {
    // Previously tested that an Issue's description contained both anchors.
    // Now auto-fixed — the value JSON encodes both the broken and corrected anchor.
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs[0]).toEqual({ old: '_Eligibility', new: 'Eligibility' });
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
  it('auto-fixes _Eligibility → Eligibility via HTML id (leading underscore removed)', () => {
    // Leading underscore only → high-confidence auto-fix via Source 2 (HTML id)
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Eligibility', new: 'Eligibility' }]);
  });

  it('auto-fixes case-variant anchor matching an existing id (capitalization-only mismatch)', () => {
    // #eligibility → #Eligibility: identical when lowercased → auto-fix, no Issue surfaced
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.description).toContain('capitalization');
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: 'eligibility', new: 'Eligibility' }]);
  });
});

// ─── Tier 2c: Fuzzy match via heading text (tertiary source) ─────────────────

describe('LINK-006 fuzzy match — heading text', () => {
  it('auto-fixes _Eligibility → Eligibility via heading text when heading has no id', () => {
    // No OOXML, heading has no id — heading text "Eligibility" matched via Source 3.
    // Leading underscore only → high-confidence auto-fix, suggestion = slugifyHeading("Eligibility")
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Eligibility', new: 'Eligibility' }]);
  });

  it('auto-fixes _Maintenance_of_effort → Maintenance_of_Effort via heading text', () => {
    // Leading underscore + capitalization difference → high-confidence auto-fix.
    // headingText is set (Source 3 match), and "See MOE" doesn't reference the heading
    // name, so a link-text suggestion is also emitted alongside the AutoAppliedChange.
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt') as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    const pairs = JSON.parse(change!.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Maintenance_of_effort', new: 'Maintenance_of_Effort' }]);
    // Link-text suggestion is still emitted for unrelated link text
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.title).toBe('Consider adding destination heading name to link text');
  });

  it('auto-fixes _Award-Info → award-info via heading id (leading underscore + capitalization)', () => {
    // Source 2 matches heading id "award-info"; isHighConfidenceAutoFix fires since
    // "Award-Info".toLowerCase() === "award-info" after stripping the leading underscore.
    const doc = makeDoc(
      '<h2 id="award-info">Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Award-Info', new: 'award-info' }]);
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
  it('auto-fixes heading-derived underscore anchors (no Issue with hint produced)', () => {
    // _Maintenance_of_effort → Maintenance_of_Effort: high-confidence auto-fix.
    // No Issue with inputRequired/hint — only AutoAppliedChange + optional link-text suggestion.
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(r => 'inputRequired' in r && (r as Issue).inputRequired?.targetField?.startsWith('link.bookmark.'));
    expect(issue).toBeUndefined(); // no bookmark-fix Issue — it was auto-fixed
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt');
    expect(change).toBeDefined();
  });

  it('auto-fixes OOXML bookmark underscore anchors (no Issue produced)', () => {
    // _Eligibility → Eligibility via OOXML: high-confidence auto-fix. No Issue at all.
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(r => 'title' in r);
    expect(issue).toBeUndefined(); // no Issue surfaced
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt');
    expect(change).toBeDefined();
  });

  it('matches CamelCase anchor #AppendixA to heading "Appendix A" via CamelCase splitting', () => {
    // Without CamelCase splitting: normalizeAnchor("AppendixA") → "appendixa"
    // normalizeAnchor("Appendix A") → "appendix a" — no containment match.
    // With CamelCase splitting: "AppendixA" → "Appendix A" → "appendix a" — exact match.
    const doc = makeDoc(
      '<h2>Appendix A</h2>' +
      '<p><a href="#AppendixA">See Appendix A</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    // Link text "See Appendix A" contains heading name → no link-text suggestion, just the bookmark fix
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Appendix_A');
    expect(issue.description).toContain('Appendix A');
  });

  it('matches CamelCase anchor #AppendixB to heading "Appendix B"', () => {
    const doc = makeDoc(
      '<h2>Appendix B</h2>' +
      '<p><a href="#AppendixB">See Appendix B</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Appendix_B');
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
    // _ContactsAndSupport → Contacts_and_Support: CamelCase expansion produces
    // a more-than-cap-only difference → fuzzy match Issue, NOT auto-fixed.
    // No numeric suffix was stripped, so the prefillNote should not mention it.
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
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

// ─── Link text suggestion: "see" suppression ─────────────────────────────────

describe('LINK-006 link text suggestion — "see" suppression', () => {
  it('includes "see" in the suggestion when the preceding text does not contain "see"', () => {
    const doc = makeDoc(
      '<h2 id="AppendixA">Appendix A</h2>' +
      '<p>For more information, refer to <a href="#AppendixA">the appendix</a>.</p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.inputRequired?.prefill).toContain('(see Appendix A)');
  });

  it('omits "see" from the suggestion when the preceding text already contains "see"', () => {
    const doc = makeDoc(
      '<h2 id="AppendixA">Appendix A</h2>' +
      '<p>Please see <a href="#AppendixA">the appendix</a>.</p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.inputRequired?.prefill).toBe('the appendix (Appendix A)');
    expect(suggestion!.inputRequired?.prefill).not.toContain('(see ');
  });

  it('omits "see" when it appears within 10 words before the link (fuzzy match path)', () => {
    // Uses the fuzzy-match (Tier 2) path — anchor "AppendixA" doesn't match any
    // HTML element id but fuzzy-matches heading "Appendix A: Overview".
    // Link text "references" does not mention the heading, so a suggestion is
    // produced. "see" in the preceding text should suppress "(see ...)" in the
    // suggestion prefill.
    const doc = makeDoc(
      '<h2>Appendix A: Overview</h2>' +
      '<p>As described, see <a href="#AppendixA">references</a>.</p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.inputRequired?.prefill).not.toContain('(see ');
  });

  it('includes "see" when "see" appears more than 10 words before the link', () => {
    // "see" is more than 10 words before the link — should not be suppressed
    const doc = makeDoc(
      '<h2 id="AppendixA">Appendix A</h2>' +
      '<p>See the overview. Here is a very long sentence with many words before <a href="#AppendixA">the appendix</a>.</p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.inputRequired?.prefill).toContain('(see Appendix A)');
  });
});

// ─── Tier 1c: clean heading slug match (leading-space heading fix) ────────────

describe('LINK-006 Tier 1c — leading-space heading normalisation', () => {
  it('does not flag a link whose anchor matches the trimmed-text slug of a heading with a leading space', () => {
    // Heading has a leading space → mammoth assigns id "_Contacts_and_Support".
    // The link points to "#Contacts_and_Support" (the clean slug without underscore
    // prefix).  Tier 1c recognises it as a valid link and raises no anchor issue.
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#Contacts_and_Support">See Contacts and Support</a></p>'
    );
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('Source 2 auto-fixes the anchor when the heading id (with leading underscore stripped) differs only in capitalization', () => {
    // Heading id "_Contacts_and_Support" → stripped to "Contacts_and_Support" (Source 2).
    // Anchor "contacts_and_support" lowercases to the same string as "Contacts_and_Support" →
    // capitalization-only mismatch → auto-fixed silently, no Issue surfaced.
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#contacts_and_support">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.description).toContain('capitalization');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: 'contacts_and_support', new: 'Contacts_and_Support' }]);
  });
});

// ─── Source 3 / Pass 3 underscore-stripping and blank-id regression ───────────

describe('LINK-006 Source 3 and Pass 3 — heading id underscore stripping and blank id fallback', () => {
  it('Source 3: strips leading underscore from heading id when resolving via heading-text match', () => {
    // Heading id "_Contacts_and_Support" (leading underscore from a leading space in
    // the heading text). The broken anchor "_ContactsAndSupport" doesn't match any
    // OOXML bookmark or HTML id exactly, so the rule falls through to Source 3 (heading
    // text match). The suggestion should be "Contacts_and_Support" — not
    // "_Contacts_and_Support".
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Contacts_and_Support');
  });

  it('Source 3: strips trailing underscore from heading id when resolving via heading-text match', () => {
    // Same scenario but the heading id has a trailing underscore as well.
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support_"> Contacts and Support </h2>' +
      '<p><a href="#_ContactsAndSupport_">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Contacts_and_Support');
  });

  it('Source 3: falls back to slugifyHeading when heading id attribute is blank', () => {
    // A heading with id="" (empty attribute) — getAttribute returns '' not null.
    // The rule should treat the blank id as absent and derive the suggestion from
    // the heading text instead of returning an empty prefill.
    const doc = makeDoc(
      '<h2 id="">Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Contacts_and_Support');
  });

  it('Pass 3 (numeric extraction): strips leading underscore from heading id', () => {
    // The broken anchor "_Attachment8" doesn't normalize-match any heading, so
    // numeric extraction (Pass 3) fires. The matched heading has id "_Attachment_8"
    // (leading underscore from a leading space). The suggestion should be
    // "Attachment_8" — not "_Attachment_8".
    const doc = makeDoc(
      '<h2 id="_Attachment_8"> Attachment 8: Budget Narrative</h2>' +
      '<p><a href="#_Attachment8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Attachment_8');
  });

  it('Pass 3 (numeric extraction): falls back to slugifyHeading when heading id attribute is blank', () => {
    // A heading matched by numeric extraction with id="" — should derive
    // the suggestion from the heading text rather than returning an empty prefill.
    const doc = makeDoc(
      '<h2 id="">Attachment 8: Budget Narrative</h2>' +
      '<p><a href="#_Attachment8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe('Internal link anchor may need updating');
    expect(issue.inputRequired?.prefill).toBe('Attachment_8_Budget_Narrative');
  });
});

// ─── Capitalization-only auto-fix ─────────────────────────────────────────────

describe('LINK-006 capitalization-only auto-fix', () => {
  it('emits an AutoAppliedChange (not an Issue) when the mismatch is capitalization-only', () => {
    // #eligibility → #Eligibility: identical when lowercased → auto-fixed
    const doc = makeDoc(
      '<p><a href="#eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('title' in change).toBe(false);   // not an Issue
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.anchor.fmt');
  });

  it('description counts the number of links corrected', () => {
    const doc = makeDoc(
      '<p><a href="#eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toBe('1 internal link anchor corrected for capitalization or leading/trailing underscores');
  });

  it('description uses plural form and counts each link occurrence, not unique anchors', () => {
    // Same broken anchor in two separate links — occurrences = 2, unique pairs = 1
    const doc = makeDoc(
      '<p><a href="#eligibility">first</a></p>' +
      '<p><a href="#eligibility">second</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.description).toBe('2 internal link anchors corrected for capitalization or leading/trailing underscores');
    // value is de-duplicated: only one pair even though two links share the anchor
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ old: 'eligibility', new: 'Eligibility' });
  });

  it('value contains de-duplicated {old,new} pairs for each distinct broken anchor', () => {
    // Two distinct anchors each differing only in capitalization
    const doc = makeDoc(
      '<p><a href="#eligibility">link 1</a></p>' +
      '<p><a href="#overview">link 2</a></p>',
      xmlWithBookmarks('Eligibility', 'Overview')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.description).toBe('2 internal link anchors corrected for capitalization or leading/trailing underscores');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual({ old: 'eligibility', new: 'Eligibility' });
    expect(pairs).toContainEqual({ old: 'overview', new: 'Overview' });
  });

  it('leading-underscore anchor is auto-fixed silently (no warning Issue)', () => {
    // #_Eligibility → #Eligibility: strip leading underscore → "Eligibility".toLowerCase()
    // === "Eligibility".toLowerCase() → high-confidence auto-fix, no Issue surfaced
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('title' in change).toBe(false);
    expect(change.targetField).toBe('link.anchor.fmt');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Eligibility', new: 'Eligibility' }]);
  });

  it('no AutoAppliedChange when fuzzy match differs by more than underscore/capitalization', () => {
    // #_Step_3 → #Step_3_Build_Your_Application: "step_3" ≠ "step_3_build_your_application"
    // after stripping leading underscore → not high-confidence → surfaces as warning Issue
    const doc = makeDoc(
      '<h2>Step 3: Build Your Application</h2>' +
      '<p><a href="#_Step_3">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const fmtChange = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt');
    expect(fmtChange).toBeUndefined();
    const issue = results.find(r => 'title' in r) as Issue | undefined;
    expect(issue?.title).toBe('Internal link anchor may need updating');
  });

  // ── New cases: leading/trailing underscore auto-fix ──────────────────────────

  it('auto-fixes #_Key_facts → #Key_facts (leading underscore only, no Issue surfaced)', () => {
    // The heading has id "Key_facts"; the link uses "#_Key_facts" (leading underscore
    // from a heading that once had a leading space).  Strip underscore → "Key_facts"
    // lowercases to match → high-confidence auto-fix.
    const doc = makeDoc(
      '<h2 id="Key_facts">Key facts</h2>' +
      '<p><a href="#_Key_facts">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt') as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect('title' in change!).toBe(false);
    const pairs = JSON.parse(change!.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_Key_facts', new: 'Key_facts' }]);
    // No warning Issue surfaced
    expect(results.find(r => (r as Issue).severity === 'warning')).toBeUndefined();
  });

  it('auto-fixes #_key_facts → #Key_facts (leading underscore + capitalization)', () => {
    const doc = makeDoc(
      '<h2 id="Key_facts">Key facts</h2>' +
      '<p><a href="#_key_facts">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt') as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    const pairs = JSON.parse(change!.value!) as { old: string; new: string }[];
    expect(pairs).toEqual([{ old: '_key_facts', new: 'Key_facts' }]);
    expect(results.find(r => (r as Issue).severity === 'warning')).toBeUndefined();
  });

  it('still emits a link-text suggestion when a cap-only fix targets a heading with unrelated link text', () => {
    // Heading matched via Source 3 (heading text containment); the anchor lowercases
    // to match the slug → auto-fix. Link text "click here" doesn't reference the
    // heading → link-text suggestion still emitted alongside the AutoAppliedChange.
    const doc = makeDoc(
      '<h2>Eligibility Criteria</h2>' +
      '<p><a href="#eligibility_criteria">click here</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.title).toBe('Consider adding destination heading name to link text');
    const capChange = results.find(r => (r as AutoAppliedChange).targetField === 'link.anchor.fmt') as AutoAppliedChange | undefined;
    expect(capChange).toBeDefined();
  });
});
