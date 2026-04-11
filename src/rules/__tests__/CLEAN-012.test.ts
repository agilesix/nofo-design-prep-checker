import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_012 from '../universal/CLEAN-012';
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

const PHRASE = 'asterisked ( * )';

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-012: detection', () => {
  it('detects unbolded phrase under "Approach" heading', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>Fields marked ${PHRASE} are required.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-012');
    expect(change.targetField).toBe('text.asterisked.bold');
    expect(change.value).toBe('1');
    expect(change.description).toContain('"asterisked ( * )"');
    expect(change.description).toContain('1 instance');
  });

  it('detects unbolded phrase under "Program logic model" heading', () => {
    const doc = makeDoc(
      `<h2>Program logic model</h2>` +
      `<p>The ${PHRASE} items are required inputs.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects phrase under a subheading within the scoped section', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<h3>Subsection details</h3>` +
      `<p>Items marked ${PHRASE} are mandatory.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects phrase in a list item within the scoped section', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<ul><li>The ${PHRASE} fields must be completed.</li></ul>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('counts multiple unbolded instances across paragraphs', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>Note the ${PHRASE} items above.</p>` +
      `<p>Also, ${PHRASE} entries must be submitted.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('2');
    expect((results[0] as AutoAppliedChange).description).toContain('2 instances');
  });

  it('is case-insensitive for the heading match', () => {
    const doc = makeDoc(
      `<h2>approach</h2>` +
      `<p>The ${PHRASE} items are required.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('is case-insensitive for the phrase match', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>The Asterisked ( * ) items are required.</p>`
    );
    const results = CLEAN_012.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-ops: phrase already bold ─────────────────────────────────────────────

describe('CLEAN-012: no changes when phrase is already bold', () => {
  it('does not flag phrase already wrapped in <strong>', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>The <strong>${PHRASE}</strong> items are required.</p>`
    );
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag phrase already wrapped in <b>', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>The <b>${PHRASE}</b> items are required.</p>`
    );
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-ops: phrase outside scope ─────────────────────────────────────────────

describe('CLEAN-012: no changes when phrase is outside scope', () => {
  it('does not flag phrase in a section before any scoped heading', () => {
    const doc = makeDoc(
      `<h2>Basic Information</h2>` +
      `<p>The ${PHRASE} items are listed below.</p>` +
      `<h2>Approach</h2>` +
      `<p>Overview text.</p>`
    );
    // Phrase is under "Basic Information", not "Approach" → should return 0
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag phrase after the scoped section ends', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>Overview text.</p>` +
      `<h2>Eligibility</h2>` +
      `<p>The ${PHRASE} items are required here.</p>`
    );
    // Phrase is under "Eligibility", scope ended → should return 0
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('scope ends when a same-level heading is encountered', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>In-scope paragraph.</p>` +
      `<h2>Award Information</h2>` +
      `<p>The ${PHRASE} items are required.</p>`
    );
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when html is empty', () => {
    const doc = makeDoc('');
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when phrase is absent from scoped section', () => {
    const doc = makeDoc(
      `<h2>Approach</h2>` +
      `<p>No special markers here.</p>`
    );
    expect(CLEAN_012.check(doc, OPTIONS)).toHaveLength(0);
  });
});
