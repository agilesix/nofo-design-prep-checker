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

const INSTRUCTION_TITLE = 'Internal link may not work in NOFO Builder';
const INSTRUCTION_DESC =
  'This internal link may be broken. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading. Do not edit the link URL directly.';

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
  it('surfaces an instruction-only warning for _Eligibility when bookmark is Eligibility', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning for _Maintenance_of_effort anchor mismatch', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>',
      xmlWithBookmarks('Maintenance_of_effort')
    );
    const issue = LINK_006.check(doc, OPTIONS).find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.title).toBe(INSTRUCTION_TITLE);
    expect(issue!.instructionOnly).toBe(true);
  });

  it('surfaces an instruction-only warning for underscore-prefix anchor', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('ignores the _GoBack internal Word bookmark', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('_GoBack')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
  });

  it('surfaces an instruction-only warning when two OOXML bookmarks normalize identically', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility', 'eligibility')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Tier 2b: Fuzzy match via HTML element IDs (secondary source) ─────────────

describe('LINK-006 fuzzy match — HTML element IDs', () => {
  it('surfaces an instruction-only warning for _Eligibility when heading id is Eligibility', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning for capitalization-only anchor mismatch', () => {
    const doc = makeDoc(
      '<h2 id="Eligibility">Eligibility</h2>' +
      '<p><a href="#eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Tier 2c: Fuzzy match via heading text (tertiary source) ─────────────────

describe('LINK-006 fuzzy match — heading text', () => {
  it('surfaces an instruction-only warning for _Eligibility when heading has no id', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces warning + link-text suggestion for _Maintenance_of_effort with unrelated link text', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const warning = results.find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    expect(warning).toBeDefined();
    expect(warning!.title).toBe(INSTRUCTION_TITLE);
    expect(warning!.instructionOnly).toBe(true);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.title).toBe('Consider adding destination heading name to link text');
  });

  it('surfaces an instruction-only warning for _Award-Info when heading id is award-info', () => {
    const doc = makeDoc(
      '<h2 id="award-info">Award Info</h2>' +
      '<p><a href="#_Award-Info">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning for Attachment_1 matching heading by containment', () => {
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning for _Step_3 matching heading with colon', () => {
    const doc = makeDoc(
      '<h2>Step 3: Build Your Application</h2>' +
      '<p><a href="#_Step_3">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning for _Step_3 matching heading with slash', () => {
    const doc = makeDoc(
      '<h2>Step 3/4: Overview</h2>' +
      '<p><a href="#_Step_3">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for _Maintenance_of_effort (link text matches heading — no suggestion)', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const warning = results.find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    expect(warning).toBeDefined();
    expect(warning!.title).toBe(INSTRUCTION_TITLE);
    expect(warning!.instructionOnly).toBe(true);
  });

  it('surfaces instruction-only warning for _Eligibility via OOXML (no AutoAppliedChange)', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(r => 'title' in r) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.title).toBe(INSTRUCTION_TITLE);
    expect(issue!.instructionOnly).toBe(true);
  });

  it('surfaces instruction-only warning for CamelCase anchor #AppendixA', () => {
    const doc = makeDoc(
      '<h2>Appendix A</h2>' +
      '<p><a href="#AppendixA">See Appendix A</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for CamelCase anchor #AppendixB', () => {
    const doc = makeDoc(
      '<h2>Appendix B</h2>' +
      '<p><a href="#AppendixB">See Appendix B</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS).find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.title).toBe(INSTRUCTION_TITLE);
    expect(issue!.instructionOnly).toBe(true);
  });
});

// ─── Numeric suffix stripping (Word duplicate-heading anchors) ────────────────

describe('LINK-006 numeric suffix stripping', () => {
  it('surfaces instruction-only warning for _Project_narrative_1 (stripped suffix match)', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for _Project_narrative_2', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_2">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for _Step_3_1 (stripped suffix match)', () => {
    const doc = makeDoc(
      '<p><a href="#_Step_3_1">link</a></p>',
      xmlWithBookmarks('Step_3')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning when stripped anchor matches multiple OOXML bookmarks', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative', 'project_narrative')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('does NOT strip suffix when first-pass already matches (Attachment_1 existing behaviour)', () => {
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for anchor without numeric suffix', () => {
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('falls through to broken-link warning when stripped anchor still has no match', () => {
    const doc = makeDoc(
      '<p><a href="#_Ghost_section_1">link</a></p>',
      xmlWithBookmarks('Unrelated_bookmark')
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });
});

  it('matches via containment when anchor is a subset of heading text', () => {
    const doc = makeDoc(
      '<h2 id="attachment-1-instructions-for-applicants">Attachment 1: Instructions for Applicants</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces an instruction-only warning when multiple headings contain the anchor text', () => {
    const doc = makeDoc(
      '<h2 id="attachment-1-overview">Attachment 1: Overview</h2>' +
      '<h2 id="attachment-1-instructions">Attachment 1: Instructions</h2>' +
      '<p><a href="#Attachment_1">See Attachment 1</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

// ─── Stop-word bidirectional containment ─────────────────────────────────────

describe('LINK-006 stop-word bidirectional match', () => {
  it('surfaces warning + link-text suggestion for #Program_requirements_expectations', () => {
    const doc = makeDoc(
      '<h2>Program requirements and expectations</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const warning = results[0] as Issue;
    expect(warning.title).toBe(INSTRUCTION_TITLE);
    expect(warning.instructionOnly).toBe(true);
    expect(warning.inputRequired).toBeUndefined();

    const suggestion = results[1] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Consider adding destination heading name to link text');
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Program_requirements_expectations');
    expect(suggestion.inputRequired?.prefill).toBe('link (see Program requirements and expectations)');
  });

  it('surfaces instruction-only warning for stop-word match (heading id present)', () => {
    const doc = makeDoc(
      '<h2 id="prog-req-and-exp">Program requirements and expectations</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for anchor missing "or" against heading "Steps or requirements"', () => {
    const doc = makeDoc(
      '<h2>Steps or requirements</h2>' +
      '<p><a href="#Steps_requirements">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('surfaces instruction-only warning for anchor missing "of" against heading "Overview of the program"', () => {
    const doc = makeDoc(
      '<h2>Overview of the program</h2>' +
      '<p><a href="#Overview_program">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('surfaces instruction-only warning when multiple headings match after stop-word removal', () => {
    const doc = makeDoc(
      '<h2 id="req-and-exp-overview">Requirements and expectations overview</h2>' +
      '<h2 id="req-or-exp-summary">Requirements or expectations summary</h2>' +
      '<p><a href="#Requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning via direct containment (Attachment_1 in heading text)', () => {
    const doc = makeDoc(
      '<h2>Attachment 1: Accreditation documentation</h2>' +
      '<p><a href="#Attachment_1">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('falls through to broken-link warning when stop-word removal leaves no match', () => {
    const doc = makeDoc(
      '<h2>Completely unrelated heading</h2>' +
      '<p><a href="#Program_requirements_expectations">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });
});

// ─── Numeric extraction fallback (pass 3) ────────────────────────────────────

describe('LINK-006 numeric extraction fallback', () => {
  it('surfaces warning + link-text suggestion for Attach8OrgChart', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication of federal funding</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();

    const suggestion = results[1] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Consider adding destination heading name to link text');
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Attach8OrgChart');
    expect(suggestion.inputRequired?.prefill).toBe('link (see Attachment 8: Non-duplication of federal funding)');
  });

  it('surfaces instruction-only warning for Sec3Overview', () => {
    const doc = makeDoc(
      '<h2>Section 3: Background and Need</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning for Step2Plan', () => {
    const doc = makeDoc(
      '<h2>Step 2: Planning</h2>' +
      '<p><a href="#Step2Plan">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('uses heading id as suggestion anchor when heading has an id attribute', () => {
    const doc = makeDoc(
      '<h2 id="attachment-8-nondup">Attachment 8: Non-duplication</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    // No inputRequired in new behavior — just verify warning + link-text suggestion
    const results = LINK_006.check(doc, OPTIONS);
    const warning = results.find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    expect(warning).toBeDefined();
    expect(warning!.title).toBe(INSTRUCTION_TITLE);
    expect(warning!.instructionOnly).toBe(true);
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(suggestion).toBeDefined();
    expect(suggestion!.inputRequired?.prefill).toContain('Attachment 8: Non-duplication');
  });

  it('surfaces instruction-only warning when two structural headings share the extracted number', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication</h2>' +
      '<h2>Section 8: Something else</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('does NOT trigger for anchors with no numbers (falls to broken-link)', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Something</h2>' +
      '<p><a href="#CompletelyTextual">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT match when heading has the number but no structural keyword', () => {
    const doc = makeDoc(
      '<h2>Overview 8: Something</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('number 8 does NOT match heading "Attachment 18: Something" (word boundary)', () => {
    const doc = makeDoc(
      '<h2>Attachment 18: Something</h2>' +
      '<p><a href="#Attach8OrgChart">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT match "Section 3.1: Detail" for extracted number 3 (dotted hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3.1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT match "Section 3-1: Detail" for extracted number 3 (hyphen hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3-1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT match "Section 3/1: Detail" for extracted number 3 (slash hierarchical)', () => {
    const doc = makeDoc(
      '<h2>Section 3/1: Detail</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('still matches "Section 3: Background" for extracted number 3 (standalone)', () => {
    const doc = makeDoc(
      '<h2>Section 3: Background</h2>' +
      '<p><a href="#Sec3Overview">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
  });

  it('does NOT produce ambiguous result when pass 2 strips Word suffix (Attach8OrgChart_1)', () => {
    // Without the pass-2/pass-3 fix, pass 3 would extract both 8 and 1, returning ambiguous.
    // With the fix, pass 3 receives the stripped form "Attach8OrgChart" and extracts only 8.
    const doc = makeDoc(
      '<h2>Attachment 1: Something</h2>' +
      '<h2>Attachment 8: Target</h2>' +
      '<p><a href="#Attach8OrgChart_1">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('surfaces instruction-only warning when pass 1 already resolved Attachment_8', () => {
    const doc = makeDoc(
      '<h2>Attachment 8: Non-duplication</h2>' +
      '<p><a href="#Attachment_8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Tier 3: No match (broken link) ──────────────────────────────────────────

describe('LINK-006 no match (broken link)', () => {
  it('surfaces an instructionOnly issue when anchor is completely unresolvable', () => {
    const doc = makeDoc('<p><a href="#ghost-section">broken link</a></p>');
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
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

  it('uses the standard instruction description', () => {
    const doc = makeDoc('<p><a href="#ghost-section">broken link</a></p>');
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.description).toBe(INSTRUCTION_DESC);
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
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#Contacts_and_Support">See Contacts and Support</a></p>'
    );
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('surfaces instruction-only warning when anchor differs from heading slug only in capitalization', () => {
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#contacts_and_support">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Source 3 / Pass 3 underscore-stripping and blank-id regression ───────────

describe('LINK-006 Source 3 and Pass 3 — heading id underscore stripping and blank id fallback', () => {
  it('Source 3: surfaces instruction-only warning for _ContactsAndSupport matching leading-underscore heading', () => {
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support"> Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('Source 3: surfaces instruction-only warning when heading id has trailing underscore', () => {
    const doc = makeDoc(
      '<h2 id="_Contacts_and_Support_"> Contacts and Support </h2>' +
      '<p><a href="#_ContactsAndSupport_">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('Source 3: surfaces instruction-only warning when heading id attribute is blank', () => {
    const doc = makeDoc(
      '<h2 id="">Contacts and Support</h2>' +
      '<p><a href="#_ContactsAndSupport">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('Pass 3 (numeric extraction): surfaces instruction-only warning for leading-underscore heading id', () => {
    const doc = makeDoc(
      '<h2 id="_Attachment_8"> Attachment 8: Budget Narrative</h2>' +
      '<p><a href="#_Attachment8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('Pass 3 (numeric extraction): surfaces instruction-only warning when heading id is blank', () => {
    const doc = makeDoc(
      '<h2 id="">Attachment 8: Budget Narrative</h2>' +
      '<p><a href="#_Attachment8">link</a></p>'
    );
    const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── All non-Tier-1 cases: instruction-only, no AutoAppliedChange ─────────────

describe('LINK-006 instruction-only behavior', () => {
  it('emits instruction-only warning (not AutoAppliedChange) for capitalization-only mismatch', () => {
    const doc = makeDoc(
      '<p><a href="#eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('emits instruction-only warning for leading-underscore mismatch', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).instructionOnly).toBe(true);
    expect((results[0] as Issue).severity).toBe('warning');
  });

  it('emits instruction-only warning for CamelCase (missing word separator) mismatch', () => {
    const doc = makeDoc(
      '<h2 id="Appendix_A">Appendix A</h2>' +
      '<p><a href="#AppendixA">link</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe(INSTRUCTION_TITLE);
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('still emits a link-text suggestion alongside the warning when link text does not reference the heading', () => {
    const doc = makeDoc(
      '<h2>Eligibility Criteria</h2>' +
      '<p><a href="#eligibility_criteria">click here</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(2);
    const warning = results.find(r => (r as Issue).severity === 'warning') as Issue | undefined;
    const suggestion = results.find(r => (r as Issue).severity === 'suggestion') as Issue | undefined;
    expect(warning).toBeDefined();
    expect(warning!.instructionOnly).toBe(true);
    expect(suggestion).toBeDefined();
    expect(suggestion!.title).toBe('Consider adding destination heading name to link text');
  });

  it('emits separate instruction-only warnings for each distinct broken anchor', () => {
    const doc = makeDoc(
      '<p><a href="#eligibility">cap fix</a></p>' +
      '<p><a href="#AppendixA">ws fix</a></p>',
      xmlWithBookmarks('Eligibility', 'Appendix_A')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const warnings = results.filter(r => (r as Issue).severity === 'warning');
    expect(warnings).toHaveLength(2);
    warnings.forEach(w => {
      expect((w as Issue).title).toBe(INSTRUCTION_TITLE);
      expect((w as Issue).instructionOnly).toBe(true);
    });
  });

  it('uses the standard instruction description for fuzzy-single, ambiguous, and no-match cases', () => {
    const cases = [
      makeDoc('<h2>Eligibility</h2><p><a href="#_eligibility">link</a></p>'),
      makeDoc(
        '<h2 id="a-overview">Attachment 1: Overview</h2><h2 id="a-instructions">Attachment 1: Instructions</h2>' +
        '<p><a href="#Attachment_1">link</a></p>'
      ),
      makeDoc('<p><a href="#ghost">link</a></p>'),
    ];
    for (const doc of cases) {
      const issue = LINK_006.check(doc, OPTIONS)[0] as Issue;
      expect(issue.description).toBe(INSTRUCTION_DESC);
    }
  });
});
