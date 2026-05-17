import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_022 from '../opdiv/CLEAN-022';
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

describe('CLEAN-022: detects all-caps "NOTE:" in body text', () => {
  it('detects "NOTE:" in a body paragraph', () => {
    const doc = makeDoc('<p>NOTE: Applicants must submit by the deadline.</p>');
    const results = CLEAN_022.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-022');
    expect(change.targetField).toBe('samhsa.note.capitalize');
  });

  it('detects "NOTE:" in a list item', () => {
    const doc = makeDoc('<ul><li>NOTE: Submit all forms electronically.</li></ul>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects "NOTE:" in a table cell', () => {
    const doc = makeDoc(
      '<table><tbody><tr><td>NOTE: See section 3.</td></tr></tbody></table>'
    );
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('returns exactly one AutoAppliedChange even when "NOTE:" appears multiple times', () => {
    const doc = makeDoc(
      '<p>NOTE: First note. NOTE: Second note.</p>'
    );
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(1);
    expect((CLEAN_022.check(doc, OPTIONS)[0] as AutoAppliedChange).targetField).toBe(
      'samhsa.note.capitalize'
    );
  });
});

// ─── No-op: other casing forms ────────────────────────────────────────────────

describe('CLEAN-022: does not trigger on "Note:" or "note:"', () => {
  it('returns no change when only "Note:" (sentence case) appears', () => {
    const doc = makeDoc('<p>Note: Please read the instructions carefully.</p>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when only "note:" (all lowercase) appears', () => {
    const doc = makeDoc('<p>See the note: this is important.</p>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change when "NOTE" appears without a trailing colon', () => {
    const doc = makeDoc('<p>Please take NOTE of the following.</p>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no change for an empty document', () => {
    expect(CLEAN_022.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: headings are excluded ─────────────────────────────────────────────

describe('CLEAN-022: does not trigger when "NOTE:" appears only in heading elements', () => {
  it('does not detect "NOTE:" inside an h1 element', () => {
    const doc = makeDoc('<h1>NOTE: Important Heading</h1>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not detect "NOTE:" inside an h2 element', () => {
    const doc = makeDoc('<h2>NOTE: Section Title</h2>');
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('detects "NOTE:" in a body paragraph even when headings also contain "NOTE:"', () => {
    const doc = makeDoc(
      '<h1>NOTE: This is a heading</h1>' +
      '<p>NOTE: This is body text that should be fixed.</p>'
    );
    expect(CLEAN_022.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── Rule metadata ────────────────────────────────────────────────────────────

describe('CLEAN-022: rule metadata', () => {
  it('is scoped only to samhsa', () => {
    expect(CLEAN_022.contentGuideIds).toEqual(['samhsa']);
  });

  it('is marked autoApply', () => {
    expect(CLEAN_022.autoApply).toBe(true);
  });
});
