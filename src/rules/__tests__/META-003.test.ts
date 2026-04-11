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
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill).not.toMatch(/,\s*$/);
    expect(prefill).not.toMatch(/,,/);
  });
});

// ─── Agency term extraction ───────────────────────────────────────────────────

describe('META-003: extracts agency/subagency terms from metadata field lines', () => {
  it('includes an Agency: field value in the prefill', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Agency: National Cancer Institute',
    };
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill).toContain('National Cancer Institute');
  });

  it('includes a Subagency: field value in the prefill', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Subagency: Division of Nutrition',
    };
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill).toContain('Division of Nutrition');
  });

  it('shortens agency values longer than 3 words to 3 content words', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Subagency: Office of Population Affairs Administration',
    };
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    // Value is > 3 words so it gets shortened; exact result depends on stop-word filtering
    // but the prefill should be non-empty and not contain all 4 words
    expect(prefill.length).toBeGreaterThan(0);
    expect(prefill).not.toContain('Office of Population Affairs Administration');
  });
});

// ─── Program section n-gram extraction ───────────────────────────────────────

describe('META-003: extracts repeated subject-matter terms from program description sections', () => {
  it('includes a phrase that appears at least twice in a Program description section', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html: '',
          rawText:
            'Opioid use disorder affects many communities. ' +
            'Treatment for opioid use disorder includes medication-assisted approaches. ' +
            'Opioid use disorder is a chronic condition requiring long-term care.',
          startPage: 2,
        },
      ],
      rawText: 'Metadata keywords: Leave blank. Coach will insert.',
      zipArchive: new JSZip(),
      documentXml: '',
      footnotesXml: '',
      endnotesXml: '',
      activeContentGuide: null,
    };

    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    // "opioid use disorder" appears 3 times and should be title-cased in the suggestion
    expect(prefill.toLowerCase()).toContain('opioid use disorder');
  });

  it('does not include a phrase that appears only once', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html: '',
          rawText: 'This program supports rural communities. The focus is on preventive care.',
          startPage: 2,
        },
      ],
      rawText: 'Metadata keywords: Leave blank. Coach will insert.',
      zipArchive: new JSZip(),
      documentXml: '',
      footnotesXml: '',
      endnotesXml: '',
      activeContentGuide: null,
    };

    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    // "rural communities" appears only once — should not be in prefill
    expect(prefill.toLowerCase()).not.toContain('rural communities');
  });

  it('does not extract terms from sections that are not program description/summary', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-eligibility',
          heading: 'Eligibility',
          headingLevel: 2,
          html: '',
          rawText:
            'Eligible applicants must be eligible applicants meeting eligible applicants criteria.',
          startPage: 2,
        },
      ],
      rawText: 'Metadata keywords: Leave blank. Coach will insert.',
      zipArchive: new JSZip(),
      documentXml: '',
      footnotesXml: '',
      endnotesXml: '',
      activeContentGuide: null,
    };

    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    // "eligible applicants" is a repeated phrase but the section is not a program description
    expect(prefill.toLowerCase()).not.toContain('eligible applicants');
  });
});

// ─── Structural heading exclusion ────────────────────────────────────────────

describe('META-003: never suggests structural NOFO headings as keywords', () => {
  it('does not suggest "Funding strategy," (with trailing comma) from a tagline', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Tagline: Funding strategy,',
    };
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('funding strategy');
  });

  it('does not suggest "Funding strategy" even when present in program section text', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html: '',
          rawText:
            'The funding strategy supports key goals. Our funding strategy is evidence-based.',
          startPage: 2,
        },
      ],
      rawText: 'Metadata keywords: Leave blank. Coach will insert.',
      zipArchive: new JSZip(),
      documentXml: '',
      footnotesXml: '',
      endnotesXml: '',
      activeContentGuide: null,
    };

    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('funding strategy');
  });
});

// ─── Updated UI strings ───────────────────────────────────────────────────────

describe('META-003: issue shape reflects updated 6-keyword guidance', () => {
  it('termCountRange starts with 6', () => {
    const doc = makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>');
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.inputRequired?.termCountRange).toMatch(/^6/);
  });

  it('minTermCount is 6', () => {
    const doc = makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>');
    const issues = META_003.check(doc, OPTIONS);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Issue;
    expect(issue.inputRequired?.minTermCount).toBe(6);
  });
});
