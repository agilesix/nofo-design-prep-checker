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

  it('does not auto-fix an H2 containing standalone "CDC" (CDC exception)', () => {
    // Headings with "CDC" as a standalone word are exempt from all cap checks.
    const results = HEAD_001.check(makeDoc('<h2>CDC funding overview</h2>'), OPTIONS);
    expect(results).toHaveLength(0);
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

  it('does not flag an H3 whose only non-first uppercase word is "PDF"', () => {
    // "PDF" has no lowercase letters → treated as an acronym, skipped entirely.
    // The only uppercase word after the first is "PDF" → no title-case evidence.
    const doc = makeDoc('<h3>How to submit PDF documents</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still flags an H3 with genuine title-case words when "PDF" is also present', () => {
    // "Submit" and "Documents" are genuine title-case words (they have lowercase
    // letters). "PDF" is an acronym and contributes no title-case evidence, but
    // the other capitalized words are still flagged.
    const doc = makeDoc('<h3>How to Submit PDF Documents</h3>');
    const results = HEAD_001.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.title).toBe('H3 heading may need sentence case');
    expect(issue.severity).toBe('suggestion');
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
  it('preserves "eRA" during H2 sentence-case auto-fix when another lowercase content word triggers the fix', () => {
    // "eRA" starts with lowercase and has uppercase, so it is treated as an
    // intentional mixed-case proper noun — not evidence of sentence case.
    // This heading is still auto-fixed because "reporting" is a lowercase
    // content word; the fix must preserve "eRA" unchanged.
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

// ─── CDC / CDC-funded exemption ──────────────────────────────────────────────

describe('HEAD-001: CDC and CDC-funded headings are exempt from the general cap check', () => {
  it('does not flag an H3 containing standalone "CDC" for title case', () => {
    // "CDC Requirements" would normally be flagged as title case, but the
    // standalone "CDC" word makes this heading exempt (case-sensitive match).
    const doc = makeDoc('<h3>CDC Requirements Overview</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not auto-fix an H2 containing standalone "CDC"', () => {
    const doc = makeDoc('<h2>CDC funding overview</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    expect(changes).toHaveLength(0);
  });

  it('does not flag an H3 containing "CDC-Funded" (mixed case) for title case', () => {
    const doc = makeDoc('<h3>CDC-Funded Programs And Activities</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "cdc-funded" (all lowercase) for title case', () => {
    // The CDC-funded match is case-insensitive, so lowercase "cdc-funded" is also exempt.
    const doc = makeDoc('<h3>cdc-funded Programs And Activities</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT exempt a heading containing lowercase "cdc" alone', () => {
    // The standalone-word match is case-sensitive: "cdc" does not match "CDC".
    // "Accessing cdc Resources" has title-case words → should still be flagged.
    const doc = makeDoc('<h3>Accessing cdc Resources Online</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(1);
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

  it('produces only the "Form" suggestion when both the "Form" rule and sentence case rule would fire for the same heading', () => {
    // "Other Attachments Form" has two apparent problems: "Attachments" is a
    // title-case mid-heading word AND "Form" is capitalised mid-heading. Both
    // checks would independently fire, but showing both is redundant — they
    // describe the same underlying issue. Only the "Form" suggestion should
    // be emitted; the general sentence-case suggestion should be suppressed.
    const doc = makeDoc('<h3>Other Attachments Form</h3>');
    const results = HEAD_001.check(doc, OPTIONS);
    const formIssue = results.find(
      r => (r as Issue).title === '\u201cForm\u201d may need to be lowercase in heading'
    );
    const sentenceCaseIssue = results.find(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(formIssue).toBeDefined();
    expect(sentenceCaseIssue).toBeUndefined();
    expect(results).toHaveLength(1);
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

// ─── Leading non-alphabetic tokens ───────────────────────────────────────────

describe('HEAD-001: leading non-alphabetic tokens are skipped when identifying the first word', () => {
  it('does not flag an H3 starting with a number followed by a capitalised first word', () => {
    // "501" is purely numeric — skipped. "Non-profit" is the first alphabetic
    // token and is treated as the sentence start, so its capitalisation is not
    // counted as title-case evidence.
    const doc = makeDoc('<h3>501 Non-profit organization requirements</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 starting with a number and parenthetical reference before the first word', () => {
    // "501" (numeric) and "(c)(3)" (parenthetical, begins with "(") are both
    // skipped. "Non-profit" at position 2 is the first token starting with a
    // letter and is treated as the sentence start.
    const doc = makeDoc('<h3>501 (c)(3) Non-profit organizations</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H3 starting with a parenthetical token before the first word', () => {
    // "(a)" begins with "(" — not a letter — so "Application" at position 1 is
    // treated as the first word and its capitalisation is not a title-case flag.
    const doc = makeDoc('<h3>(a) Application requirements overview</h3>');
    expect(HEAD_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Native American / Indigenous proper noun exemption ──────────────────────

describe('HEAD-001: Native American and Indigenous proper noun terms are exempt from the title-case check', () => {
  it('does not flag an H3 containing "Tribal Organizations"', () => {
    // "Tribal" is a federal proper noun — the heading is exempt from the
    // title-case suggestion even though "Tribal" and "Organizations" are
    // capitalised mid-heading.
    const doc = makeDoc('<h3>Support for Tribal Organizations</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Urban Indian Organizations"', () => {
    // "Indian" is a federal proper noun — heading is exempt from the
    // title-case suggestion.
    const doc = makeDoc('<h3>Urban Indian Organizations health programs</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 where "AI/AN" is the only non-sentence-start token', () => {
    // "AI/AN" contains no lowercase letters — already treated as an acronym by
    // isSkippable. "populations" is lowercase. Neither word is title-case evidence.
    const doc = makeDoc('<h3>Eligibility for AI/AN populations</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('still flags an H3 that has title-cased words unrelated to Indigenous terms', () => {
    // "Tribal" is exempt as a proper noun, but "Review" and "Criteria" are
    // ordinary title-cased words and must still be flagged.
    const doc = makeDoc('<h3>Tribal Review Criteria</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(1);
  });

  it('does not flag an H3 where a recognised Indigenous term appears in possessive form', () => {
    // "Tribe's" is a possessive of the proper noun "Tribe". bare() strips the
    // possessive suffix so it resolves to "Tribe" before comparison, and the
    // position is marked exempt. Without this normalization "Tribe's" would be
    // seen as a mid-heading capitalised word and trigger a false positive.
    // The Unicode right-apostrophe variant (Tribe\u2019s) is also covered by
    // the same strip.
    const doc = makeDoc("<h3>Eligibility for Tribe's members</h3>");
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('still auto-fixes an H2 that contains an indigenous term but has other lowercase content words', () => {
    // The indigenous-term exemption only suppresses H3–H6 suggestions.
    // H2 headings with sentence-case content words are still auto-fixed.
    const doc = makeDoc('<h2>Tribal health programs and services</h2>');
    const changes = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as AutoAppliedChange).targetField === 'heading.h2.titlecase'
    );
    expect(changes).toHaveLength(1);
  });
});

// ─── Labeled component reference exemption ───────────────────────────────────

describe('HEAD-001: labeled component references are exempt from the title-case check', () => {
  it('does not flag an H3 where the only mid-heading uppercase word is a component label followed by a single letter', () => {
    // "Component" is exempt because it is immediately followed by the single-
    // letter label "A". "for" is a minor word. No flaggable words remain.
    const doc = makeDoc('<h3>Requirements for Component A</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Appendix B"', () => {
    const doc = makeDoc('<h3>Instructions for Appendix B</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing multiple labeled references (Table A and Table B)', () => {
    const doc = makeDoc('<h3>Data from Table A and Table B</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Figure 1" (digit identifier)', () => {
    const doc = makeDoc('<h3>Results shown in Figure 1</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Part A"', () => {
    const doc = makeDoc('<h3>Eligibility criteria for Part A</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Phase II" (new label word + Roman numeral)', () => {
    const doc = makeDoc('<h3>Requirements for Phase II</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Objective III" (new label word + multi-char Roman numeral)', () => {
    const doc = makeDoc('<h3>Funding for Objective III</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Figure 10" (multi-digit Arabic number)', () => {
    const doc = makeDoc('<h3>Results shown in Figure 10</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 containing "Components A" (plural label word)', () => {
    const doc = makeDoc('<h3>Criteria for Components A and B</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 "Appendix A: Eligibility requirements"', () => {
    // "Appendix" is the sentence start; "A:" triggers a colon restart so
    // "Eligibility" is treated as a sentence start; "requirements" is lowercase.
    const doc = makeDoc('<h3>Appendix A: Eligibility requirements</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('still flags an H3 where the label word is not followed by a single letter or digit', () => {
    // "Component" here is not a labeled reference — it has no single-letter
    // identifier after it. It is a genuine title-case word and should be flagged.
    const doc = makeDoc('<h3>Review of Component requirements</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(1);
  });

  it('still flags title-case words that appear after an exempt label reference', () => {
    // "Component A" is exempt, but "Overview" is a genuine title-case word.
    const doc = makeDoc('<h3>Component A Overview</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(1);
  });
});

// ─── Proper noun + parenthetical acronym exemption ───────────────────────────

describe('HEAD-001: proper noun phrases followed by a parenthetical acronym are exempt from the title-case check', () => {
  it('does not flag an H3 where a multi-word proper noun is followed by its acronym in parentheses', () => {
    // "National Mesothelioma Virtual Bank" is a proper noun. The words are
    // capitalized mid-heading, but the trailing "(NMVB)" identifies the entire
    // preceding phrase as an organization name that should not be flagged.
    // "overview", "of", and "the" are lowercase/minor — not affected.
    const doc = makeDoc('<h3>An overview of the National Mesothelioma Virtual Bank (NMVB)</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag an H3 where a proper noun with embedded minor words is followed by its acronym', () => {
    // "Office of Global Affairs" — "of" is a minor word embedded in the name.
    // The backward scan continues past it to exempt "Office" and "Global
    // Affairs". "programs" is lowercase and not part of the phrase.
    const doc = makeDoc('<h3>Office of Global Affairs (OGA) programs</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(0);
  });

  it('still flags title-case words that appear after the acronym and are unrelated to the proper noun', () => {
    // "National Advisory Board" is exempt (precedes "(NAB)"), but "Review" and
    // "Criteria" follow the acronym and are ordinary title-cased words.
    const doc = makeDoc('<h3>National Advisory Board (NAB) Review Criteria</h3>');
    const issues = HEAD_001.check(doc, OPTIONS).filter(
      r => (r as Issue).title?.includes('sentence case')
    );
    expect(issues).toHaveLength(1);
  });
});
