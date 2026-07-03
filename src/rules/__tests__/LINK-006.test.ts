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
    const doc = makeDoc(
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
});
