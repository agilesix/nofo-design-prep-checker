import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_014 from '../universal/CLEAN-014';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

function makeDoc(html: string): ParsedDocument {
  return {
    html,
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-014: detects wrapping quotes', () => {
  it('detects straight double quotes wrapping the entire tagline value', () => {
    const doc = makeDoc('<p>Tagline: "Improving lives through innovation."</p>');
    const results = CLEAN_014.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-014');
    expect(change.targetField).toBe('text.tagline.unquote');
    expect(change.description).toBe('Quotation marks removed from tagline.');
  });

  it('detects smart/curly double quotes wrapping the entire tagline value', () => {
    const doc = makeDoc('<p>Tagline: \u201CImproving lives through innovation.\u201D</p>');
    const results = CLEAN_014.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).targetField).toBe('text.tagline.unquote');
  });
});

// ─── No-op ────────────────────────────────────────────────────────────────────

describe('CLEAN-014: no change when quotes are absent or mismatched', () => {
  it('returns no change when the tagline value has no quotes', () => {
    const doc = makeDoc('<p>Tagline: Improving lives through innovation.</p>');
    expect(CLEAN_014.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when only an opening quote is present', () => {
    const doc = makeDoc('<p>Tagline: "Improving lives through innovation.</p>');
    expect(CLEAN_014.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when only a closing quote is present', () => {
    const doc = makeDoc('<p>Tagline: Improving lives through innovation."</p>');
    expect(CLEAN_014.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when quotes appear mid-value but do not wrap it', () => {
    const doc = makeDoc('<p>Tagline: Improving "lives" through innovation.</p>');
    expect(CLEAN_014.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when no tagline paragraph is present', () => {
    const doc = makeDoc('<p>Keywords: accessibility, grants</p>');
    expect(CLEAN_014.check(doc, OPTIONS)).toHaveLength(0);
  });
});
