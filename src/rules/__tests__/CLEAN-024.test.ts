import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_024 from '../opdiv/CLEAN-024';
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

// ─── Detection: bare ACL full name ────────────────────────────────────────────

describe('CLEAN-024: detects unlabeled Administration for Community Living', () => {
  it('detects bare ACL name and unlabeled following paragraph', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>Administration for Community Living</p>' +
      '<p>ACL Regional Office</p>'
    );
    const results = CLEAN_024.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-024');
    expect(change.targetField).toBe('acl.basic.info.labels');
    expect(change.value).toBe('2');
    expect(change.description).toContain('"OpDiv:"');
    expect(change.description).toContain('"Agency:"');
  });

  it('detects bare ACL name with no following paragraph (OpDiv only)', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>Administration for Community Living</p>'
    );
    const results = CLEAN_024.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).toContain('"OpDiv:"');
    expect(change.description).not.toContain('"Agency:"');
  });

  it('uses H3 Basic information heading', () => {
    const doc = makeDoc(
      '<h3>Basic information</h3>' +
      '<p>Administration for Community Living</p>' +
      '<p>ACL Regional Office</p>'
    );
    const results = CLEAN_024.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
  });
});

// ─── Detection: already-labeled OpDiv triggers Agency-only check ──────────────

describe('CLEAN-024: already-labeled OpDiv triggers Agency check only', () => {
  it('detects missing Agency: when OpDiv: is already present', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>OpDiv: Administration for Community Living</p>' +
      '<p>ACL Regional Office</p>'
    );
    const results = CLEAN_024.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).not.toContain('"OpDiv:"');
    expect(change.description).toContain('"Agency:"');
  });

  it('returns nothing when both OpDiv: and Agency: are already present', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>OpDiv: Administration for Community Living</p>' +
      '<p>Agency: ACL Regional Office</p>'
    );
    expect(CLEAN_024.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('skips Agency fix when following paragraph already has a known label', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>Administration for Community Living</p>' +
      '<p>Opportunity name: Sample NOFO</p>'
    );
    const results = CLEAN_024.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).toContain('"OpDiv:"');
    expect(change.description).not.toContain('"Agency:"');
  });
});

// ─── No-ops: absent or out-of-scope ──────────────────────────────────────────

describe('CLEAN-024: does not flag absent or out-of-scope content', () => {
  it('returns nothing when ACL name is outside Basic information', () => {
    const doc = makeDoc(
      '<h2>Program description</h2>' +
      '<p>Administration for Community Living</p>' +
      '<p>ACL Regional Office</p>'
    );
    expect(CLEAN_024.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns nothing when no Basic information heading is present', () => {
    const doc = makeDoc('<p>Administration for Community Living</p>');
    expect(CLEAN_024.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('stops searching at the next same-level heading', () => {
    const doc = makeDoc(
      '<h2>Basic information</h2>' +
      '<p>Opportunity name: Sample NOFO</p>' +
      '<h2>Funding</h2>' +
      '<p>Administration for Community Living</p>'
    );
    expect(CLEAN_024.check(doc, OPTIONS)).toHaveLength(0);
  });
});
