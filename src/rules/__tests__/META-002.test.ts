import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import META_002 from '../universal/META-002';
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

describe('META-002: does not flag when the body paragraph has a real value', () => {
  it('does not flag "Metadata subject:" with a real value', () => {
    const doc = makeDoc(
      '<p>Metadata subject: A notice of funding opportunity from the CDC for community health.</p>'
    );
    expect(META_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag "Subject:" (short variant) with a real value', () => {
    const doc = makeDoc(
      '<p>Subject: A notice of funding opportunity from the ACF for child welfare programs.</p>'
    );
    expect(META_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when the field is case-varied and value is real', () => {
    const doc = makeDoc(
      '<p>METADATA SUBJECT: A notice of funding opportunity from HRSA.</p>'
    );
    expect(META_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Flags when value is a placeholder ───────────────────────────────────────

describe('META-002: flags when the body paragraph has a placeholder value', () => {
  it('flags "Metadata subject:" with "Leave blank. Coach will insert."', () => {
    const doc = makeDoc('<p>Metadata subject: Leave blank. Coach will insert.</p>');
    const issues = META_002.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.ruleId).toBe('META-002');
    expect(issue.severity).toBe('warning');
  });

  it('flags "Metadata subject:" with an empty value', () => {
    const doc = makeDoc('<p>Metadata subject: </p>');
    expect(META_002.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Metadata subject:" with a bracket placeholder', () => {
    const doc = makeDoc('<p>Metadata subject: [Subject]</p>');
    expect(META_002.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Subject:" (short variant) with a placeholder', () => {
    const doc = makeDoc('<p>Subject: Leave blank. Coach will insert.</p>');
    expect(META_002.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── No matching paragraph → no issue ────────────────────────────────────────

describe('META-002: does not flag when no matching paragraph is found', () => {
  it('produces no issue when the document has no subject paragraph', () => {
    const doc = makeDoc('<p>Some unrelated content</p>');
    expect(META_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no issue for an empty document', () => {
    const doc = makeDoc('');
    expect(META_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── inputRequired is populated correctly ─────────────────────────────────────

describe('META-002: issue shape', () => {
  it('includes inputRequired.targetField = "metadata.subject"', () => {
    const doc = makeDoc('<p>Metadata subject: Leave blank. Coach will insert.</p>');
    const issues = META_002.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('metadata.subject');
  });
});
