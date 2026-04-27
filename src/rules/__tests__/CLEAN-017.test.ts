import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_017 from '../universal/CLEAN-017';
import type { ParsedDocument, AutoAppliedChange, Issue } from '../../types';

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

function check(html: string): (AutoAppliedChange | Issue)[] {
  return CLEAN_017.check(makeDoc(html), OPTIONS) as (AutoAppliedChange | Issue)[];
}

function isAutoApply(item: AutoAppliedChange | Issue): item is AutoAppliedChange {
  return !('severity' in item);
}

function isIssue(item: AutoAppliedChange | Issue): item is Issue {
  return 'severity' in item;
}

// ─── Detection: text normalization ───────────────────────────────────────────

describe('CLEAN-017: text normalization detection', () => {
  it('flags "grants.gov" link text against canonical URL', () => {
    const results = check('<p><a href="https://www.grants.gov">grants.gov</a></p>');
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-017');
    expect(change.targetField).toBe('link.grantsgov.normalize');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 Grants.gov link');
  });

  it('flags "www.grants.gov" link text', () => {
    const results = check('<p><a href="https://www.grants.gov">www.grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('flags "GRANTS.GOV" link text (case-insensitive)', () => {
    const results = check('<p><a href="https://www.grants.gov">GRANTS.GOV</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('does not flag a link with custom text and canonical URL', () => {
    expect(check('<p><a href="https://www.grants.gov">Apply for funding</a></p>')).toHaveLength(0);
  });

  it('does not flag when text is already "Grants.gov" and URL is canonical', () => {
    expect(check('<p><a href="https://www.grants.gov">Grants.gov</a></p>')).toHaveLength(0);
  });
});

// ─── Detection: URL normalization ────────────────────────────────────────────

describe('CLEAN-017: URL normalization detection', () => {
  it('flags http://grants.gov (insecure, no-www) with "Grants.gov" text', () => {
    const results = check('<p><a href="http://grants.gov">Grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('flags http://www.grants.gov (insecure) with "Grants.gov" text', () => {
    const results = check('<p><a href="http://www.grants.gov">Grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('flags https://grants.gov (no-www) with "Grants.gov" text', () => {
    const results = check('<p><a href="https://grants.gov">Grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('flags https://www.grants.gov/ (trailing slash) with "Grants.gov" text', () => {
    const results = check('<p><a href="https://www.grants.gov/">Grants.gov</a></p>');
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });
});

// ─── Detection: count multiple links ─────────────────────────────────────────

describe('CLEAN-017: counting', () => {
  it('counts multiple links needing normalization', () => {
    const results = check(
      '<p><a href="https://www.grants.gov">grants.gov</a></p>' +
      '<p><a href="http://grants.gov">Grants.gov</a></p>' +
      '<p><a href="https://grants.gov">www.grants.gov</a></p>'
    );
    const changes = results.filter(isAutoApply);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.value).toBe('3');
    expect(changes[0]!.description).toContain('3 Grants.gov links');
  });

  it('uses singular description for one link', () => {
    const results = check('<p><a href="https://www.grants.gov">grants.gov</a></p>');
    expect((results[0] as AutoAppliedChange).description).toContain('1 Grants.gov link.');
  });
});

// ─── Warning issues: specific-path and subdomain URLs ────────────────────────

describe('CLEAN-017: warning issues', () => {
  it('emits a warning Issue for a specific-path Grants.gov URL', () => {
    const results = check(
      '<p><a href="https://www.grants.gov/apply-for-grants">Apply</a></p>'
    );
    expect(results).toHaveLength(1);
    expect(isIssue(results[0]!)).toBe(true);
    const issue = results[0] as Issue;
    expect(issue.ruleId).toBe('CLEAN-017');
    expect(issue.severity).toBe('warning');
    expect(issue.title).toBe('Grants.gov URL may need updating');
    expect(issue.description).toContain('specific path');
    expect(issue.description).toContain('https://www.grants.gov/apply-for-grants');
    expect(issue.instructionOnly).toBe(true);
  });

  it('emits a warning Issue for a subdomain Grants.gov URL', () => {
    const results = check('<p><a href="https://apply.grants.gov">Apply</a></p>');
    expect(results).toHaveLength(1);
    const issue = results[0] as Issue;
    expect(issue.description).toContain('subdomain');
    expect(issue.description).toContain('https://apply.grants.gov');
  });

  it('emits one Issue per problematic link', () => {
    const results = check(
      '<p><a href="https://www.grants.gov/apply-for-grants">Apply</a></p>' +
      '<p><a href="https://apply.grants.gov">Portal</a></p>'
    );
    expect(results.filter(isIssue)).toHaveLength(2);
  });

  it('uses link text in the issue description', () => {
    const results = check('<p><a href="https://grants.gov/search">Find grants</a></p>');
    const issue = results[0] as Issue;
    expect(issue.description).toContain('Find grants');
  });

  it('falls back to URL in description when link text is empty', () => {
    const results = check('<p><a href="https://grants.gov/search"></a></p>');
    const issue = results[0] as Issue;
    expect(issue.description).toContain('https://grants.gov/search');
  });
});

// ─── Mixed: AutoAppliedChange + Issues in same document ──────────────────────

describe('CLEAN-017: mixed results', () => {
  it('returns both an AutoAppliedChange and an Issue when document has both cases', () => {
    const results = check(
      '<p><a href="https://www.grants.gov">grants.gov</a></p>' +
      '<p><a href="https://grants.gov/apply">Apply now</a></p>'
    );
    expect(results.filter(isAutoApply)).toHaveLength(1);
    expect(results.filter(isIssue)).toHaveLength(1);
    expect(results.filter(isAutoApply)[0]!.targetField).toBe('link.grantsgov.normalize');
  });

  it('places the AutoAppliedChange first in the results array', () => {
    const results = check(
      '<p><a href="https://grants.gov/apply">Apply</a></p>' +
      '<p><a href="https://www.grants.gov">grants.gov</a></p>'
    );
    expect(isAutoApply(results[0]!)).toBe(true);
  });
});

// ─── Exclusions ───────────────────────────────────────────────────────────────

describe('CLEAN-017: exclusions', () => {
  it('skips mailto: links (e.g. support@grants.gov)', () => {
    expect(check('<p><a href="mailto:support@grants.gov">Contact us</a></p>')).toHaveLength(0);
  });

  it('skips internal anchor links', () => {
    expect(check('<p><a href="#grants-section">Grants.gov</a></p>')).toHaveLength(0);
  });

  it('skips non-grants.gov external links', () => {
    expect(check('<p><a href="https://www.example.com">Example</a></p>')).toHaveLength(0);
  });

  it('skips links that share a domain superficially but are not grants.gov', () => {
    expect(check('<p><a href="https://www.notgrants.gov">Not Grants</a></p>')).toHaveLength(0);
  });

  it('returns empty array for empty HTML', () => {
    expect(check('')).toHaveLength(0);
  });
});
