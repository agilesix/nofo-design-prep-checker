import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import TABLE_002 from '../universal/TABLE-002';
import type { ParsedDocument, Issue } from '../../types';

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

// ─── Existing exemptions still apply ─────────────────────────────────────────

describe('TABLE-002 existing exemptions', () => {
  it('does not flag a single-cell table (callout box)', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td>Single cell content</td></tr></tbody></table>'
    );
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

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

  it('does not flag a merit review criteria table (first-row signal)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><th>Merit review criteria</th><th>Maximum points</th></tr>' +
        '<tr><td>Criterion A</td><td>30</td></tr>' +
      '</tbody></table>'
    );
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
