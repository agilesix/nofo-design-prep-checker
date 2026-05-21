import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_023 from '../opdiv/CLEAN-023';
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

const OPTIONS = { contentGuideId: 'acl' } as const;

// ─── Detection: bare phone numbers under Agency contacts ──────────────────────

describe('CLEAN-023: detects bare phone numbers in Agency contacts', () => {
  it('detects NNN-NNN-NNNN format', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>555-123-4567</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-023');
    expect(change.targetField).toBe('acl.telephone.prefix');
    expect(change.value).toBe('1');
  });

  it('detects (NNN) NNN-NNNN format', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>(555) 123-4567</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects NNN.NNN.NNNN format', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>555.123.4567</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects phone number with x extension', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>555-123-4567 x1234</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('detects phone number with ext. extension', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>555-123-4567 ext. 1234</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('counts multiple bare phone numbers', () => {
    const doc = makeDoc(
      '<h2>Agency contacts</h2>' +
      '<p>Jane Smith</p>' +
      '<p>555-123-4567</p>' +
      '<p>555-987-6543</p>'
    );
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
    expect((results[0] as AutoAppliedChange).description).toContain('2 bare phone numbers');
  });

  it('uses H3 Agency contacts heading', () => {
    const doc = makeDoc('<h3>Agency contacts</h3><p>555-123-4567</p>');
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-ops: already labeled or excluded numbers ──────────────────────────────

describe('CLEAN-023: does not flag labeled or excluded phone numbers', () => {
  it('skips "Telephone: NNN-NNN-NNNN" (already labeled)', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>Telephone: 555-123-4567</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips "Phone: NNN-NNN-NNNN" (already labeled)', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>Phone: 555-123-4567</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips "Tel: NNN-NNN-NNNN" (already labeled)', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>Tel: 555-123-4567</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips "TTY: NNN-NNN-NNNN" (already labeled)', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>TTY: 555-123-4567</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips toll-free number starting with 1-', () => {
    const doc = makeDoc('<h2>Agency contacts</h2><p>1-800-555-1234</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips phone number outside Agency contacts section', () => {
    const doc = makeDoc(
      '<h2>Program description</h2>' +
      '<p>Call us at 555-123-4567 for more info.</p>'
    );
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns nothing when no Agency contacts heading is present', () => {
    const doc = makeDoc('<h2>Contact information</h2><p>555-123-4567</p>');
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Scoping: section boundaries ─────────────────────────────────────────────

describe('CLEAN-023: respects section boundaries', () => {
  it('stops at the next H2 heading', () => {
    const doc = makeDoc(
      '<h2>Agency contacts</h2>' +
      '<p>555-123-4567</p>' +
      '<h2>Funding details</h2>' +
      '<p>555-987-6543</p>'
    );
    const results = CLEAN_023.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('does not flag inline phone numbers within a sentence', () => {
    const doc = makeDoc(
      '<h2>Agency contacts</h2>' +
      '<p>Please call 555-123-4567 for questions about the grant.</p>'
    );
    expect(CLEAN_023.check(doc, OPTIONS)).toHaveLength(0);
  });
});
