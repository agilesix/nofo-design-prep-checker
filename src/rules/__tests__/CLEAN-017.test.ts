import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_017 from '../universal/CLEAN-017';
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

function check(html: string): AutoAppliedChange[] {
  return CLEAN_017.check(makeDoc(html), OPTIONS) as AutoAppliedChange[];
}

// ─── Detection ────────────────────────────────────────────────────────────────

describe('CLEAN-017: detects incorrect Grants.gov capitalization', () => {
  it('flags hyperlink with "grants.gov" as link text', () => {
    const results = check('<p><a href="https://www.grants.gov">grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('CLEAN-017');
    expect(results[0]!.targetField).toBe('text.grantsgov.capitalize');
    expect(results[0]!.value).toBe('1');
    expect(results[0]!.description).toContain('1 location');
  });

  it('flags plain body text containing "grants.gov"', () => {
    const results = check('<p>Visit grants.gov for more information.</p>');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('1');
  });

  it('flags "GRANTS.GOV" (all-caps, case-insensitive)', () => {
    const results = check('<p>GRANTS.GOV</p>');
    expect(results).toHaveLength(1);
  });

  it('flags "Grants.Gov" (wrong internal capitalization)', () => {
    const results = check('<p>Grants.Gov</p>');
    expect(results).toHaveLength(1);
  });

  it('counts multiple incorrect occurrences across the document', () => {
    const results = check('<p>grants.gov</p><p>GRANTS.GOV</p><p>grants.gov</p>');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe('3');
    expect(results[0]!.description).toContain('3 locations');
  });

  it('uses singular "location" for a single correction', () => {
    const results = check('<p>grants.gov</p>');
    expect(results[0]!.description).toContain('1 location.');
    expect(results[0]!.description).not.toContain('locations');
  });
});

// ─── No-op cases ──────────────────────────────────────────────────────────────

describe('CLEAN-017: no AutoAppliedChange when no correction needed', () => {
  it('does not flag already-correct "Grants.gov"', () => {
    expect(check('<p>Grants.gov</p>')).toHaveLength(0);
  });

  it('does not flag a hyperlink whose link text is already "Grants.gov"', () => {
    expect(
      check('<p><a href="https://www.grants.gov">Grants.gov</a></p>')
    ).toHaveLength(0);
  });

  it('does not flag unrelated text', () => {
    expect(check('<p>Visit our website for more information.</p>')).toHaveLength(0);
  });

  it('returns empty array for empty HTML', () => {
    expect(check('')).toHaveLength(0);
  });
});
