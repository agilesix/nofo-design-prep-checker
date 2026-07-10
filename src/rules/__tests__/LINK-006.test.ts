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
  const xmlEsc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const bms = names
    .map((n, i) => `<w:bookmarkStart w:id="${i}" w:name="${xmlEsc(n)}"/><w:bookmarkEnd w:id="${i}"/>`)
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
  it('auto-fixes silently when _Eligibility matches bookmark Eligibility', () => {
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">See Eligibility</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.bookmark._Eligibility');
    expect(change.value).toBe('Eligibility');
  });

  it('auto-fixes silently for _Maintenance_of_effort when bookmark is Maintenance_of_effort', () => {
    const doc = makeDoc(
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>',
      xmlWithBookmarks('Maintenance_of_effort')
    );
    const change = LINK_006.check(doc, OPTIONS).find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.targetField).toBe('link.bookmark._Maintenance_of_effort');
    expect(change!.value).toBe('Maintenance_of_effort');
  });

  it('AutoAppliedChange has correct targetField and value', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.targetField).toBe('link.bookmark._Eligibility');
    expect(change.value).toBe('Eligibility');
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

  it('emits AutoAppliedChange for _Eligibility when OOXML bookmark Eligibility is present', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.value).toBe('Eligibility');
  });

  it('surfaces instruction-only warning for CamelCase anchor #AppendixA (Source 3, no OOXML)', () => {
    // No OOXML bookmarks — match is via Source 3 (heading text) → instruction-only
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

  it('surfaces instruction-only warning for CamelCase anchor #AppendixB (Source 3, no OOXML)', () => {
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
  it('auto-fixes silently for _Project_narrative_1 when bookmark is Project_narrative (stripped suffix)', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.bookmark._Project_narrative_1');
    expect(change.value).toBe('Project_narrative');
  });

  it('emits AutoAppliedChange (not Issue) even when numeric suffix was stripped', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_1">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.value).toBe('Project_narrative');
  });

  it('auto-fixes silently for _Project_narrative_2', () => {
    const doc = makeDoc(
      '<p><a href="#_Project_narrative_2">link</a></p>',
      xmlWithBookmarks('Project_narrative')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.value).toBe('Project_narrative');
    expect(change.targetField).toBe('link.bookmark._Project_narrative_2');
  });

  it('auto-fixes silently for _Step_3_1 when bookmark is Step_3 (stripped suffix)', () => {
    const doc = makeDoc(
      '<p><a href="#_Step_3_1">link</a></p>',
      xmlWithBookmarks('Step_3')
    );
    const change = LINK_006.check(doc, OPTIONS)[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-006');
    expect(change.value).toBe('Step_3');
    expect(change.targetField).toBe('link.bookmark._Step_3_1');
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
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Program_requirements_expectations::link');
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
    expect(suggestion.inputRequired?.targetField).toBe('link.text.Attach8OrgChart::link');
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
  it('auto-fixes silently for capitalization-only OOXML mismatch (#eligibility → Eligibility)', () => {
    const doc = makeDoc(
      '<p><a href="#eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.bookmark.eligibility');
    expect(change.value).toBe('Eligibility');
  });

  it('auto-fixes silently for leading-underscore OOXML mismatch (#_Eligibility → Eligibility)', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.value).toBe('Eligibility');
  });

  it('emits instruction-only warning for CamelCase mismatch via HTML id only (no OOXML)', () => {
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

  it('emits AutoAppliedChanges for OOXML matches (not Issues)', () => {
    const doc = makeDoc(
      '<p><a href="#eligibility">cap fix</a></p>' +
      '<p><a href="#AppendixA">ws fix</a></p>',
      xmlWithBookmarks('Eligibility', 'Appendix_A')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const changes = results.filter(r => !('severity' in r)) as AutoAppliedChange[];
    expect(changes).toHaveLength(2);
    changes.forEach(c => {
      expect(c.ruleId).toBe('LINK-006');
      expect(c.value).toBeDefined();
    });
  });

  it('uses the standard instruction description for ambiguous and no-match cases', () => {
    const cases = [
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

// ─── LINK-006 leading-underscore bookmark auto-fix ────────────────────────────

describe('LINK-006 leading-underscore bookmark auto-fix', () => {
  it('produces no issue when #_Eligibility matches bookmark _Eligibility exactly (Tier 1b)', () => {
    // Heading "Eligibility" is required: _Eligibility is resolvable only if its body
    // ("Eligibility") is a heading slug, which it is when "Eligibility" exists.
    const doc = makeDoc(
      '<h2>Eligibility</h2>' +
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('_Eligibility')
    );
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('auto-fixes silently when #_Eligibility matches bookmark Eligibility (fuzzy OOXML)', () => {
    const doc = makeDoc(
      '<p><a href="#_Eligibility">link</a></p>',
      xmlWithBookmarks('Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.bookmark._Eligibility');
    expect(change.value).toBe('Eligibility');
  });

  it('auto-fixes silently when #Eligibility matches bookmark _Eligibility (fuzzy OOXML)', () => {
    const doc = makeDoc(
      '<p><a href="#Eligibility">link</a></p>',
      xmlWithBookmarks('_Eligibility')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.targetField).toBe('link.bookmark.Eligibility');
    expect(change.value).toBe('_Eligibility');
  });

  it('auto-fixes silently when #_Program-specific_limitations_1 matches bookmark _Program-specific_limitations (stripped suffix)', () => {
    const doc = makeDoc(
      '<p><a href="#_Program-specific_limitations_1">link</a></p>',
      xmlWithBookmarks('_Program-specific_limitations')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('LINK-006');
    expect(change.value).toBe('_Program-specific_limitations');
  });

  it('emits instruction-only warning when anchor has no matching bookmark', () => {
    const doc = makeDoc(
      '<p><a href="#_Completely_Unrelated">link</a></p>',
      xmlWithBookmarks('SomethingElse')
    );
    const results = LINK_006.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.severity).toBe('warning');
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });
});

// ─── Heading-derived anchor regression: slugifyHeading wins over legacy bookmarks ─
//
// Bug: #_Resumes_and_job_1 was silently retargeted to #_Resumes_and_Job because
// Source 1 (OOXML bookmark name matching) ran before Source 3 (heading text
// matching) and found a legacy bookmark whose normalised name matched the
// stripped anchor.  The fix reorders Sources so that when a heading is found,
// the anchor is always derived via slugifyHeading on the heading text.

describe('LINK-006 heading-derived anchor — slugifyHeading wins over legacy bookmarks', () => {
  /** Minimal document.xml wrapping the given body XML. */
  function wrapDocXml(body: string): string {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${body}</w:body></w:document>`
    );
  }

  it('resolves #_Resumes_and_job_1 to slugifyHeading result, not a legacy bookmark', () => {
    // The real-world scenario:
    //  • Heading H5 "Resumes and job descriptions" — no bookmark attached
    //  • Separate paragraph with stacked legacy bookmarks _Resume_and_Job,
    //    _Resumes_and_Job, _Organization_Chart — none match the heading text
    //  • Broken link #_Resumes_and_job_1 whose numeric suffix was appended by
    //    Word when a second heading with similar text existed at some point
    // Expected: retarget to "Resumes_and_job_descriptions" (slugifyHeading),
    //           NOT to "_Resumes_and_Job" (legacy bookmark prefix-match).
    const html =
      '<h5>Resumes and job descriptions</h5>' +
      '<p><a href="#_Resumes_and_job_1">See resume section</a></p>';

    const documentXml = wrapDocXml(
      // Heading paragraph (no bookmark)
      `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr>` +
      `<w:r><w:t>Resumes and job descriptions</w:t></w:r></w:p>` +
      // Separate anchor-only paragraph with stacked legacy bookmarks
      `<w:p>` +
      `<w:bookmarkStart w:id="1" w:name="_Resume_and_Job"/>` +
      `<w:bookmarkStart w:id="2" w:name="_Resumes_and_Job"/>` +
      `<w:bookmarkStart w:id="3" w:name="_Organization_Chart"/>` +
      `<w:bookmarkEnd w:id="1"/>` +
      `<w:bookmarkEnd w:id="2"/>` +
      `<w:bookmarkEnd w:id="3"/>` +
      `</w:p>`
    );

    const doc = makeDoc(html, documentXml);
    const results = LINK_006.check(doc, OPTIONS);

    // Must emit an AutoAppliedChange (auto-fix), not an instruction-only Issue
    const change = results.find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.targetField).toBe('link.bookmark._Resumes_and_job_1');

    // The value must start with the slugifyHeading-derived anchor
    expect(change!.value).toMatch(/^Resumes_and_job_descriptions/);
    // Must NOT resolve to the legacy bookmark names
    expect(change!.value).not.toBe('_Resumes_and_Job');
    expect(change!.value).not.toBe('_Resume_and_Job');
  });

  it('still auto-fixes when heading has a case-mismatched OOXML bookmark', () => {
    // Heading "Maintenance of Effort" has an existing Word-generated bookmark
    // "Maintenance_of_effort" (lowercase 'e' — Word lowercases some words).
    // slugifyHeading("Maintenance of Effort") = "Maintenance_of_Effort" (capital E).
    // The case-insensitive lookup must find the existing bookmark and use its
    // exact name so the written anchor wires up to the existing w:bookmarkStart.
    const html =
      '<h2>Maintenance of Effort</h2>' +
      '<p><a href="#_Maintenance_of_effort">See MOE</a></p>';
    const doc = makeDoc(html, xmlWithBookmarks('Maintenance_of_effort'));
    const change = LINK_006.check(doc, OPTIONS).find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.value).toBe('Maintenance_of_effort'); // exact OOXML name preserved
  });

  it('emits needsBookmarkCreation value for heading with no OOXML bookmark', () => {
    // Heading "Project funding" exists in the HTML and OOXML but has no bookmark.
    // Broken link #_Project_funding_1 should retarget to
    // "Project_funding" and signal bookmark creation via the "::" encoding.
    const html =
      '<h2>Project funding</h2>' +
      '<p><a href="#_Project_funding_1">See Project funding</a></p>';
    const documentXml = wrapDocXml(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Project funding</w:t></w:r></w:p>`
    );
    const change = LINK_006.check(makeDoc(html, documentXml), OPTIONS)
      .find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    // Value must encode both anchor and heading text for bookmark creation
    expect(change!.value).toBe('Project_funding::Project funding');
  });

  it('uses existing _Grants_management bookmark instead of creating bare-slug duplicate', () => {
    // slugifyHeading("Grants management") = "Grants_management" (no leading underscore).
    // The OOXML lookup must also try "_" + slug so that the NOFO Builder bookmark
    // "_Grants_management" is found.  Without the fallback, needsBookmarkCreation is
    // set and buildDocx inserts a spurious "Grants_management" alongside the original,
    // which then causes rename rules to produce a duplicate-name conflict.
    const html =
      '<h2>Grants management</h2>' +
      '<p><a href="#_Grants_management_1">See section</a></p>';
    const documentXml = wrapDocXml(
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:bookmarkStart w:id="1" w:name="_Grants_management"/>` +
      `<w:bookmarkEnd w:id="1"/>` +
      `<w:r><w:t>Grants management</w:t></w:r></w:p>`
    );
    const change = LINK_006.check(makeDoc(html, documentXml), OPTIONS)
      .find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    // Must resolve to the existing _Grants_management bookmark
    expect(change!.value).toBe('_Grants_management');
    // needsBookmarkCreation would encode as "slug::headingText" — must not appear
    expect(change!.value).not.toContain('::');
  });
});

// ─── Case 1: malformed bookmark:// links ─────────────────────────────────────

describe('LINK-006 Case 1: malformed bookmark:// links', () => {
  it('auto-fixes bookmark:// link when anchor matches an existing OOXML bookmark', () => {
    const doc = makeDoc(
      '<h2>Contacts and Support</h2>' +
      '<p><a href="bookmark://SomeName">link text</a></p>',
      xmlWithBookmarks('SomeName')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.targetField).toBe('link.malformed.bookmark.SomeName');
    expect(change!.value).toBe('SomeName');
  });

  it('emits a warning Issue for bookmark:// link with no matching heading or bookmark', () => {
    const doc = makeDoc(
      '<h2>Contacts and Support</h2>' +
      '<p><a href="bookmark://UnknownAnchor">link text</a></p>'
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(r => 'severity' in r) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('LINK-006');
    expect(issue!.severity).toBe('warning');
    expect(issue!.instructionOnly).toBe(true);
    // Must not auto-fix
    const hasAutoFix = results.some(r => !('severity' in r));
    expect(hasAutoFix).toBe(false);
  });

  it('auto-fixes bookmark:// link when anchor uses "and" but bookmark uses "&" (fuzzy match)', () => {
    // bookmark://_Contacts_and_Support → _Contacts_&_Support after 'and' ↔ '&' normalization
    const doc = makeDoc(
      '<p><a href="bookmark://_Contacts_and_Support">link text</a></p>',
      xmlWithBookmarks('_Contacts_&_Support')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.targetField).toBe('link.malformed.bookmark._Contacts_and_Support');
    expect(change!.value).toBe('_Contacts_&_Support');
  });

  it('auto-fixes bookmark:// link when anchor uses "&" but bookmark uses "and" (reverse fuzzy match)', () => {
    const doc = makeDoc(
      '<p><a href="bookmark://_Contacts_&_Support">link text</a></p>',
      xmlWithBookmarks('_Contacts_and_Support')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const change = results.find(r => !('severity' in r)) as AutoAppliedChange | undefined;
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('LINK-006');
    expect(change!.targetField).toBe('link.malformed.bookmark._Contacts_&_Support');
    expect(change!.value).toBe('_Contacts_and_Support');
  });

  it('emits a warning (no auto-fix) when fuzzy match is ambiguous (multiple bookmarks normalize identically)', () => {
    // Both bookmarks normalize to 'contacts_and_support'; rawAnchor doesn't exactly match either.
    const doc = makeDoc(
      '<p><a href="bookmark://contacts_and_support">link text</a></p>',
      xmlWithBookmarks('contacts_&_support', 'Contacts_&_support')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const hasAutoFix = results.some(r => !('severity' in r));
    expect(hasAutoFix).toBe(false);
    const issue = results.find(r => 'severity' in r) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
    expect(issue!.instructionOnly).toBe(true);
  });

  it('does not auto-fix to _GoBack even when it fuzzy-matches the raw anchor', () => {
    // _GoBack is Word's internal navigation bookmark; it must never be a fuzzy-match target.
    const doc = makeDoc(
      '<p><a href="bookmark://_GoBack">link text</a></p>',
      xmlWithBookmarks('_GoBack')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const hasAutoFix = results.some(r => !('severity' in r));
    expect(hasAutoFix).toBe(false);
  });
});

// ─── Case 2: orphaned OOXML bookmarks ────────────────────────────────────────

describe('LINK-006 Case 2: orphaned OOXML bookmarks', () => {
  it('emits a warning for w:anchor pointing to OOXML bookmark not derived from a heading', () => {
    // "ArbitraryBookmark" exists as an OOXML bookmark but is not a heading slug
    const doc = makeDoc(
      '<h2 id="Some_Heading">Some Heading</h2>' +
      '<p><a href="#ArbitraryBookmark">link text</a></p>',
      xmlWithBookmarks('ArbitraryBookmark')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('LINK-006');
    expect(issue!.instructionOnly).toBe(true);
    // Must not auto-fix
    const hasAutoFix = results.some(r => !('severity' in r));
    expect(hasAutoFix).toBe(false);
  });

  it('does not flag an anchor that matches a heading slug (correctly resolvable)', () => {
    // "Some_Heading" is the slug for "Some Heading" — NOFO Builder can resolve this
    const doc = makeDoc(
      '<h2 id="Some_Heading">Some Heading</h2>' +
      '<p><a href="#Some_Heading">link text</a></p>',
      xmlWithBookmarks('Some_Heading')
    );
    const results = LINK_006.check(doc, OPTIONS);
    // Only a link-text suggestion at most; no warning about unresolvable anchor
    const hasWarning = results.some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag external http links', () => {
    const doc = makeDoc('<p><a href="https://example.com">external link</a></p>');
    expect(LINK_006.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags _Grants.gov even when a "Grants.gov" heading exists (body contains non-slug char)', () => {
    // slugifyHeading('Grants.gov') = 'Grants_gov', so the body 'Grants.gov' (with '.')
    // is not a valid NOFO Builder heading slug. The bookmark is orphaned regardless of
    // whether a matching heading exists elsewhere in the document.
    const doc = makeDoc(
      '<h2>Grants.gov</h2>' +
      '<p><a href="#_Grants.gov">federal service desk</a></p>',
      xmlWithBookmarks('_Grants.gov')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('LINK-006');
    expect(issue!.instructionOnly).toBe(true);
    const hasAutoFix = results.some(r => !('severity' in r));
    expect(hasAutoFix).toBe(false);
  });

  it('does not flag _Grants_gov when a "Grants.gov" heading exists (correctly-formatted slug)', () => {
    // slugifyHeading('Grants.gov') = 'Grants_gov'. The bookmark '_Grants_gov' has body
    // 'Grants_gov' which IS a key in cleanHeadingSlugMap → NOFO Builder can resolve it.
    const doc = makeDoc(
      '<h2>Grants.gov</h2>' +
      '<p><a href="#_Grants_gov">grants portal</a></p>',
      xmlWithBookmarks('_Grants_gov')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('flags _Grants.gov when its <a> is inside a paragraph — real-document Tier 1a path', () => {
    // Mammoth renders the _Grants.gov bookmark as <a id="_Grants.gov"> inside the
    // "Maureen Linden" paragraph. The heading-ancestor check must NOT suppress this
    // because the <a> has no heading ancestor → warning should still fire.
    const doc = makeDoc(
      '<h2>Grants.gov</h2>' +
      '<p><a id="_Grants.gov"></a>Maureen Linden</p>' +
      '<p><a href="#_Grants.gov">federal service desk</a></p>',
      xmlWithBookmarks('_Grants.gov')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('LINK-006');
    expect(issue!.instructionOnly).toBe(true);
    expect(results.some(r => !('severity' in r))).toBe(false);
  });
});

// ─── Case 2 continued: Word bookmark-naming quirks on displaced bookmarks ────
//
// Bookmarks that were originally w:displacedByCustomXml="next" siblings before a
// <w:sdt> can end up outside their heading paragraph after the sdt is unwrapped
// at import time (see fix/strip-sdts-at-import). The bookmark is still genuinely
// heading-derived and NOFO Builder resolves it correctly on import, but its name
// no longer exactly equals the current heading slug because of two known Word
// bookmark-naming quirks: a trailing numeric disambiguation suffix (_1, _2, …)
// for repeated heading text, and legacy 40-character bookmark-name truncation for
// long headings. isResolvableByNOFOBuilder must tolerate both — without treating
// an unrelated, non-heading bookmark as resolvable just because it happens to be
// a short prefix of some heading's slug.

describe('LINK-006 Case 2: Word bookmark-naming quirks (numeric suffix, truncation)', () => {
  it('does not flag a bookmark with a Word numeric disambiguation suffix (_2) for a repeated heading', () => {
    const doc = makeDoc(
      '<h2>Attachments</h2><p>first occurrence body</p>' +
      '<h3>Attachments</h3>' +
      '<p><a id="_Attachments_2"></a>second occurrence body</p>' +
      '<p><a href="#_Attachments_2">see attachments</a></p>',
      xmlWithBookmarks('_Attachments_2')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a truncated bookmark that is a clean underscore-boundary prefix of the heading slug', () => {
    // Word's legacy 40-character bookmark-name cap truncates long headings at an
    // underscore boundary — "Line_item_budget_and" is a prefix of the full slug.
    const doc = makeDoc(
      '<h2>Line item budget and staffing plan</h2>' +
      '<p><a id="_Line_item_budget_and"></a>body text</p>' +
      '<p><a href="#_Line_item_budget_and">see budget</a></p>',
      xmlWithBookmarks('_Line_item_budget_and')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a truncated bookmark with a doubled underscore where a segment was dropped', () => {
    const doc = makeDoc(
      '<h2>Required forms and certifications</h2>' +
      '<p><a id="_Required__forms"></a>body text</p>' +
      '<p><a href="#_Required__forms">see forms</a></p>',
      xmlWithBookmarks('_Required__forms')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('still flags an unrelated short bookmark that only coincidentally prefixes a heading slug', () => {
    // "_Attach" must NOT resolve just because "Attachments" starts with "Attach" —
    // there is no underscore boundary immediately after "Attach" in "Attachments",
    // so this is not the truncation pattern and must remain a warning.
    const doc = makeDoc(
      '<h2>Attachments</h2>' +
      '<p><a id="_Attach"></a>unrelated body text</p>' +
      '<p><a href="#_Attach">see attach</a></p>',
      xmlWithBookmarks('_Attach')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(true);
  });

  it('still flags _Grants.gov even with the new tolerance (regression guard)', () => {
    // "Grants.gov" contains a literal period that never appears in any heading
    // slug, so none of the new tolerances (suffix-strip, underscore-boundary
    // prefix) can make this orphaned bookmark spuriously resolvable.
    const doc = makeDoc(
      '<h2>Grants.gov</h2>' +
      '<p><a id="_Grants.gov"></a>Maureen Linden</p>' +
      '<p><a href="#_Grants.gov">federal service desk</a></p>',
      xmlWithBookmarks('_Grants.gov')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.instructionOnly).toBe(true);
  });

  it('does not falsely resolve a non-heading bookmark just because a similarly-worded heading exists', () => {
    // #DEI (no leading underscore) must stay strict/exact-match-only (case 1),
    // even though "DEI initiatives and inclusion practices" would satisfy the
    // underscore-boundary prefix tolerance if it were applied to case 1.
    const doc = makeDoc(
      '<h2>DEI initiatives and inclusion practices</h2>' +
      '<ul><li><a id="DEI"></a>Applicants must address diversity, equity, and inclusion.</li></ul>' +
      '<p><a href="#DEI">DEI section</a></p>',
      xmlWithBookmarks('DEI')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.description).toContain('non-heading anchor (#DEI)');
  });
});

// ─── Case 2 continued: literal punctuation and case drift on displaced bookmarks ───
//
// A second live-testing pass found 6 more confirmed false positives that the
// numeric-suffix/truncation-prefix tolerance above did not cover: some
// bookmark-generating tools preserve '&', ':', and '-' literally where
// slugifyHeading would substitute an underscore, and heading text can drift in
// case independently of an already-created bookmark name. All 6 are genuinely
// heading-derived bookmarks NOFO Builder resolves correctly; none of the new
// tolerance extends to '.' (or any other punctuation), which is what keeps the
// _Grants.gov regression guard passing.

describe('LINK-006 Case 2: literal punctuation (&, :, -) and case-insensitive match', () => {
  it('does not flag a bookmark with a literal ampersand where the heading uses "and"', () => {
    const doc = makeDoc(
      '<h2>Contacts and support</h2>' +
      '<p><a id="_Contacts_&amp;_Support"></a>body text</p>' +
      '<p><a href="#_Contacts_&amp;_Support">see contacts</a></p>',
      xmlWithBookmarks('_Contacts_&_Support')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark with a literal colon (common in "Step N:" headings)', () => {
    const doc = makeDoc(
      '<h2>Step 6: Learn about your eligibility</h2>' +
      '<p><a id="_Step_6:_Learn"></a>body text</p>' +
      '<p><a href="#_Step_6:_Learn">see step 6</a></p>',
      xmlWithBookmarks('_Step_6:_Learn')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark with a literal hyphen where slugifyHeading would use an underscore', () => {
    const doc = makeDoc(
      '<h2>Line item budget and staffing plan</h2>' +
      '<p><a id="_Line-item_budget_and"></a>body text</p>' +
      '<p><a href="#_Line-item_budget_and">see budget</a></p>',
      xmlWithBookmarks('_Line-item_budget_and')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark with a literal slash where slugifyHeading would use an underscore', () => {
    // slugifyHeading's own doc comment example: "Step 3/4: Overview" → "Step_3_4_Overview".
    const doc = makeDoc(
      '<h2>Step 3/4: Overview</h2>' +
      '<p><a id="_Step_3/4:_Overview"></a>body text</p>' +
      '<p><a href="#_Step_3/4:_Overview">see overview</a></p>',
      xmlWithBookmarks('_Step_3/4:_Overview')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark whose case differs from the current heading text', () => {
    const doc = makeDoc(
      '<h2>paper submissions</h2>' +
      '<p><a id="_Paper_Submissions"></a>body text</p>' +
      '<p><a href="#_Paper_Submissions">see paper submissions</a></p>',
      xmlWithBookmarks('_Paper_Submissions')
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('still flags _Grants.gov when combined with a case difference (period protection survives case-insensitivity)', () => {
    const doc = makeDoc(
      '<h2>grants.gov</h2>' +
      '<p><a id="_Grants.Gov"></a>Maureen Linden</p>' +
      '<p><a href="#_Grants.Gov">federal service desk</a></p>',
      xmlWithBookmarks('_Grants.Gov')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.instructionOnly).toBe(true);
  });
});

// ─── Issue 2 regression: bookmark on a non-heading (bullet list) paragraph ───

describe('LINK-006: bookmark on a non-heading bullet-list paragraph (#DEI)', () => {
  it('flags #DEI as a warning when the bookmark sits on a bullet-list paragraph, not a heading', () => {
    // Confirms current, correct behavior: a bookmark that exists in OOXML but is
    // not on (or derived from) a heading is genuinely unresolvable by NOFO
    // Builder, and must remain a warning.
    const doc = makeDoc(
      '<h2>Program requirements</h2>' +
      '<ul><li><a id="DEI"></a>Applicants must address diversity, equity, and inclusion.</li></ul>' +
      '<p><a href="#DEI">DEI section</a></p>',
      xmlWithBookmarks('DEI')
    );
    const results = LINK_006.check(doc, OPTIONS);
    const issue = results.find(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('LINK-006');
    expect(issue!.instructionOnly).toBe(true);
    expect(issue!.description).toContain('non-heading anchor (#DEI)');
    expect(results.some(r => !('severity' in r))).toBe(false);
  });
});

// ─── Endnote/footnote exclusion ───────────────────────────────────────────────

describe('LINK-006 endnote/footnote exclusion', () => {
  it('does not flag endnote-N forward links (mammoth endnote navigation)', () => {
    // Mammoth renders Word endnote references as #endnote-N links. These are
    // auto-generated by mammoth and must never be checked as NOFO anchor links.
    const doc = makeDoc(
      '<p>Text<sup><a href="#endnote-1">[1]</a></sup></p>' +
      '<ol><li id="endnote-1">Endnote text. <a href="#endnote-ref-1">↑</a></li></ol>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag endnote-ref-N back-links (mammoth endnote back-navigation)', () => {
    const doc = makeDoc(
      '<p><a id="endnote-ref-1">[1]</a>, text.</p>' +
      '<ol><li><a href="#endnote-ref-1">↑</a> Endnote text.</li></ol>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag footnote-N links', () => {
    const doc = makeDoc(
      '<p>Text<sup><a href="#footnote-3">[3]</a></sup></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag footnote-ref-N back-links', () => {
    const doc = makeDoc(
      '<p><a href="#footnote-ref-12">↑</a> footnote text.</p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('still flags a non-endnote anchor that happens to contain digits', () => {
    // "section-1" does not match the endnote/footnote pattern → should warn
    const doc = makeDoc('<p><a href="#section-1">link</a></p>');
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(true);
  });
});

// ─── Bookmark inside heading (mammoth rendering pattern) ─────────────────────

describe('LINK-006 bookmark-inside-heading suppression', () => {
  it('does not flag a bookmark <a> inside a heading — basic pattern', () => {
    // Mammoth renders w:bookmarkStart as <a id="..."> INSIDE the heading element,
    // not as an id attribute on the heading itself. The .closest() heading check
    // must recognise this and suppress the orphaned-bookmark warning.
    const doc = makeDoc(
      '<h3><a id="_Budget_Narrative"></a>Budget justification narrative</h3>' +
      '<p><a href="#_Budget_Narrative">budget</a></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark <a> inside a heading with trailing numeric suffix', () => {
    // _Project_Narrative_1 is Word's auto-generated duplicate bookmark for a
    // heading. Placed inside <h3>, so the heading-ancestor check suppresses it.
    const doc = makeDoc(
      '<h3><a id="_Project_Narrative_1"></a>Project narrative</h3>' +
      '<p><a href="#_Project_Narrative_1">project narrative</a></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag a bookmark <a> inside a heading that is inside a table cell', () => {
    // Headings inside tables are common in NOFOs. The .closest() traversal
    // must still find the heading ancestor through table markup.
    const doc = makeDoc(
      '<table><tr><td>' +
        '<h4><a id="_Required_Format_for"></a>Required format for application contents</h4>' +
      '</td></tr></table>' +
      '<p><a href="#_Required_Format_for">required format</a></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('does not flag multiple bookmark <a> elements sharing the same heading', () => {
    // Real documents often place several bookmarks on the same heading paragraph.
    // All should be suppressed.
    const doc = makeDoc(
      '<h3>' +
        '<a id="_Standard_Forms"></a>' +
        '<a id="_Standard__Forms"></a>' +
        '<a id="_Other_Required_Forms"></a>' +
        'Other required forms' +
      '</h3>' +
      '<p><a href="#_Standard_Forms">standard forms</a></p>' +
      '<p><a href="#_Standard__Forms">other required forms</a></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(false);
  });

  it('still flags a bookmark <a> whose nearest element is a paragraph, not a heading', () => {
    // Confirms the heading-ancestor check only suppresses when the bookmark
    // actually resides inside a heading — not when it is a stray paragraph anchor.
    const doc = makeDoc(
      '<h2>Some Heading</h2>' +
      '<p><a id="_Stray_Bookmark"></a>non-heading paragraph</p>' +
      '<p><a href="#_Stray_Bookmark">link</a></p>'
    );
    const hasWarning = LINK_006.check(doc, OPTIONS).some(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    );
    expect(hasWarning).toBe(true);
  });
});

// ─── HHS-2026-ACL-NIDILRR-DPCP-0221 regression ───────────────────────────────

describe('LINK-006 HHS-2026-ACL-NIDILRR-DPCP-0221 regression', () => {
  // Representative fixture based on actual bookmark/anchor patterns found in
  // HHS-2026-ACL-NIDILRR-DPCP-0221. Covers every category identified in the
  // full audit (endnotes, heading-inside bookmarks, orphaned non-heading bookmark).

  function makeNOFOFixtureDoc(): ParsedDocument {
    const html =
      // Heading-inside bookmark patterns (must NOT warn)
      '<h2><a id="_Find_the_application"></a>Find the application package</h2>' +
      '<h3><a id="_Project_Narrative_1"></a>Project narrative</h3>' +
      '<h3><a id="_Budget_Narrative"></a>Budget justification narrative</h3>' +
      '<h3><a id="_Attachments_1"></a>Attachments</h3>' +
      '<h3>' +
        '<a id="_Standard_Forms"></a>' +
        '<a id="_Standard__Forms"></a>' +
        'Other required forms' +
      '</h3>' +
      '<h4><a id="_Required_Format_for"></a>' +
        '<a id="_Project_abstract_1"></a>' +
        'Required format for application contents' +
      '</h4>' +
      // Orphaned bookmark on non-heading paragraph (MUST warn)
      '<h2>Grants.gov</h2>' +
      '<p><a id="_Grants.gov"></a>Maureen Linden</p>' +
      // Endnote navigation links (must NOT warn)
      '<p>Text<sup><a href="#endnote-2">[1]</a></sup></p>' +
      '<p>Text<sup><a href="#endnote-3">[2]</a></sup></p>' +
      '<ol>' +
        '<li id="endnote-2">Ref 1. <a href="#endnote-ref-2">↑</a></li>' +
        '<li id="endnote-3">Ref 2. <a href="#endnote-ref-3">↑</a></li>' +
      '</ol>' +
      // Links under test
      '<p><a href="#_Find_the_application">application package</a></p>' +
      '<p><a href="#_Project_Narrative_1">project narrative</a></p>' +
      '<p><a href="#_Budget_Narrative">budget narrative</a></p>' +
      '<p><a href="#_Attachments_1">attachments</a></p>' +
      '<p><a href="#_Standard_Forms">standard forms</a></p>' +
      '<p><a href="#_Standard__Forms">other required forms</a></p>' +
      '<p><a href="#_Required_Format_for">required format</a></p>' +
      '<p><a href="#_Project_abstract_1">project abstract</a></p>' +
      '<p><a href="#_Grants.gov">federal service desk</a></p>';

    return makeDoc(html);
  }

  it('produces no warning for heading-inside bookmark anchors', () => {
    const doc = makeNOFOFixtureDoc();
    const results = LINK_006.check(doc, OPTIONS);
    const warnings = results.filter(
      r => 'severity' in r && (r as Issue).severity === 'warning'
    ) as Issue[];
    const headingInsideAnchors = [
      '_Find_the_application', '_Project_Narrative_1', '_Budget_Narrative',
      '_Attachments_1', '_Standard_Forms', '_Standard__Forms',
      '_Required_Format_for', '_Project_abstract_1',
    ];
    const falsePositives = warnings.filter(w =>
      headingInsideAnchors.some(a => w.location === `#${a}`)
    );
    expect(falsePositives).toHaveLength(0);
  });

  it('produces no warning for endnote navigation links', () => {
    const doc = makeNOFOFixtureDoc();
    const results = LINK_006.check(doc, OPTIONS);
    const endnoteWarnings = results.filter(r => {
      if (!('severity' in r)) return false;
      const loc = (r as Issue).location ?? '';
      return /^#(end|foot)note(-ref)?-\d+$/.test(loc);
    });
    expect(endnoteWarnings).toHaveLength(0);
  });

  it('flags the _Grants.gov orphaned bookmark as a true positive', () => {
    const doc = makeNOFOFixtureDoc();
    const results = LINK_006.check(doc, OPTIONS);
    const grantsGovWarning = results.find(
      r => 'severity' in r && (r as Issue).location === '#_Grants.gov'
    ) as Issue | undefined;
    expect(grantsGovWarning).toBeDefined();
    expect(grantsGovWarning!.severity).toBe('warning');
    expect(grantsGovWarning!.instructionOnly).toBe(true);
  });
});
