import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_011 from '../universal/CLEAN-011';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeDoc(documentXml: string): ParsedDocument {
  return {
    html: '',
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

/**
 * Build a minimal document.xml with an Application checklist H2 heading
 * followed by one table whose first-column cells have the given content.
 *
 * @param firstColCells  Each entry: { glyph, style } where style is the
 *   w:pStyle value for the first paragraph in the cell. Use '' for no style.
 *   The cell text is `${glyph} Item text`.
 */
function makeChecklistDoc(
  firstColCells: Array<{ glyph: string; style?: string }>,
  headingStyle = 'Heading2'
): string {
  const rows = firstColCells
    .map(({ glyph, style = '' }) => {
      const pStyle = style
        ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
        : '';
      return (
        `<w:tr>` +
        `<w:tc><w:p>${pStyle}<w:r><w:t>${glyph} Item text</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>Second column</w:t></w:r></w:p></w:tc>` +
        `</w:tr>`
      );
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}">` +
    `<w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>` +
    `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
    `<w:tbl>${rows}</w:tbl>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

// ─── Detection: cells that need fixing ───────────────────────────────────────

describe('CLEAN-011: detects checklist cells needing correction', () => {
  it('detects U+2610 BALLOT BOX (☐) as wrong glyph', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '☐' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-011');
    expect(change.targetField).toBe('checklist.checkbox');
    expect(change.value).toBe('1');
  });

  it('detects U+2611 BALLOT BOX WITH CHECK (☑) as wrong glyph', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '☑' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects U+25A1 WHITE SQUARE (□) as wrong glyph', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '□' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects bullet (•) as wrong glyph', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '•' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects lowercase letter o used as checkbox placeholder', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: 'o' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects uppercase O used as checkbox placeholder', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: 'O' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects a bulleted list style even when glyph is correct', () => {
    // Correct glyph ◻ but style is ListParagraph → still needs fix
    const doc = makeDoc(makeChecklistDoc([{ glyph: '◻', style: 'ListParagraph' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects a List Bullet style', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '◻', style: 'ListBullet' }]));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('counts multiple cells needing correction', () => {
    const doc = makeDoc(
      makeChecklistDoc([
        { glyph: '☐' },
        { glyph: '◻', style: 'ListParagraph' },
        { glyph: '□' },
      ])
    );
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('3');
  });

  it('detects under an H3 Application checklist heading', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '☐' }], 'Heading3'));
    const results = CLEAN_011.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-op: cells that do not need fixing ────────────────────────────────────

describe('CLEAN-011: no changes when no corrections needed', () => {
  it('returns no changes when all cells already have correct glyph and Normal style', () => {
    const doc = makeDoc(makeChecklistDoc([{ glyph: '◻' }, { glyph: '◻' }]));
    expect(CLEAN_011.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for a document with no Application checklist heading', () => {
    // Same table structure but under a different heading
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Merit review criteria</w:t></w:r></w:p>` +
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>☐ Item</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_011.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('does not touch tables outside the Application checklist section', () => {
    // Table before the Application checklist heading should be ignored
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      // Table BEFORE the checklist heading — should not be touched
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>☐ Pre-checklist item</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
      // Table WITH correct glyph — no fix needed
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>◻ Correct item</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_011.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('stops inspecting tables after a same-level heading ends the section', () => {
    // Application checklist (H2), then a table with wrong glyph that comes
    // AFTER a subsequent H2 — the subsequent H2 ends the scope.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>◻ Item in checklist</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      // A new H2 ends the Application checklist scope
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Next section</w:t></w:r></w:p>` +
      // This table is outside the scope — wrong glyph but should NOT be flagged
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>☐ Out-of-scope item</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_011.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes for an empty documentXml', () => {
    expect(CLEAN_011.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('does not flag second-column cells with wrong glyphs', () => {
    // Only first column is inspected — second column with wrong glyph is ignored
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>◻ Correct first col</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>☐ Wrong in second col</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    expect(CLEAN_011.check(makeDoc(xml), OPTIONS)).toHaveLength(0);
  });
});
