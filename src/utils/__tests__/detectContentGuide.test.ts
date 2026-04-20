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

  it('returns low confidence for CMS when full name + abbreviation present and gap is sufficient', () => {
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

// ─── CDC/DGHT fast-path ───────────────────────────────────────────────────────

describe('CDC/DGHT detection', () => {
  it('detects cdc-dght-competitive when DGHT + competitive signal + CDC identifier present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'DGHT funding opportunity',
      'This is a competitive grant.',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dght-competitive');
    expect(result.confidence).toBe('high');
  });

  it('detects cdc-dght-competitive when DGHT + "Build Your Application" + CDC identifier present', () => {
    const text = makeText(
      'CDC grant announcement',
      'DGHT program',
      'Build Your Application',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dght-competitive');
    expect(result.confidence).toBe('high');
  });

  it('detects cdc-dght-ssj when DGHT + SSJ + CDC identifier present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'DGHT SSJ program',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dght-ssj');
    expect(result.confidence).toBe('high');
  });

  it('detects cdc-dght-ssj when DGHT + "Prepare Your Application" + CDC identifier present', () => {
    const text = makeText(
      'CDC DGHT program',
      'Prepare Your Application',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dght-ssj');
    expect(result.confidence).toBe('high');
  });

  it('prefers cdc-dght-competitive over cdc-dght-ssj when both signals present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'DGHT competitive and SSJ program',
      'Prepare Your Application or Build Your Application',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dght-competitive');
  });

  it('does NOT detect a DGHT guide without a CDC identifier', () => {
    const text = makeText(
      'Administration for Children and Families',
      'DGHT SSJ program',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-dght-ssj');
    expect(result.detectedId).not.toBe('cdc-dght-competitive');
  });

  it('does NOT detect a DGHT guide with CDC identifier but no DGHT/SSJ/competitive signal', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'CDC Office of Grants Services',
      'DGHT program',
    );
    const result = detectContentGuide(text);
    // Falls through to general scoring → cdc
    expect(result.detectedId).not.toBe('cdc-dght-ssj');
    expect(result.detectedId).not.toBe('cdc-dght-competitive');
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

// ─── CDC DGHP fast-path ───────────────────────────────────────────────────────

describe('CDC DGHP detection', () => {
  it('detects cdc-dghp with high confidence when ≥2 DGHP signals + CDC identifier present', () => {
    const text = makeText(
      'CDC/DGHP funding opportunity',
      'DGHP NOFO Tracker submission required',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dghp');
    expect(result.confidence).toBe('high');
  });

  it('detects cdc-dghp via "DGHP-SPECIFIC INSTRUCTIONS" + "DGHP Basic Information" + CDC identifier', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'DGHP-SPECIFIC INSTRUCTIONS for this section',
      'DGHP Basic Information block',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dghp');
    expect(result.confidence).toBe('high');
  });

  it('detects cdc-dghp via "Global Health Security (GHS)" + "DGHP NOFO Tracker" + CDC identifier', () => {
    const text = makeText(
      'CDC competitive award',
      'Global Health Security (GHS) activities',
      'DGHP NOFO Tracker reference',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dghp');
    expect(result.confidence).toBe('high');
  });

  it('reports the matched signal labels in the signals array', () => {
    const text = makeText(
      'CDC/DGHP competitive award',
      'DGHP NOFO Tracker reference',
    );
    const result = detectContentGuide(text);
    expect(result.signals).toContain('CDC/DGHP identifier detected');
    expect(result.signals).toContain('DGHP NOFO Tracker detected');
  });

  it('does NOT detect cdc-dghp when only 1 DGHP signal is present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'CDC Office of Grants Services',
      'DGHP NOFO Tracker reference',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-dghp');
  });

  it('does NOT detect cdc-dghp when 0 DGHP signals are present', () => {
    const text = makeText(
      'Centers for Disease Control and Prevention',
      'CDC Office of Grants Services',
      'CDC grant announcement',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-dghp');
  });

  it('does NOT detect cdc-dghp when DGHP signals are present but no CDC identifier', () => {
    const text = makeText(
      'Administration for Children and Families',
      'DGHP-SPECIFIC INSTRUCTIONS for this section',
      'DGHP Basic Information block',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).not.toBe('cdc-dghp');
  });

  it('detects cdc-dghp before DGHT fast-path when DGHP signals are present', () => {
    const text = makeText(
      'CDC/DGHP competitive award',
      'DGHP NOFO Tracker',
      'DGHT program reference',
    );
    const result = detectContentGuide(text);
    expect(result.detectedId).toBe('cdc-dghp');
  });
});
