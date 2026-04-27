import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_007 from '../opdiv/CLEAN-007';
import type { ParsedDocument, Issue, AutoAppliedChange } from '../../types';

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

const OPTIONS_SSJ         = { contentGuideId: 'cdc-dght-ssj' } as const;
const OPTIONS_COMPETITIVE = { contentGuideId: 'cdc-dght-competitive' } as const;
const OPTIONS_DGHP        = { contentGuideId: 'cdc-dghp' } as const;
const OPTIONS_CDC         = { contentGuideId: 'cdc' } as const;
const OPTIONS_CDC_RESEARCH = { contentGuideId: 'cdc-research' } as const;
const OPTIONS_OTHER       = { contentGuideId: 'acf' } as const;

// Preamble + Step 1 heading — the canonical trigger case (has scaffolding table)
const PREAMBLE_HTML =
  '<p>Here is the color coding for the doc: green = required, red = remove</p>' +
  '<p>Some editorial notes about this template.</p>' +
  '<table><tbody><tr><td>CDC/DGHT NOFO Content Guide</td><td>v2.0</td></tr></tbody></table>' +
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>This section contains the actual NOFO content.</p>';

// Step 1 is the very first body element — no preamble present
const CLEAN_HTML =
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>Content here.</p>';

// Generic CDC doc with one paragraph before Step 1 but NO scaffolding table
const GENERIC_CDC_PREAMBLE_HTML =
  '<p>This is a funding opportunity from the CDC.</p>' +
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>Content here.</p>';

// Standard NOFO metadata block — real document content, must never be removed
const METADATA_BLOCK_HTML =
  '<p>OpDiv: CDC</p>' +
  '<p>Agency: National Center for Emerging and Zoonotic Infectious Diseases (NCEZID)</p>' +
  '<p>Subagency: Division of Foodborne, Waterborne, and Environmental Diseases (DFWED)</p>' +
  '<p>Opportunity name: Epidemiology and Laboratory Capacity for Prevention and Control</p>' +
  '<p>Opportunity number: CDC-RFA-CK25-001</p>' +
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>Content here.</p>';

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-007: detects preamble before Step 1 heading', () => {
  it('fires when a CDC/DGHT NOFO Content Guide scaffolding table precedes Step 1', () => {
    const doc = makeDoc(PREAMBLE_HTML);
    const results = CLEAN_007.check(doc, OPTIONS_SSJ);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-007');
    expect(change.targetField).toBe('struct.dght.removescaffolding');
    expect(change.description).toBe('CDC preamble removed from beginning of document.');
  });

  it('fires when the first cell of a table contains "Here is the color coding"', () => {
    const html =
      '<table><tbody><tr><td>Here is the color coding: green = required</td></tr></tbody></table>' +
      '<h2>Step 1: Review the Opportunity</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_CDC)).toHaveLength(1);
  });

  it('fires when first cell contains "CDC/DGHP" and preamble contains "Before you begin"', () => {
    const html =
      '<table><tbody><tr><td>CDC/DGHP Content Guide</td></tr></tbody></table>' +
      '<p>Before you begin, read these instructions carefully.</p>' +
      '<h2>Step 1: Review the Opportunity</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_DGHP)).toHaveLength(1);
  });

  it('detection of the Step 1 heading anchor is case-insensitive', () => {
    const html =
      '<table><tbody><tr><td>CDC/DGHT NOFO Content Guide</td></tr></tbody></table>' +
      '<h2>STEP 1: REVIEW THE OPPORTUNITY</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(1);
  });

  it('does NOT fire when a non-scaffolding table precedes Step 1', () => {
    const html =
      '<table><tbody><tr><td>Content guide reference</td></tr></tbody></table>' +
      '<h2>Step 1: Review the Opportunity</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_CDC)).toHaveLength(0);
  });

  it('does NOT fire when only a generic paragraph precedes Step 1 (no scaffolding table)', () => {
    const doc = makeDoc(GENERIC_CDC_PREAMBLE_HTML);
    expect(CLEAN_007.check(doc, OPTIONS_CDC)).toHaveLength(0);
  });

  it('does NOT fire when "CDC/DGHP" table is present but "Before you begin" is absent', () => {
    const html =
      '<table><tbody><tr><td>CDC/DGHP Content Guide</td></tr></tbody></table>' +
      '<h2>Step 1: Review the Opportunity</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_DGHP)).toHaveLength(0);
  });

  it('does NOT fire for a document that contains only the NOFO metadata block before Step 1', () => {
    // The metadata block (OpDiv:, Agency:, Subagency:, Opportunity name:, etc.)
    // is real NOFO content — not editorial scaffolding — and must never be removed.
    const doc = makeDoc(METADATA_BLOCK_HTML);
    expect(CLEAN_007.check(doc, OPTIONS_CDC_RESEARCH)).toHaveLength(0);
  });

  it('aborts removal when NOFO metadata labels are present even alongside a scaffolding table', () => {
    // Safety guard: if the preamble somehow contains both a scaffolding table
    // and metadata field labels, the metadata takes priority and removal is aborted.
    const html =
      '<p>OpDiv: CDC</p>' +
      '<table><tbody><tr><td>CDC/DGHT NOFO Content Guide</td></tr></tbody></table>' +
      '<h2>Step 1: Review the Opportunity</h2>';
    const doc = makeDoc(html);
    expect(CLEAN_007.check(doc, OPTIONS_CDC)).toHaveLength(0);
  });
});

// ─── No-op cases ──────────────────────────────────────────────────────────────

describe('CLEAN-007: no change when nothing to remove', () => {
  it('returns no changes when Step 1 is already the first body element', () => {
    const doc = makeDoc(CLEAN_HTML);
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('returns no changes when the document has no Step 1 heading (safety guard)', () => {
    const doc = makeDoc(
      '<p>Some content without any matching heading.</p>' +
      '<h2>Background</h2>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('returns no changes when Step 1 heading text does not exactly match the anchor', () => {
    const doc = makeDoc(
      '<p>Preamble.</p>' +
      '<h2>Step 1: Something Else</h2>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('returns no changes when only whitespace-only elements precede Step 1', () => {
    const doc = makeDoc(
      '<p>   </p>' +
      '<h2>Step 1: Review the Opportunity</h2>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_CDC)).toHaveLength(0);
  });

  it('returns no changes for an empty document', () => {
    const doc = makeDoc('');
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });
});

// ─── Content guide scope ──────────────────────────────────────────────────────

describe('CLEAN-007: content guide scope', () => {
  it('fires for cdc-dght-ssj', () => {
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_SSJ)).toHaveLength(1);
  });

  it('fires for cdc-dght-competitive', () => {
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_COMPETITIVE)).toHaveLength(1);
  });

  it('fires for cdc-dghp', () => {
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_DGHP)).toHaveLength(1);
  });

  it('fires for cdc', () => {
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_CDC)).toHaveLength(1);
  });

  it('fires for cdc-research', () => {
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_CDC_RESEARCH)).toHaveLength(1);
  });

  it('check() detects preamble regardless of the options contentGuideId passed in', () => {
    // Guide-gating is the RuleRunner's responsibility, not check()'s.
    expect(CLEAN_007.check(makeDoc(PREAMBLE_HTML), OPTIONS_OTHER)).toHaveLength(1);
  });

  it('contentGuideIds covers all five CDC variants', () => {
    expect(CLEAN_007.contentGuideIds).toEqual(
      expect.arrayContaining([
        'cdc',
        'cdc-research',
        'cdc-dght-ssj',
        'cdc-dght-competitive',
        'cdc-dghp',
      ])
    );
    expect(CLEAN_007.contentGuideIds).toHaveLength(5);
  });
});

// ─── Instruction box detection ────────────────────────────────────────────────

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Build a minimal document.xml containing one instruction box table. */
function makeInstructionBoxDocXml(opts: {
  fill?: string;
  prefix?: string;
  cellCount?: number;
}): string {
  const { fill = 'BCD6F4', prefix = 'DGHT-SPECIFIC INSTRUCTIONS', cellCount = 1 } = opts;
  const extraCell = cellCount > 1 ? `<w:tc><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}"><w:body>` +
    `<w:tbl>` +
    `<w:tr>` +
    `<w:tc>` +
    `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` +
    `<w:p><w:r><w:t>${prefix} Some instructions here.</w:t></w:r></w:p>` +
    `</w:tc>` +
    extraCell +
    `</w:tr>` +
    `</w:tbl>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

function makeDocWithXml(html: string, documentXml: string): ParsedDocument {
  return {
    html,
    sections: [{
      id: 'section-preamble',
      heading: 'Document start',
      headingLevel: 0,
      html,
      rawText: html.replace(/<[^>]+>/g, ''),
      startPage: 1,
    }],
    rawText: html.replace(/<[^>]+>/g, ''),
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

function toAutoAppliedChanges(results: (Issue | AutoAppliedChange)[]): AutoAppliedChange[] {
  return results.filter((r): r is AutoAppliedChange => !('severity' in r));
}

describe('CLEAN-007: instruction box detection', () => {
  it('detects a DGHT instruction box and returns the correct AutoAppliedChange', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({}));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    const change = results.find(r => r.targetField === 'struct.dght.removeinstructionboxes');
    expect(change).toBeDefined();
    expect(change!.ruleId).toBe('CLEAN-007');
    expect(change!.value).toBe('1');
    expect(change!.description).toBe('Removed 1 DGHT/DGHP instruction box.');
  });

  it('detects a DGHP instruction box', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ prefix: 'DGHP-SPECIFIC INSTRUCTIONS' }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_DGHP) as (Issue | AutoAppliedChange)[]);
    const change = results.find(r => r.targetField === 'struct.dght.removeinstructionboxes');
    expect(change).toBeDefined();
    expect(change!.value).toBe('1');
  });

  it('counts multiple instruction boxes correctly', () => {
    // Build two-box XML by hand to keep the test simple
    const twoBoxDocXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:tbl><w:tr><w:tc>` +
      `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="BCD6F4"/></w:tcPr>` +
      `<w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS First box.</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>` +
      `<w:tbl><w:tr><w:tc>` +
      `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="BCD6F4"/></w:tcPr>` +
      `<w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS Second box.</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;
    const doc = makeDocWithXml('', twoBoxDocXml);
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    const change = results.find(r => r.targetField === 'struct.dght.removeinstructionboxes');
    expect(change).toBeDefined();
    expect(change!.value).toBe('2');
    expect(change!.description).toBe('Removed 2 DGHT/DGHP instruction boxes.');
  });

  it('is case-insensitive for the fill color attribute', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ fill: 'bcd6f4' }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeDefined();
  });

  it('is case-insensitive for the instruction prefix', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ prefix: 'dght-specific instructions' }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeDefined();
  });

  it('does not detect a table without blue shading', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ fill: 'FFFFFF' }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeUndefined();
  });

  it('does not detect a table whose text does not start with the instruction prefix', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ prefix: 'Some other content' }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeUndefined();
  });

  it('does not detect a multi-cell table even if shading and prefix match', () => {
    const doc = makeDocWithXml('', makeInstructionBoxDocXml({ cellCount: 2 }));
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeUndefined();
  });

  it('returns no instruction box change when documentXml is empty', () => {
    const doc = makeDocWithXml('', '');
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeUndefined();
  });

  it('can return both preamble and instruction box changes for the same document', () => {
    const docXml = makeInstructionBoxDocXml({});
    const html = PREAMBLE_HTML;
    const doc = makeDocWithXml(html, docXml);
    const results = toAutoAppliedChanges(CLEAN_007.check(doc, OPTIONS_SSJ) as (Issue | AutoAppliedChange)[]);
    expect(results.find(r => r.targetField === 'struct.dght.removescaffolding')).toBeDefined();
    expect(results.find(r => r.targetField === 'struct.dght.removeinstructionboxes')).toBeDefined();
  });
});
