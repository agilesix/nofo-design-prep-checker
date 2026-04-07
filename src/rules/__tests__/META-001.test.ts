import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import META_001 from '../universal/META-001';
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

describe('META-001: does not flag when the body paragraph has a real value', () => {
  it('does not flag "Metadata author:" with a real value', () => {
    const doc = makeDoc(
      '<p>Metadata author: Centers for Disease Control and Prevention (CDC)</p>'
    );
    expect(META_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag "Author:" (short variant) with a real value', () => {
    const doc = makeDoc('<p>Author: Administration for Children and Families (ACF)</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when the field is case-varied and value is real', () => {
    const doc = makeDoc('<p>METADATA AUTHOR: Health Resources and Services Administration (HRSA)</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Flags when value is a placeholder ───────────────────────────────────────

describe('META-001: flags when the body paragraph has a placeholder value', () => {
  it('flags "Metadata author:" with "Leave blank. Coach will insert."', () => {
    const doc = makeDoc('<p>Metadata author: Leave blank. Coach will insert.</p>');
    const issues = META_001.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.ruleId).toBe('META-001');
    expect(issue.severity).toBe('warning');
  });

  it('flags "Metadata author:" with an empty value', () => {
    const doc = makeDoc('<p>Metadata author: </p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Metadata author:" with a bracket placeholder "[Author Name]"', () => {
    const doc = makeDoc('<p>Metadata author: [Author Name]</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags "Author:" (short variant) with a placeholder', () => {
    const doc = makeDoc('<p>Author: Leave blank. Coach will insert.</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags when value is "Leave as is"', () => {
    const doc = makeDoc('<p>Metadata author: Leave as is</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── No matching paragraph → no issue ────────────────────────────────────────

describe('META-001: does not flag when no matching paragraph is found', () => {
  it('produces no issue when the document has no author paragraph', () => {
    const doc = makeDoc('<p>Some unrelated content</p>');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no issue for an empty document', () => {
    const doc = makeDoc('');
    expect(META_001.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── inputRequired is populated correctly ─────────────────────────────────────

describe('META-001: issue shape', () => {
  it('includes inputRequired.targetField = "metadata.author"', () => {
    const doc = makeDoc('<p>Metadata author: Leave blank. Coach will insert.</p>');
    const issues = META_001.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.inputRequired?.targetField).toBe('metadata.author');
  });
});
