import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import TABLE_003 from '../universal/TABLE-003';
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

// ─── Basic detection ──────────────────────────────────────────────────────────

describe('TABLE-003 basic detection', () => {
  it('flags a table with a colspan > 1', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="2">Merged header</td></tr>' +
        '<tr><td>A</td><td>B</td></tr>' +
      '</tbody></table>'
    );
    const results = TABLE_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('TABLE-003');
    expect(issue.title).toBe('Table contains merged cells');
    expect(issue.severity).toBe('suggestion');
    expect(issue.instructionOnly).toBe(true);
  });

  it('flags a table with a rowspan > 1', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td rowspan="2">Spans two rows</td><td>A</td></tr>' +
        '<tr><td>B</td></tr>' +
      '</tbody></table>'
    );
    const results = TABLE_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).title).toBe('Table contains merged cells');
  });

  it('does not flag a table with no merged cells', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td>A</td><td>B</td></tr>' +
        '<tr><td>C</td><td>D</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag a table where colspan=1 and rowspan=1 (no actual merging)', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="1" rowspan="1">A</td><td>B</td></tr>' +
        '<tr><td>C</td><td>D</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('flags multiple tables with merged cells independently', () => {
    const mergedTable =
      '<table><tbody>' +
        '<tr><td colspan="2">Header</td></tr>' +
        '<tr><td>A</td><td>B</td></tr>' +
      '</tbody></table>';
    const doc = makeDoc(mergedTable + mergedTable);
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(2);
  });

  it('reports the correct merged cell count in the description', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="2">Two-col span</td></tr>' +
        '<tr><td rowspan="2">Row span</td><td>B</td></tr>' +
        '<tr><td>C</td></tr>' +
      '</tbody></table>'
    );
    const results = TABLE_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).description).toContain('2 merged cells');
  });
});

// ─── CDC/DGHT and CDC/DGHP scaffolding table exemption ───────────────────────

describe('TABLE-003 CDC scaffolding table exemption', () => {
  // These tables are removed by CLEAN-007 from the output DOCX, but TABLE-003
  // runs against the original doc.html (pre-CLEAN-007). The exemption ensures
  // the scaffolding table is never flagged regardless of rule execution order.

  it('does not flag the CDC/DGHT "Before you begin" scaffolding table even with merged cells', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="2">CDC/DGHT NOFO Content Guide</td></tr>' +
        '<tr><td>Before you begin</td><td>Instructions here</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag the CDC/DGHP "Before you begin" scaffolding table even with merged cells', () => {
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="2">CDC/DGHP NOFO Content Guide</td></tr>' +
        '<tr><td>Before you begin</td><td>Instructions here</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag the scaffolding table when the first cell has leading whitespace or NBSP', () => {
    // mammoth.js can emit leading whitespace or U+00A0 inside table cells;
    // the exemption must survive trimming to avoid false positives.
    const doc = makeDoc(
      '<table><tbody>' +
        '<tr><td colspan="2">   CDC/DGHT NOFO Content Guide</td></tr>' +
        '<tr><td>Before you begin</td><td>Instructions here</td></tr>' +
      '</tbody></table>'
    );
    expect(TABLE_003.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('still flags a merged-cell table that follows the scaffolding table', () => {
    const scaffolding =
      '<table><tbody>' +
        '<tr><td colspan="2">CDC/DGHT NOFO Content Guide</td></tr>' +
        '<tr><td>Before you begin</td><td>Instructions here</td></tr>' +
      '</tbody></table>';
    const mergedTable =
      '<table><tbody>' +
        '<tr><td colspan="2">Some other merged table</td></tr>' +
        '<tr><td>A</td><td>B</td></tr>' +
      '</tbody></table>';
    const doc = makeDoc(scaffolding + mergedTable);
    const results = TABLE_003.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as Issue).title).toBe('Table contains merged cells');
  });
});
