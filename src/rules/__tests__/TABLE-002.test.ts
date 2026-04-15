import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import TABLE_002 from '../universal/TABLE-002';
import type { ParsedDocument, Issue } from '../../types';

/**
 * Build a minimal ParsedDocument from an HTML string.
 *
 * @param html            The document HTML.
 * @param sectionHeading  The heading of the single section (default: "Document start").
 *                        Pass an exempt heading (e.g. "Application checklist") to test
 *                        the section-heading exemption signal in TABLE-002.
 */
function makeDoc(html: string, sectionHeading = 'Document start'): ParsedDocument {
  return {
    html,
    sections: [
      {
        id: 'section-preamble',
        heading: sectionHeading,
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

const OPTIONS = { contentGuideId: null } as const;

// A simple two-column, two-row table — uncaptioned and not exempt by content.
const SIMPLE_TABLE =
  '<table><tbody>' +
  '<tr><td>A</td><td>B</td></tr>' +
  '<tr><td>C</td><td>D</td></tr>' +
  '</tbody></table>';

// ─── Basic detection ──────────────────────────────────────────────────────────

describe('TABLE-002 basic detection', () => {
  it('flags an uncaptioned table with no nearby heading', () => {
    const doc = makeDoc(SIMPLE_TABLE);
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).title).toBe('Table is missing a caption');
    expect((results[0] as Issue).severity).toBe('warning');
    expect((results[0] as Issue).instructionOnly).toBe(true);
  });

  it('does not flag a table that has a non-empty caption element', () => {
    const doc = makeDoc(
      '<table>' +
        '<caption>Table: Project timeline</caption>' +
        '<tbody><tr><td>A</td><td>B</td></tr></tbody>' +
      '</table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table preceded by a normal-text "Table:" paragraph', () => {
    const doc = makeDoc('<p>Table: Project timeline</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table preceded by a bold "Table:" paragraph', () => {
    // Bold formatting is applied at the character level inside the <p> via <strong>.
    const doc = makeDoc('<p><strong>Table: Project timeline</strong></p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table preceded by a bold caption that does not start with "Table:"', () => {
    // Any non-empty paragraph (normal or bold) is a valid caption — "Table:" prefix
    // is not required. Uses sentence case so no sentence-case suggestion is emitted.
    const doc = makeDoc('<p><strong>Program timeline overview</strong></p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table preceded by a plain text caption that does not start with "Table:"', () => {
    // A plain non-empty paragraph immediately above the table is accepted as a caption.
    const doc = makeDoc('<p>Program timeline overview</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table preceded by any non-empty paragraph (any text is a valid caption)', () => {
    // Per the relaxed style guide: any non-empty paragraph directly above the table
    // is accepted as a valid caption regardless of content.
    const doc = makeDoc('<p>See the data below.</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags a table whose caption element is present but empty', () => {
    const doc = makeDoc(
      '<table><caption></caption><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('flags multiple uncaptioned tables independently', () => {
    const doc = makeDoc(SIMPLE_TABLE + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(2);
  });
});

// ─── Nearby heading caption substitute ───────────────────────────────────────

describe('TABLE-002 nearby heading caption substitute', () => {
  it('does not flag when a heading is directly above the table (no intervening text)', () => {
    const doc = makeDoc('<h2>Key dates</h2>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag with heading + short intro sentence above the table', () => {
    // The common NOFO pattern: heading → one-sentence intro → table.
    // Intro is well under 50 words so the heading qualifies as a caption substitute.
    const doc = makeDoc(
      '<h2>Eligible applicants</h2>' +
      '<p>The following table summarizes the eligibility requirements.</p>' +
      SIMPLE_TABLE
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag with heading + two short paragraphs (combined ≤ 50 words) above the table', () => {
    const doc = makeDoc(
      '<h2>Application requirements</h2>' +
      '<p>See the requirements below.</p>' +
      '<p>Reviewers will evaluate each criterion.</p>' +
      SIMPLE_TABLE
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when a long paragraph serves as the caption (paragraph directly above table)', () => {
    // A 51-word paragraph directly above the table is accepted as a valid caption —
    // the new rule accepts any non-empty paragraph as a caption. The heading
    // too-far-away logic only applies when there is no paragraph caption.
    const longParagraph = '<p>' + Array(51).fill('word').join(' ') + '</p>';
    const doc = makeDoc('<h2>Key dates</h2>' + longParagraph + SIMPLE_TABLE);
    // The long paragraph IS the caption → no missing-caption warning.
    // (It may emit a sentence-case suggestion since "word" repeated is lowercase — no suggestion here.)
    const results = TABLE_002.check(doc, OPTIONS);
    const warning = results.find(r => (r as Issue).severity === 'warning');
    expect(warning).toBeUndefined();
  });

  it('flags when the heading is more than 50 words away and no paragraph caption is present', () => {
    // 51-word paragraph + non-paragraph element before the table so the table has
    // no paragraph caption. The heading is > 50 words away → flagged.
    const longParagraph = '<p>' + Array(51).fill('word').join(' ') + '</p>';
    const doc = makeDoc(
      '<h2>Key dates</h2>' +
      longParagraph +
      '<ol><li>Important note.</li></ol>' +
      SIMPLE_TABLE
    );
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).title).toBe('Table is missing a caption');
  });

  it('does not flag when a heading is more than 3 elements above the table but within 50 words', () => {
    // Heading + 3 short paragraphs — total intervening text is well under 50 words.
    // The element count between heading and table does not limit detection; only the
    // word count matters. This was the root cause of a bug where the old code scanned
    // only 3 siblings and missed the heading if more elements were present.
    const doc = makeDoc(
      '<h2>Key dates</h2>' +
      '<p>Para one.</p>' +
      '<p>Para two.</p>' +
      '<p>Para three.</p>' +
      SIMPLE_TABLE
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when a heading is followed by approximately 30 words of body text before the table', () => {
    // Realistic NOFO pattern: section heading → one substantive paragraph → data table.
    // The paragraph is ~30 words, well within the 50-word threshold.
    const thirtyWordParagraph =
      '<p>The following table summarizes the eligible applicant types and the ' +
      'corresponding funding limits that apply to each category of organization.</p>';
    const doc = makeDoc('<h2>Eligible applicants</h2>' + thirtyWordParagraph + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('detects a heading exactly at the MAX_HEADING_SCAN_SIBLINGS boundary (20th preceding element)', () => {
    // MAX_HEADING_SCAN_SIBLINGS = 20. The loop scans up to 20 elements back from
    // the table. A heading that is the 20th element (with 19 empty paragraphs
    // between it and the table) must still be found and suppress the warning.
    // Empty paragraphs accumulate 0 words so the word-count exit does not fire.
    const emptyParas = '<p></p>'.repeat(19); // 19 elements between heading and table
    const doc = makeDoc('<h2>Section title</h2>' + emptyParas + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not detect a heading beyond the MAX_HEADING_SCAN_SIBLINGS cap (21st preceding element)', () => {
    // A heading at the 21st position exceeds the 20-element scan cap and is not
    // found, so the table is correctly flagged as uncaptioned. This test pins the
    // cap so that accidental regressions to unbounded scanning are caught.
    const emptyParas = '<p></p>'.repeat(20); // 20 elements between heading and table
    const doc = makeDoc('<h2>Section title</h2>' + emptyParas + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('works with any heading level (h1–h6)', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const doc = makeDoc(`<h${level}>Section title</h${level}>` + SIMPLE_TABLE);
      expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
    }
  });
});

// ─── Callout box (single-cell) exemption ─────────────────────────────────────

describe('TABLE-002 single-cell table (callout box) exemption', () => {
  it('does not flag a single-cell table (callout box)', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td>Single cell content</td></tr></tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a single-cell table whose cell contains a heading and multiple paragraphs', () => {
    // Exemption is purely structural: exactly one <td> in the table, regardless
    // of what that cell contains. A callout box with an internal heading and
    // several body paragraphs must not be flagged for a missing caption.
    const doc = makeDoc(
      '<table><tbody><tr><td>' +
        '<h2>Callout box heading</h2>' +
        '<p>First paragraph of callout content.</p>' +
        '<p>Second paragraph of callout content.</p>' +
        '<p>Third paragraph of callout content.</p>' +
      '</td></tr></tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Standard table-type exemptions ──────────────────────────────────────────

describe('TABLE-002 standard table-type exemptions', () => {
  // ── Key facts / key dates ────────────────────────────────────────────────────

  it('does not flag a key facts table (first-cell signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Key facts</th><th>Details</th></tr>' +
        '<tr><td>Agency</td><td>HHS</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a key dates table (first-cell signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Key dates</th><th>Date</th></tr>' +
        '<tr><td>Application deadline</td><td>2026-06-01</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  // ── Application contents ─────────────────────────────────────────────────────

  it('does not flag a table in an "Application contents" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Application contents');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table when the nearest DOM heading is "Application contents" (H2)', () => {
    // A long list (> 50 words) separates the heading from the table so that
    // hasNearbyHeadingCaption does not fire; only the exemption signal can suppress it.
    const longList =
      '<ul>' + Array(10).fill('<li>This is a longer list item with several words here.</li>').join('') + '</ul>';
    const doc = makeDoc(
      '<h2>Application contents</h2>' + longList + SIMPLE_TABLE,
      'Award information'  // non-exempt section heading
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  // ── Standard forms ───────────────────────────────────────────────────────────

  it('does not flag a table in a "Standard forms" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Standard forms');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table in a "Required forms" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Required forms');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an SF-424 standard form table (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td>SF-424 Application for Federal Assistance</td><td></td></tr>' +
        '<tr><td>Field A</td><td>Field B</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  // ── Application checklist ────────────────────────────────────────────────────

  it('does not flag a table in an "Application checklist" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Application checklist');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table whose first row contains "Application checklist" (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Application checklist</th><th>Status</th></tr>' +
        '<tr><td>Project narrative</td><td>Required</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an application checklist identified by ◻ checkbox glyphs (structural signal)', () => {
    // No explicit heading or first-row text — exemption fires purely because
    // at least two rows have a ◻ glyph (U+25FB) in the first column.
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td>◻ Project narrative</td><td>Required</td></tr>' +
        '<tr><td>◻ Budget justification</td><td>Required</td></tr>' +
        '<tr><td>◻ Letters of support</td><td>Optional</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an application checklist identified by ☐ ballot-box glyphs (structural signal)', () => {
    // ☐ (U+2610) is an acceptable checkbox substitute recognised by the rule.
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td>☐ Project narrative</td><td>Required</td></tr>' +
        '<tr><td>☐ Budget justification</td><td>Required</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not exempt a table with only one checkbox-glyph row (minimum is two)', () => {
    // A single checkbox row is not enough to identify a checklist — could just
    // be incidental formatting. The table should still be flagged.
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td>◻ Project narrative</td><td>Required</td></tr>' +
        '<tr><td>Regular row</td><td>Value</td></tr>' +
      '</tbody></table>'
    );
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).title).toBe('Table is missing a caption');
  });

  // ── Merit review criteria ────────────────────────────────────────────────────

  it('does not flag a merit review criteria table (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Merit review criteria</th><th>Maximum points</th></tr>' +
        '<tr><td>Criterion A</td><td>30</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table in a "Merit review" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Merit review');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a merit review table when the heading includes a point total in parentheses', () => {
    // "Merit review criteria (50 points)" — the parenthetical must not prevent
    // the pattern /merit\s+review/ from matching the heading.
    const doc = makeDoc(SIMPLE_TABLE, 'Merit review criteria (50 points)');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a total-points merit review table (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Total points</th><th>100</th></tr>' +
        '<tr><td>Criterion A</td><td>40</td></tr>' +
        '<tr><td>Criterion B</td><td>60</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an individual merit review table (maximum points first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Criterion</th><th>Maximum points</th></tr>' +
        '<tr><td>Approach</td><td>30</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  // ── Reporting ────────────────────────────────────────────────────────────────

  it('does not flag a table in a "Reporting" section (section heading signal)', () => {
    // A section heading that is simply "Reporting" must trigger the exemption.
    const doc = makeDoc(SIMPLE_TABLE, 'Reporting');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table in a "Reporting requirements" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Reporting requirements');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table in a "Post-award reporting" section (section heading signal)', () => {
    const doc = makeDoc(SIMPLE_TABLE, 'Post-award reporting');
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a reporting table identified by "Report type" in the first row (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Report type</th><th>Frequency</th></tr>' +
        '<tr><td>Progress report</td><td>Semi-annual</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  // ── Nearest-heading signal covers H5/H6 ─────────────────────────────────────

  it('does not flag a table when the nearest exempt heading is H5', () => {
    // buildLocationLookup only tracks H1–H4 for display context. The exemption
    // signal uses a local H1–H6 sibling scan. This test confirms H5 headings are
    // recognised. A long list (> 50 words) prevents hasNearbyHeadingCaption from
    // firing, so only the exemption signal can suppress the warning.
    const longList =
      '<ul>' + Array(10).fill('<li>This is a longer list item with several words here.</li>').join('') + '</ul>';
    const doc = makeDoc(
      '<h5>Application checklist</h5>' + longList + SIMPLE_TABLE,
      'Award information'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table when the nearest exempt heading is H6', () => {
    // Same as above but with H6 — also outside buildLocationLookup's H1–H4 range.
    const longList =
      '<ul>' + Array(10).fill('<li>This is a longer list item with several words here.</li>').join('') + '</ul>';
    const doc = makeDoc(
      '<h6>Merit review criteria (50 points)</h6>' + longList + SIMPLE_TABLE,
      'Award information'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Sentence case suggestion ─────────────────────────────────────────────────

describe('TABLE-002 sentence case suggestion', () => {
  it('surfaces a sentence-case suggestion when the <caption> element text is all-caps', () => {
    // Caption is detected — no missing-caption warning. But the text is all-caps,
    // so a separate low-priority suggestion is emitted.
    const doc = makeDoc(
      '<table>' +
        '<caption>PROGRAM TIMELINE</caption>' +
        '<tbody><tr><td>A</td><td>B</td></tr></tbody>' +
      '</table>'
    );
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const suggestion = results[0] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Table caption should use sentence case');
    expect(suggestion.instructionOnly).toBe(true);
    // No missing-caption warning alongside the suggestion
    expect(results.find(r => (r as Issue).severity === 'warning')).toBeUndefined();
  });

  it('surfaces a sentence-case suggestion when the <caption> element text is a single all-caps word', () => {
    // Single-word all-caps captions should also be treated as non-sentence-case.
    const doc = makeDoc(
      '<table>' +
        '<caption>TIMELINE</caption>' +
        '<tbody><tr><td>A</td><td>B</td></tr></tbody>' +
      '</table>'
    );
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const suggestion = results[0] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Table caption should use sentence case');
    expect(suggestion.instructionOnly).toBe(true);
    expect(results.find(r => (r as Issue).severity === 'warning')).toBeUndefined();
  });

  it('surfaces a sentence-case suggestion when the paragraph caption is all-caps', () => {
    // Paragraph caption is detected (no missing-caption warning), but text is all-caps.
    const doc = makeDoc('<p>PROGRAM TIMELINE</p>' + SIMPLE_TABLE);
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const suggestion = results[0] as Issue;
    expect(suggestion.severity).toBe('suggestion');
    expect(suggestion.title).toBe('Table caption should use sentence case');
    expect(suggestion.instructionOnly).toBe(true);
    expect(results.find(r => (r as Issue).severity === 'warning')).toBeUndefined();
  });

  it('surfaces a sentence-case suggestion when the paragraph caption is title case', () => {
    // "Program Timeline Overview" — "Timeline" and "Overview" start with uppercase
    // after the first word → title case detected.
    const doc = makeDoc('<p>Program Timeline Overview</p>' + SIMPLE_TABLE);
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).severity).toBe('suggestion');
    expect((results[0] as Issue).title).toBe('Table caption should use sentence case');
  });

  it('does not surface a sentence-case suggestion for a sentence-case caption', () => {
    // "Program timeline overview" — only the first word is capitalized → sentence case.
    const doc = makeDoc('<p>Program timeline overview</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not surface a sentence-case suggestion for a caption whose only non-first uppercase word is "PDF"', () => {
    // "PDF" is an all-caps acronym and must never count as title-case evidence.
    // "Submission checklist for PDF" is sentence case — no suggestion.
    const doc = makeDoc('<p>Submission checklist for PDF</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('surfaces a sentence-case suggestion when genuine title-case words appear alongside "PDF"', () => {
    // "Submission Checklist for PDF" — "Checklist" is a genuine title-case word.
    // "PDF" is exempt (all-caps acronym), but the issue is still emitted for "Checklist".
    const doc = makeDoc('<p>Submission Checklist for PDF</p>' + SIMPLE_TABLE);
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).severity).toBe('suggestion');
    expect((results[0] as Issue).title).toBe('Table caption should use sentence case');
  });

  it('does not surface a sentence-case suggestion for a "Table:" prefixed sentence-case caption', () => {
    // "Table:" is the optional prefix; the body "Project timeline" is sentence case.
    const doc = makeDoc('<p>Table: Project timeline</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not surface a suggestion when no caption is present (only the missing-caption warning is emitted)', () => {
    // No caption of any kind → only the warning, no sentence-case suggestion.
    const doc = makeDoc(SIMPLE_TABLE);
    const results = TABLE_002.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).severity).toBe('warning');
    expect((results[0] as Issue).title).toBe('Table is missing a caption');
  });
});
