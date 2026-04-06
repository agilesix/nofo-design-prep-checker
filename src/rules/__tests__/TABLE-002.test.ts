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

  it('flags when the heading is more than 3 elements above the table', () => {
    // Heading + 3 paragraphs = 4 preceding elements; only 3 are scanned.
    const doc = makeDoc(
      '<h2>Key dates</h2>' +
      '<p>Para one.</p>' +
      '<p>Para two.</p>' +
      '<p>Para three.</p>' +
      SIMPLE_TABLE
    );
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
