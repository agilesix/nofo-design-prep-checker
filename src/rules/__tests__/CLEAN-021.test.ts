import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_021 from '../opdiv/CLEAN-021';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const OPTIONS = { contentGuideId: 'samhsa' } as const;

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: html.replace(/<[^>]+>/g, ''),
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-021: detects "SAMSHA" misspelling in body text', () => {
  it('detects "SAMSHA" in a body paragraph', () => {
    const doc = makeDoc('<p>Please contact SAMSHA for more information.</p>');
    const results = CLEAN_021.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-021');
    expect(change.targetField).toBe('samhsa.misspelling.samsha');
  });

  it('detects "SAMSHA" in a list item', () => {
    const doc = makeDoc('<ul><li>SAMSHA provides grants.</li></ul>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects "SAMSHA" in a table cell', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td>Funded by SAMSHA</td></tr></tbody></table>'
    );
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('returns exactly one AutoAppliedChange even when "SAMSHA" appears multiple times', () => {
    const doc = makeDoc(
      '<p>SAMSHA is the funder. Contact SAMSHA directly.</p>'
    );
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(1);
    expect((CLEAN_021.check(doc, OPTIONS)[0] as AutoAppliedChange).targetField).toBe(
      'samhsa.misspelling.samsha'
    );
  });
});

// ─── No-op: correct spelling ──────────────────────────────────────────────────

describe('CLEAN-021: no change when spelling is already correct', () => {
  it('returns no change when only "SAMHSA" (correct) appears', () => {
    const doc = makeDoc('<p>Please contact SAMHSA for more information.</p>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change for an empty document', () => {
    expect(CLEAN_021.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: headings are excluded ─────────────────────────────────────────────

describe('CLEAN-021: does not trigger when "SAMSHA" appears only in heading elements', () => {
  it('does not detect "SAMSHA" inside an h1 element', () => {
    const doc = makeDoc('<h1>SAMSHA Grant Opportunity</h1>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not detect "SAMSHA" inside an h2 element', () => {
    const doc = makeDoc('<h2>Contact SAMSHA</h2>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('detects "SAMSHA" in a body paragraph even when headings are also present', () => {
    const doc = makeDoc(
      '<h1>SAMHSA Grant Opportunity</h1>' +
      '<p>SAMSHA provides funding for behavioral health programs.</p>'
    );
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── Case sensitivity ─────────────────────────────────────────────────────────

describe('CLEAN-021: match is case-sensitive — only exact "SAMSHA" triggers', () => {
  it('does not trigger on "samsha" (all lowercase)', () => {
    const doc = makeDoc('<p>Contact samsha for more information.</p>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not trigger on "Samsha" (title case)', () => {
    const doc = makeDoc('<p>Samsha is the agency.</p>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not trigger on "SAMsha" (mixed case)', () => {
    const doc = makeDoc('<p>SAMsha provides services.</p>');
    expect(CLEAN_021.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Rule metadata ────────────────────────────────────────────────────────────

describe('CLEAN-021: rule metadata', () => {
  it('is scoped only to samhsa', () => {
    expect(CLEAN_021.contentGuideIds).toEqual(['samhsa']);
  });

  it('is marked autoApply', () => {
    expect(CLEAN_021.autoApply).toBe(true);
  });
});
