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
    // The "Table:" prefix is the reliable caption signal — formatting must not matter.
    const doc = makeDoc('<p><strong>Table: Project timeline</strong></p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags a table when the preceding paragraph starts with text other than "Table:"', () => {
    const doc = makeDoc('<p>See the data below.</p>' + SIMPLE_TABLE);
    expect(TABLE_002.check(doc, OPTIONS)).toHaveLength(1);
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

  it('flags when the heading + intro exceeds 50 words between heading and table', () => {
    // 51-word paragraph — heading is too far removed to serve as a caption.
    const longParagraph = '<p>' + Array(51).fill('word').join(' ') + '</p>';
    const doc = makeDoc('<h2>Key dates</h2>' + longParagraph + SIMPLE_TABLE);
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
