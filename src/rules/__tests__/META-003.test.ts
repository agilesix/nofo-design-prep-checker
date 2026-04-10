import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import META_003 from '../universal/META-003';
import type { ParsedDocument, Issue } from '../../types';

const OPTIONS = { contentGuideId: null } as const;

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
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

// ─── Does not flag when value is filled in ────────────────────────────────────

describe('META-003: does not flag when the body paragraph has a real value', () => {
  it('does not flag "Metadata keywords:" with a real value', () => {
    const doc = makeDoc(
      '<p>Metadata keywords: health, CDC, grants, community, prevention, chronic disease, funding</p>'
    );
    expect(META_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag "Keywords:" (short variant) with a real value', () => {
    const doc = makeDoc(
      '<p>Keywords: maternal health, child welfare, ACF, funding, programs</p>'
    );
    expect(META_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when the field is case-varied and value is real', () => {
    const doc = makeDoc(
      '<p>METADATA KEYWORDS: public health, CDC, opioid, prevention, grants</p>'
    );
    expect(META_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Flags when value is a placeholder ───────────────────────────────────────

describe('META-003: flags when the body paragraph has a placeholder value', () => {
  it('flags "Metadata keywords:" with "Leave blank. Coach will insert."', () => {
    const doc = makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>');
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.ruleId).toBe('META-003');
    expect(issue.severity).toBe('warning');
  });

  it('flags "Metadata keywords:" with an empty value', () => {
    const doc = makeDoc('<p>Metadata keywords: </p>');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Metadata keywords:" with a bracket placeholder', () => {
    const doc = makeDoc('<p>Metadata keywords: [Keywords]</p>');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Keywords:" (short variant) with a placeholder', () => {
    const doc = makeDoc('<p>Keywords: Leave blank. Coach will insert.</p>');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags when value is "Leave as is"', () => {
    const doc = makeDoc('<p>Metadata keywords: Leave as is</p>');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── No matching paragraph → no issue ────────────────────────────────────────

describe('META-003: does not flag when no matching paragraph is found', () => {
  it('produces no issue when the document has no keywords paragraph', () => {
    const doc = makeDoc('<p>Some unrelated content</p>');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no issue for an empty document', () => {
    const doc = makeDoc('');
    expect(META_003.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── inputRequired is populated correctly ─────────────────────────────────────

describe('META-003: issue shape', () => {
  it('includes inputRequired.targetField = "metadata.keywords"', () => {
    const doc = makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>');
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('metadata.keywords');
  });
});

// ─── Keyword prefill formatting ───────────────────────────────────────────────

describe('META-003: prefill value never contains double commas or trailing commas', () => {
  it('produces no double commas when a keyword candidate has a trailing comma', () => {
    // Simulate an opportunity name line whose raw capture ends with a comma,
    // which is the real-world source of "keyword,, next keyword" output.
    const doc = makeDoc(
      '<p>Metadata keywords: Leave blank. Coach will insert.</p>\n' +
      'Opportunity name: Making America safer,\n' +
      'Tagline: Funding strategy,'
    );
    // rawText is derived from the html in makeDoc, but we need rawText to
    // contain the opportunity name / tagline lines for the prefill generator.
    // Override the doc with explicit rawText.
    const docWithRaw: typeof doc = {
      ...doc,
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Opportunity name: Making America safer,\n' +
        'Tagline: Funding strategy,',
    };

    const issues = META_003.check(docWithRaw, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    const prefill = issue.inputRequired?.prefill ?? '';

    // Must not contain consecutive commas
    expect(prefill).not.toMatch(/,,/);
    // Must not end with a comma (with or without trailing whitespace)
    expect(prefill).not.toMatch(/,\s*$/);
    // Each comma-separated segment must be non-empty
    if (prefill) {
      for (const segment of prefill.split(',')) {
        expect(segment.trim()).not.toBe('');
      }
    }
  });

  it('produces no trailing comma when the last keyword candidate has a trailing comma', () => {
    const docWithRaw = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Opportunity name: Rural health initiative,',
    };

    const issues = META_003.check(docWithRaw, OPTIONS);
    const prefill = (issues[0] as Issue | undefined)?.inputRequired?.prefill ?? '';
    expect(prefill).not.toMatch(/,\s*$/);
    expect(prefill).not.toMatch(/,,/);
  });
});
