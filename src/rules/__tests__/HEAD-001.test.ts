import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import HEAD_001 from '../universal/HEAD-001';
import type { ParsedDocument, Issue, AutoAppliedChange } from '../../types';

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

// ─── H2: auto-fix to title case ──────────────────────────────────────────────

describe('HEAD-001: H2 sentence case → auto-fix (AutoAppliedChange)', () => {
  it('emits an AutoAppliedChange (not an Issue) for an H2 in sentence case', () => {
    const doc = makeDoc('<h2>Program description information</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    // AutoAppliedChange has no severity
    expect('severity' in change).toBe(false);
    expect(change.ruleId).toBe('HEAD-001');
    expect(change.targetField).toBe('heading.h2.titlecase');
    expect(change.description).toContain('H2 heading');
    expect(change.description).toContain('title case');
  });

  it('encodes the corrected text in the change value', () => {
    const doc = makeDoc('<h2>Program description information</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.old).toBe('Program description information');
    expect(pairs[0]!.new).toBe('Program Description Information');
  });

  it('flags an H2 where a major word is lowercase', () => {
    const doc = makeDoc('<h2>Types of awards and review criteria</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.targetField).toBe('heading.h2.titlecase');
  });

  it('does not emit any result for a correctly cased H2 in title case', () => {
    const doc = makeDoc('<h2>Program Description Information</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not emit any result for an H2 where all non-minor words are capitalised', () => {
    const doc = makeDoc('<h2>Award and Submission Requirements</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not emit any result for a single-word H2', () => {
    const doc = makeDoc('<h2>Eligibility</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not emit any result for an H2 where all non-first words are minor words', () => {
    const doc = makeDoc('<h2>Award in the</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('emits a single AutoAppliedChange covering multiple H2 headings', () => {
    const doc = makeDoc(
      '<h2>Program description information</h2>' +
      '<h2>Types of awards and review criteria</h2>'
    );
    const results = HEAD_001.check(doc, OPTIONS);
    // One AutoAppliedChange for both H2s (H3-H6 suggestions are separate)
    const autoChanges = results.filter(r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase');
    expect(autoChanges).toHaveLength(1);
    const change = autoChanges[0] as AutoAppliedChange;
    expect(change.description).toContain('2 H2 headings');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs).toHaveLength(2);
  });
});

// ─── H2: title case conversion rules ─────────────────────────────────────────

describe('HEAD-001: toTitleCase conversion rules', () => {
  function getNew(html: string): string {
    const results = HEAD_001.check(makeDoc(html), OPTIONS);
    const change = results[0] as AutoAppliedChange;
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    return pairs[0]!.new;
  }

  it('capitalizes non-minor content words', () => {
    expect(getNew('<h2>Program description information</h2>')).toBe('Program Description Information');
  });

  it('leaves minor words lowercase', () => {
    expect(getNew('<h2>Types of awards and review criteria</h2>')).toBe('Types of Awards and Review Criteria');
  });

  it('capitalizes the first word after a colon', () => {
    expect(getNew('<h2>Step 2: get ready to apply</h2>')).toBe('Step 2: Get Ready to Apply');
  });

  it('preserves ALL-CAPS acronyms unchanged', () => {
    expect(getNew('<h2>HRSA funding overview</h2>')).toBe('HRSA Funding Overview');
  });

  it('leaves already-capitalized words unchanged (proper nouns)', () => {
    // "National Cancer Institute" is already capitalized mid-sentence — stays as-is.
    // "programs" starts lowercase → triggers sentence case, gets capitalized.
    // "from" is a minor word → stays lowercase.
    expect(getNew('<h2>funding from National Cancer Institute programs</h2>')).toBe(
      'Funding from National Cancer Institute Programs'
    );
  });

  it('handles a CDC acronym mixed with lowercase content words', () => {
    expect(getNew('<h2>CDC funding overview</h2>')).toBe('CDC Funding Overview');
  });
});

// ─── H3–H6: must use sentence case ───────────────────────────────────────────

describe('HEAD-001: H3–H6 title case detection (suggestion Issues)', () => {
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
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
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
    const doc = makeDoc('<h3>Contact CDC for more information</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still auto-fixes an H2 when an ALL-CAPS acronym is mixed with lowercase major words', () => {
    // "HRSA" is ALL CAPS → skipped; "funding" and "overview" are lowercase
    // non-minor words → sentence case is still detected and auto-fixed
    const doc = makeDoc('<h2>HRSA funding overview</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.targetField).toBe('heading.h2.titlecase');
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    // HRSA preserved; "funding" and "overview" capitalized
    expect(pairs[0]!.new).toBe('HRSA Funding Overview');
  });
});

// ─── Colon restart ───────────────────────────────────────────────────────────

describe('HEAD-001: word after colon treated as sentence start', () => {
  it('does not flag an H3 where the only capitalised word follows a colon', () => {
    const doc = makeDoc('<h3>Background: Why this matters</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags an H3 with a capitalised word that does NOT follow a colon', () => {
    const doc = makeDoc('<h3>Contact and Support: details and background</h3>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('H3 heading may need sentence case');
  });

  it('capitalizes the first word after a colon when auto-fixing an H2', () => {
    const doc = makeDoc('<h2>Step 2: get ready to apply</h2>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    const pairs = JSON.parse(change.value!) as { old: string; new: string }[];
    expect(pairs[0]!.new).toBe('Step 2: Get Ready to Apply');
  });
});

// ─── Federal law exceptions ───────────────────────────────────────────────────

describe('HEAD-001: federal law and directive exceptions', () => {
  it('does not flag an H2 containing "Paperwork Reduction Act"', () => {
    const doc = makeDoc('<h2>Paperwork Reduction Act</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 containing "Americans with Disabilities Act"', () => {
    // Would normally look like title case — but it's a federal law exception
    const doc = makeDoc('<h3>Americans with Disabilities Act</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H2 containing "Privacy Act"', () => {
    const doc = makeDoc('<h2>Privacy Act requirements</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a heading containing "Executive Order"', () => {
    const doc = makeDoc('<h3>Executive Order 13166 compliance</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a heading matching the "Act of" pattern', () => {
    const doc = makeDoc('<h3>Civil Rights Act of 1964</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a heading matching the "Section N" pattern', () => {
    const doc = makeDoc('<h2>Section 508 accessibility requirements</h2>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a heading containing "Section 1557"', () => {
    const doc = makeDoc('<h3>Section 1557 compliance</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a heading containing "Uniform Guidance"', () => {
    const doc = makeDoc('<h3>Uniform Guidance requirements</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still flags a non-exempt H3 when other headings on the page are exempt', () => {
    // The exempt heading should not suppress other headings
    const doc = makeDoc(
      '<h3>Section 508 compliance</h3>' +
      '<h3>Contact and Support Information</h3>'
    );
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('H3 heading may need sentence case');
  });
});

// ─── Federal grants system exceptions ────────────────────────────────────────

describe('HEAD-001: federal grants system names are exempt from the general cap check', () => {
  it('does not flag an H3 containing "eRA Commons"', () => {
    const doc = makeDoc('<h3>eRA Commons Registration Requirements</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Grants.gov"', () => {
    const doc = makeDoc('<h3>Grants.gov Application Submission</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "SAM.gov"', () => {
    const doc = makeDoc('<h3>SAM.gov Registration Requirements</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "USASpending.gov"', () => {
    const doc = makeDoc('<h3>USASpending.gov Reporting Requirements</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "PaymentManagement.gov"', () => {
    const doc = makeDoc('<h3>PaymentManagement.gov Cash Drawdown Procedures</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "GrantSolutions"', () => {
    const doc = makeDoc('<h3>GrantSolutions Portal Access Instructions</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not auto-fix an H2 containing "Grants.gov"', () => {
    // H2 auto-fix is also suppressed for federal system headings
    const doc = makeDoc('<h2>grants.gov submission instructions</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    expect(changes).toHaveLength(0);
  });
});

// ─── Mixed-case proper noun word handling (eRA, etc.) ────────────────────────

describe('HEAD-001: words starting with lowercase + uppercase are skipped', () => {
  it('does not trigger sentence-case auto-fix for an H2 where the only lowercase-starting word is "eRA"', () => {
    // "eRA" starts with lowercase and has uppercase, so it is treated as an
    // intentional mixed-case proper noun — not evidence of sentence case.
    const doc = makeDoc('<h2>Using eRA for reporting</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    // "for" is minor, "reporting" is lowercase content → sentence case IS detected
    // but "eRA" itself does not trigger or misfire the check.
    // The corrected title-case must preserve "eRA" unchanged.
    expect(changes).toHaveLength(1);
    const pairs = JSON.parse((changes[0] as AutoAppliedChange).value!) as { old: string; new: string }[];
    expect(pairs[0]!.new).toContain('eRA'); // eRA preserved as-is
    expect(pairs[0]!.new).toBe('Using eRA for Reporting');
  });

  it('does not capitalize "eRA" when auto-fixing an H2 to title case', () => {
    // "eRA" is NOT "eRA Commons" — this heading is not exempt from the general cap check.
    // "via" is minor, "eRA" is mixed-case (skipped), "and" is minor, "grants" and "portal"
    // are lowercase content words → sentence case detected → auto-fix triggered.
    // The fix must preserve "eRA" unchanged (not capitalize it to "ERA").
    const doc = makeDoc('<h2>submit via eRA and grants portal</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    expect(changes).toHaveLength(1);
    const pairs = JSON.parse((changes[0] as AutoAppliedChange).value!) as { old: string; new: string }[];
    expect(pairs[0]!.new).toBe('Submit via eRA and Grants Portal');
  });
});

// ─── Form identifier exemption ───────────────────────────────────────────────

describe('HEAD-001: form identifier headings are exempt from the general cap check', () => {
  it('does not flag an H3 with an SF-form identifier for title case', () => {
    // "SF-424 Application Overview" would normally be flagged as title case,
    // but the SF-424 form identifier makes this heading exempt.
    const doc = makeDoc('<h3>SF-424 Application Overview</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not auto-fix an H2 with a form identifier', () => {
    // "PHS 398 application instructions" would normally be auto-fixed to title case,
    // but the PHS 398 form identifier makes this heading exempt.
    const doc = makeDoc('<h2>PHS 398 application instructions</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    expect(changes).toHaveLength(0);
  });

  it('does not flag an H3 containing R&R for title case', () => {
    const doc = makeDoc('<h3>R&R Budget Detail</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('still flags "Form" capitalized in a form-identifier heading', () => {
    // The form identifier exempts from the general cap check, but the "Form"
    // check still applies: "Form" is capitalized in a non-first position.
    const doc = makeDoc('<h3>SF-424 Application Form</h3>');
    const results = HEAD_001.check(doc, OPTIONS);
    const formIssue = results.find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    ) as Issue | undefined;
    expect(formIssue).toBeDefined();
    // No general sentence-case suggestion — form identifier heading is exempt
    const titleCaseIssue = results.find(r => (r as Issue).title?.includes('sentence case'));
    expect(titleCaseIssue).toBeUndefined();
  });
});

// ─── Capitalized "Form" suggestion ───────────────────────────────────────────

describe('HEAD-001: capitalized "Form" suggestion', () => {
  it('flags "Form" capitalized mid-heading as a suggestion', () => {
    const doc = makeDoc('<h4>SF-424 Application Form instructions</h4>');
    const results = HEAD_001.check(doc, OPTIONS);
    const issue = results.find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('suggestion');
    expect(issue!.instructionOnly).toBe(true);
    expect(issue!.description).toContain('form\u201d should be lowercase');
  });

  it('does not flag lowercase "form" in a heading', () => {
    const doc = makeDoc('<h3>SF-424 application form</h3>');
    const issue = HEAD_001.check(doc, OPTIONS).find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    );
    expect(issue).toBeUndefined();
  });

  it('does not flag "Form" when it is the first word of the heading', () => {
    const doc = makeDoc('<h3>Form completion instructions</h3>');
    const issue = HEAD_001.check(doc, OPTIONS).find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    );
    expect(issue).toBeUndefined();
  });

  it('flags "Form" mid-heading even in a non-form-identifier heading', () => {
    // A heading without a form identifier that still capitalizes "Form"
    const doc = makeDoc('<h3>Application Form instructions</h3>');
    const issue = HEAD_001.check(doc, OPTIONS).find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('suggestion');
  });

  it('flags "Form" mid-heading in an H1', () => {
    // The "Form" check applies to H1–H6
    const doc = makeDoc('<h1>SF-424 Application Form</h1>');
    const issue = HEAD_001.check(doc, OPTIONS).find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    ) as Issue | undefined;
    expect(issue).toBeDefined();
  });
});

// ─── Only Word-styled headings are checked ────────────────────────────────────

describe('HEAD-001: only Word paragraph styles Heading 1–6 are checked', () => {
  // mammoth.js maps Word paragraphs to h1–h6 only when the paragraph carries
  // a "Heading N" paragraph style in the docx XML (w:pStyle w:val="Heading2"
  // etc.). Bold text, large fonts, or other visual formatting on a Normal-style
  // paragraph produce a <p> (or <p><strong>…</strong>) element, not an <hN>.
  // HEAD-001 queries only h2–h6, so none of those paragraphs are ever inspected.

  it('does not flag a bold body paragraph whose text is in title case', () => {
    // <strong> inside <p> = bold Normal paragraph in Word — not a heading.
    const doc = makeDoc('<p><strong>Program Description Information</strong></p>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a plain body paragraph whose text is in title case', () => {
    const doc = makeDoc('<p>Contact and Support Information</p>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H1 paragraph regardless of capitalization style', () => {
    // H1 is deliberately excluded — the rule only checks H2 (auto-fix) and
    // H3–H6 (suggestion). H1 capitalization is not enforced.
    const doc = makeDoc('<h1>program description information</h1>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a bold body paragraph whose text is in sentence case', () => {
    // Even sentence-case text in a <p><strong> block must not trigger the H2
    // auto-fix path — only true h2 elements are corrected.
    const doc = makeDoc('<p><strong>Program description information</strong></p>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});
