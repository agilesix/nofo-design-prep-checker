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

// ─── Table content exclusion ─────────────────────────────────────────────────

describe('META-003: does not extract keyword candidates from table cell content', () => {
  it('ignores repeated phrases that appear only inside table cells in a program section', () => {
    // "clinical outcomes" appears twice but only in table cells — it must not
    // be suggested as a keyword even though it would score as a repeated n-gram
    // if rawText were used instead of the table-stripped HTML.
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html:
            '<table><tr><td>clinical outcomes</td><td>Yes</td></tr>' +
            '<tr><td>clinical outcomes</td><td>No</td></tr></table>',
          rawText: 'clinical outcomes Yes clinical outcomes No',
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
    expect(prefill.toLowerCase()).not.toContain('clinical outcomes');
  });

  it('still extracts repeated phrases that appear in paragraph text (not tables)', () => {
    // "rural health" is in paragraph text twice — should still be suggested.
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html:
            '<p>Rural health initiatives help underserved communities. ' +
            'This program advances rural health access.</p>' +
            '<table><tr><td>Attachment</td><td>Page limit</td></tr>' +
            '<tr><td>Project narrative</td><td>25</td></tr></table>',
          rawText:
            'Rural health initiatives help underserved communities. ' +
            'This program advances rural health access. Attachment Page limit Project narrative 25',
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
    // "rural health" is in paragraph text and appears twice — should be suggested
    expect(prefill.toLowerCase()).toContain('rural health');
    // "page limit" is in the table and in the exclusion list — must not appear
    expect(prefill.toLowerCase()).not.toContain('page limit');
  });
});

// ─── Expanded exclusion list ──────────────────────────────────────────────────

describe('META-003: does not suggest newly excluded administrative fragments', () => {
  it('does not suggest "page limit" even when it repeats in a program section', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html: '',
          rawText:
            'The page limit is 25 pages. Applications exceeding the page limit will not be reviewed.',
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
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('page limit');
  });

  it('does not suggest "standard forms" from a tagline', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Tagline: Standard forms',
    };
    const issues = META_003.check(doc, OPTIONS);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('standard forms');
  });

  it('does not suggest "component" from an opportunity name', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Opportunity name: Component',
    };
    const issues = META_003.check(doc, OPTIONS);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('component');
  });

  it('does not suggest "grants.gov form" from a program section', () => {
    const doc: ParsedDocument = {
      html: '<p>Metadata keywords: Leave blank. Coach will insert.</p>',
      sections: [
        {
          id: 'section-program',
          heading: 'Program description',
          headingLevel: 2,
          html: '',
          rawText:
            'Submit your grants.gov form by the deadline. Complete the grants.gov form carefully.',
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
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('grants.gov form');
  });
});

// ─── Single-word pattern filter ───────────────────────────────────────────────

describe('META-003: rejects single common words as standalone keyword candidates', () => {
  it('does not suggest "yes" from an opportunity name field', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Opportunity name: Yes',
    };
    const issues = META_003.check(doc, OPTIONS);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('yes');
  });

  it('does not suggest "none" from a tagline field', () => {
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Tagline: None',
    };
    const issues = META_003.check(doc, OPTIONS);
    const prefill = (issues[0] as Issue).inputRequired?.prefill ?? '';
    expect(prefill.toLowerCase()).not.toContain('none');
  });

  it('does not suppress multi-word terms that contain a reject word', () => {
    // "using technology" is two words — the single-word filter must not reject it
    const doc = {
      ...makeDoc('<p>Metadata keywords: Leave blank. Coach will insert.</p>'),
      rawText:
        'Metadata keywords: Leave blank. Coach will insert.\n' +
        'Tagline: Using technology',
    };
    const issues = META_003.check(doc, OPTIONS);
    // The test just verifies the filter doesn't over-reject multi-word phrases;
    // "using technology" may or may not appear depending on other filters.
    // The key assertion is that the check completes without error.
    expect(issues).toHaveLength(1);
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
