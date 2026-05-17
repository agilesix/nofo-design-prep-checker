import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_020 from '../opdiv/CLEAN-020';
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

describe('CLEAN-020: detects H1 divider paragraphs after the first "Step 1:" H1', () => {
  it('detects a single underscore-only H1 after the "Step 1:" anchor', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<p>Body text.</p>' +
      '<h1>___________________________</h1>'
    );
    const results = CLEAN_020.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-020');
    expect(change.targetField).toBe('samhsa.h1.dividers.remove');
    expect(change.description).toContain('divider');
  });

  it('detects multiple underscore H1 paragraphs after "Step 1:" and returns one change', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>___________</h1>' +
      '<h1>Step 2: Review Eligibility</h1>' +
      '<h1>___________</h1>'
    );
    const results = CLEAN_020.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).targetField).toBe('samhsa.h1.dividers.remove');
  });

  it('"Step 1:" anchor match is case-insensitive', () => {
    const doc = makeDoc(
      '<h1>STEP 1: REVIEW THE OPPORTUNITY</h1>' +
      '<h1>___________</h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a divider H1 consisting of underscores mixed with interior spaces', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>_ _ _ _ _ _ _</h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a divider H1 that appears immediately after the anchor (no body between)', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>_____</h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── No-op: before anchor ─────────────────────────────────────────────────────

describe('CLEAN-020: does not detect dividers that appear before the "Step 1:" anchor', () => {
  it('ignores underscore H1s that occur entirely before "Step 1:"', () => {
    const doc = makeDoc(
      '<h1>___________</h1>' +
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<p>Body text.</p>'
    );
    // The only underscore H1 is before Step 1, so no dividers are in scope
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: no anchor ─────────────────────────────────────────────────────────

describe('CLEAN-020: does not detect anything when the "Step 1:" anchor is absent', () => {
  it('returns no change when there is no H1 starting with "Step 1:"', () => {
    const doc = makeDoc(
      '<h1>___________</h1>' +
      '<p>Body text.</p>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change for an empty document', () => {
    expect(CLEAN_020.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: H1 text is not purely underscores/whitespace ─────────────────────

describe('CLEAN-020: does not flag H1 paragraphs whose text contains non-underscore characters', () => {
  it('does not flag a regular heading after "Step 1:"', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>Step 2: Review Eligibility</h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H1 that starts with underscores but also contains letters', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>___Introduction___</h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an H1 whose trimmed text is only whitespace (no underscores)', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1>   </h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an empty H1 element', () => {
    const doc = makeDoc(
      '<h1>Step 1: Review the Opportunity</h1>' +
      '<h1></h1>'
    );
    expect(CLEAN_020.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Rule metadata ────────────────────────────────────────────────────────────

describe('CLEAN-020: rule metadata', () => {
  it('is scoped only to samhsa', () => {
    expect(CLEAN_020.contentGuideIds).toEqual(['samhsa']);
  });

  it('is marked autoApply', () => {
    expect(CLEAN_020.autoApply).toBe(true);
  });
});
