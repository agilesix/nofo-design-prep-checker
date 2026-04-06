import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_007 from '../opdiv/CLEAN-007';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

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

const OPTIONS_SSJ = { contentGuideId: 'cdc-dght-ssj' } as const;
const OPTIONS_COMPETITIVE = { contentGuideId: 'cdc-dght-competitive' } as const;
const OPTIONS_OTHER = { contentGuideId: 'acf' } as const;

// Minimal HTML that matches the trigger: color-coding preamble followed by Step 1 heading
const SCAFFOLDING_HTML =
  '<p>Here is the color coding for the doc: green = required, red = remove</p>' +
  '<p>Some editorial notes about this template.</p>' +
  '<table><tbody><tr><td>CDC/DGHT NOFO Content Guide</td><td>v2.0</td></tr></tbody></table>' +
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>This section contains the actual NOFO content.</p>';

// HTML without the trigger phrase — regular document
const NORMAL_HTML =
  '<p>This is a funding opportunity from the CDC.</p>' +
  '<h2>Step 1: Review the Opportunity</h2>' +
  '<p>Content here.</p>';

// ─── Trigger detection ────────────────────────────────────────────────────────

describe('CLEAN-007 trigger detection', () => {
  it('returns an AutoAppliedChange when first paragraph begins with the trigger phrase', () => {
    const doc = makeDoc(SCAFFOLDING_HTML);
    const results = CLEAN_007.check(doc, OPTIONS_SSJ);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-007');
    expect(change.targetField).toBe('struct.dght.removescaffolding');
    expect(change.description).toContain('CDC/DGHT editorial instructions removed');
  });

  it('returns no changes when the first paragraph does not begin with the trigger phrase', () => {
    const doc = makeDoc(NORMAL_HTML);
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('returns no changes when the document has no paragraphs', () => {
    const doc = makeDoc('<h2>Step 1: Review the Opportunity</h2>');
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('returns no changes when the trigger phrase is present but no Step 1 heading exists (safety guard)', () => {
    // Without the Step 1 anchor, we cannot determine where scaffolding ends —
    // the rule should not remove anything.
    const doc = makeDoc(
      '<p>Here is the color coding for the doc: green = required</p>' +
      '<p>Some content without any heading.</p>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('detection is case-insensitive for the trigger phrase', () => {
    const doc = makeDoc(
      '<p>HERE IS THE COLOR CODING FOR THE DOC: green = required</p>' +
      '<h2>Step 1: Review the Opportunity</h2>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(1);
  });

  it('trigger phrase must be in the first paragraph — does not fire if it appears later', () => {
    const doc = makeDoc(
      '<p>This is a normal intro paragraph.</p>' +
      '<p>Here is the color coding for the doc: green = required</p>' +
      '<h2>Step 1: Review the Opportunity</h2>'
    );
    expect(CLEAN_007.check(doc, OPTIONS_SSJ)).toHaveLength(0);
  });

  it('works for cdc-dght-competitive guide as well', () => {
    const doc = makeDoc(SCAFFOLDING_HTML);
    expect(CLEAN_007.check(doc, OPTIONS_COMPETITIVE)).toHaveLength(1);
  });
});

// ─── Content guide scoping (rule-level check, not RuleRunner filtering) ──────

describe('CLEAN-007 content guide scope', () => {
  it('check() still detects the trigger when called directly with a non-DGHT guide', () => {
    // The rule's check() function does not filter by contentGuideId — that is the
    // RuleRunner's responsibility. Verify the detection logic itself is guide-agnostic.
    const doc = makeDoc(SCAFFOLDING_HTML);
    const results = CLEAN_007.check(doc, OPTIONS_OTHER);
    expect(results).toHaveLength(1);
  });

  it('contentGuideIds is restricted to the two CDC/DGHT guides', () => {
    expect(CLEAN_007.contentGuideIds).toEqual(
      expect.arrayContaining(['cdc-dght-ssj', 'cdc-dght-competitive'])
    );
    expect(CLEAN_007.contentGuideIds).toHaveLength(2);
  });
});
