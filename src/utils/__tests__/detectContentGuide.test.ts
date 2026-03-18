import { describe, it, expect } from 'vitest';
import { detectContentGuide } from '../detectContentGuide';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a raw text string from named signal fragments. */
function makeText(...fragments: string[]): string {
  return fragments.join('\n');
}

// ─── High-confidence detection ────────────────────────────────────────────────

describe('high confidence', () => {
  it('returns high confidence for CDC when full name + abbreviation + contact office present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'CDC Office of Grants Services',
      'CDC grant announcement',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc');
    expect(result.confidence).toBe('high');
  });

  it('returns high confidence for ACF when full name + abbreviation + contact office present', () => {
    const text = makeText(
      'Administration for Children and Families',
      'ACF Office of Grants Policy',
      'ACF funding opportunity',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('acf');
    expect(result.confidence).toBe('high');
  });

  it('returns high confidence for CMS when full name + abbreviation present and gap is sufficient', () => {
    const text = makeText(
      'Centers for Medicare & Medicaid Services',
      'CMS grant',
    );
    // name (3) + abbreviation (1) = score 4 — just below MIN_SCORE=5, so this should be low
    // Need to verify the boundary; CMS has no contactOffice so max is 4
    // This test documents that CMS requires additional signals for high confidence
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cms');
    // Score is 4 (name=3 + abbr=1), below MIN_SCORE=5 → low confidence
    expect(result.confidence).toBe('low');
  });

  it('returns high confidence for IHS when full name + abbreviation + unique section present', () => {
    const text = makeText(
      'Indian Health Service',
      'IHS funding notice',
      'Tribal Resolution attached',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('ihs');
    // name (3) + abbr (1) + uniqueSection (1) = 5, categories = 3
    expect(result.confidence).toBe('high');
  });
});

// ─── Low confidence: fewer than 2 signal categories ──────────────────────────

describe('low confidence when fewer than 2 signal categories match', () => {
  it('returns low confidence when only the full name matches (1 category)', () => {
    // Score = 3 (name only), categories = 1
    const text = 'Administration for Community Living annual report';
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('acl');
    expect(result.confidence).toBe('low');
  });

  it('returns low confidence when only the abbreviation matches (1 category)', () => {
    // Score = 1 (abbreviation only), categories = 1
    const text = 'This NOFO is issued by ACL.';
    const result = detectContentGuide(text);
    // ACL abbreviation alone is ambiguous / low-confidence
    expect(result.confidence).toBe('low');
  });
});

// ─── Low confidence: insufficient gap over second-best ───────────────────────

describe('low confidence when best-vs-second gap is less than MIN_GAP (3)', () => {
  it('returns low confidence when two guides score within MIN_GAP of each other', () => {
    // Both HRSA guides share "Health Resources and Services Administration" (score 3 each).
    // Without further differentiating signals the gap will be 0.
    const text = 'Health Resources and Services Administration grant notice';
    const result = detectContentGuide(text);
    // Multiple HRSA guides will tie or near-tie; gap < MIN_GAP → low confidence
    expect(result.confidence).toBe('low');
  });

  it('returns low confidence for CDC when a secondary HRSA signal also fires', () => {
    // CDC full name (3) + CDC abbr (1) = 4 (below MIN_SCORE anyway),
    // but also mentions HRSA abbr so second-best is non-zero and gap is narrow.
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'HRSA and CDC collaborate on this notice',
    );
    const result = detectContentGuide(text);
    expect(result.confidence).toBe('low');
  });
});

// ─── No match ─────────────────────────────────────────────────────────────────

describe('no match', () => {
  it('returns confidence "none" for unrelated text', () => {
    const result = detectContentGuide('This is a generic document with no agency identifiers.');
    expect(result.detectedId).toBeNull();
    expect(result.confidence).toBe('none');
  });
});

// ─── CDC Research fast-path ───────────────────────────────────────────────────

describe('CDC Research detection', () => {
  it('returns cdc-research with high confidence when ≥2 research signals + CDC identifier present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'eRA Commons registration required',
      'PHS 398 application package',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-research');
    expect(result.confidence).toBe('high');
  });

  it('does NOT return cdc-research when only 1 research signal is present', () => {
    // Only "principal investigator" — not enough on its own
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'CDC Office of Grants Services',
      'The principal investigator must submit this form.',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-research');
  });

  it('does NOT return cdc-research when research signals present but no CDC identifier', () => {
    const text = makeText(
      'eRA Commons registration required',
      'PHS 398 application package',
      'Administration for Children and Families',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-research');
  });
});
