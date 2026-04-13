import { describe, it, expect } from 'vitest';
import { detectPreNofo } from '../detectPreNofo';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an HTML string from an array of heading texts (all h1 for simplicity). */
function makeHtml(headings: string[]): string {
  return headings.map(t => `<h1>${t}</h1>`).join('\n');
}

const CLEAN_FILENAME = 'nofo-draft.docx';

// ─── 2-signal threshold ───────────────────────────────────────────────────────

describe('2-signal threshold', () => {
  it('does not detect when no signals are present', () => {
    const result = detectPreNofo(makeHtml(['Introduction', 'Background']), CLEAN_FILENAME);
    expect(result.detected).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('does not detect when only the filename signal fires (1 signal)', () => {
    const result = detectPreNofo(makeHtml(['Introduction', 'Background']), 'pre-nofo-draft.docx');
    expect(result.detected).toBe(false);
    expect(result.signals).toEqual(['filename:pre-nofo']);
  });

  it('does not detect when only one heading signal fires (1 signal)', () => {
    const result = detectPreNofo(makeHtml(['Pre-NOFO approval', 'Background']), CLEAN_FILENAME);
    expect(result.detected).toBe(false);
    expect(result.signals).toEqual(['heading:pre-nofo-approval']);
  });

  it('detects when exactly 2 signals are present', () => {
    const result = detectPreNofo(
      makeHtml(['Pre-NOFO approval', 'Pre-NOFO checklist']),
      CLEAN_FILENAME,
    );
    expect(result.detected).toBe(true);
    expect(result.signals).toHaveLength(2);
  });

  it('detects when all 5 signals are present', () => {
    const html = makeHtml([
      'Relevant deadlines',     // position 1 — within first 3
      'Writing instructions',   // position 2 — within first 5
      'Pre-NOFO approval',
      'Pre-NOFO checklist',
      'Other content',
    ]);
    const result = detectPreNofo(html, 'prenofo-template.docx');
    expect(result.detected).toBe(true);
    expect(result.signals).toHaveLength(5);
  });
});

// ─── Signal 1: "Pre-NOFO approval" heading ───────────────────────────────────

describe('Signal 1 — "Pre-NOFO approval" heading', () => {
  it('fires regardless of heading level (uses querySelectorAll h1-h6)', () => {
    const html = '<h3>Pre-NOFO approval process</h3>';
    const result = detectPreNofo(html, 'pre-nofo.docx');
    expect(result.signals).toContain('heading:pre-nofo-approval');
  });

  it('matches case-insensitively', () => {
    const result = detectPreNofo(
      makeHtml(['PRE-NOFO APPROVAL', 'Pre-NOFO checklist']),
      CLEAN_FILENAME,
    );
    expect(result.detected).toBe(true);
    expect(result.signals).toContain('heading:pre-nofo-approval');
  });

  it('does not fire on a partial match like "NOFO approval"', () => {
    const result = detectPreNofo(makeHtml(['NOFO approval', 'Background']), CLEAN_FILENAME);
    expect(result.signals).not.toContain('heading:pre-nofo-approval');
  });
});

// ─── Signal 2: "Pre-NOFO checklist" heading ──────────────────────────────────

describe('Signal 2 — "Pre-NOFO checklist" heading', () => {
  it('fires regardless of case', () => {
    const result = detectPreNofo(
      makeHtml(['Pre-NOFO approval', 'pre-nofo checklist items']),
      CLEAN_FILENAME,
    );
    expect(result.detected).toBe(true);
    expect(result.signals).toContain('heading:pre-nofo-checklist');
  });

  it('does not fire on "NOFO checklist" without the pre- prefix', () => {
    const result = detectPreNofo(makeHtml(['NOFO checklist', 'Background']), CLEAN_FILENAME);
    expect(result.signals).not.toContain('heading:pre-nofo-checklist');
  });
});

// ─── Signal 3: "Writing instructions" within first 5 headings ────────────────

describe('Signal 3 — "Writing instructions" within first 5 headings', () => {
  it('fires when "Writing instructions" is the first heading', () => {
    const result = detectPreNofo(
      makeHtml(['Writing instructions', 'Background']),
      'pre-nofo.docx',
    );
    expect(result.signals).toContain('heading:writing-instructions-top5');
    expect(result.detected).toBe(true);
  });

  it('fires when "Writing instructions" is at heading position 5 (the boundary)', () => {
    const result = detectPreNofo(
      makeHtml([
        'Introduction',
        'Background',
        'Purpose',
        'Eligibility',
        'Writing instructions',   // position 5 — still inside the window
      ]),
      'pre-nofo.docx',
    );
    expect(result.signals).toContain('heading:writing-instructions-top5');
    expect(result.detected).toBe(true);
  });

  it('does NOT fire when "Writing instructions" is at heading position 6', () => {
    const result = detectPreNofo(
      makeHtml([
        'Introduction',
        'Background',
        'Purpose',
        'Eligibility',
        'Overview',
        'Writing instructions',   // position 6 — outside the top-5 window
      ]),
      'pre-nofo.docx',             // provides the only other signal
    );
    // Filename fires but the writing-instructions heading does not,
    // so only 1 signal total → not detected.
    expect(result.signals).not.toContain('heading:writing-instructions-top5');
    expect(result.detected).toBe(false);
  });

  it('matches case-insensitively', () => {
    const result = detectPreNofo(
      makeHtml(['WRITING INSTRUCTIONS', 'Pre-NOFO approval']),
      CLEAN_FILENAME,
    );
    expect(result.signals).toContain('heading:writing-instructions-top5');
    expect(result.detected).toBe(true);
  });
});

// ─── Signal 4: "Relevant deadlines" within first 3 headings ──────────────────

describe('Signal 4 — "Relevant deadlines" within first 3 headings', () => {
  it('fires when "Relevant deadlines" is the first heading', () => {
    const result = detectPreNofo(
      makeHtml(['Relevant deadlines', 'Background']),
      'pre-nofo.docx',
    );
    expect(result.signals).toContain('heading:relevant-deadlines-top3');
    expect(result.detected).toBe(true);
  });

  it('fires when "Relevant deadlines" is at heading position 3 (the boundary)', () => {
    const result = detectPreNofo(
      makeHtml([
        'Introduction',
        'Background',
        'Relevant deadlines',   // position 3 — still inside the window
      ]),
      'pre-nofo.docx',
    );
    expect(result.signals).toContain('heading:relevant-deadlines-top3');
    expect(result.detected).toBe(true);
  });

  it('does NOT fire when "Relevant deadlines" is at heading position 4', () => {
    const result = detectPreNofo(
      makeHtml([
        'Introduction',
        'Background',
        'Purpose',
        'Relevant deadlines',   // position 4 — outside the top-3 window
      ]),
      'pre-nofo.docx',            // provides the only other signal
    );
    // Filename fires but the relevant-deadlines heading does not,
    // so only 1 signal total → not detected.
    expect(result.signals).not.toContain('heading:relevant-deadlines-top3');
    expect(result.detected).toBe(false);
  });

  it('matches case-insensitively', () => {
    const result = detectPreNofo(
      makeHtml(['RELEVANT DEADLINES', 'Pre-NOFO approval']),
      CLEAN_FILENAME,
    );
    expect(result.signals).toContain('heading:relevant-deadlines-top3');
    expect(result.detected).toBe(true);
  });
});

// ─── Signal 5: filename ───────────────────────────────────────────────────────

describe('Signal 5 — filename', () => {
  it('fires for "pre-nofo" in the filename (hyphenated)', () => {
    const result = detectPreNofo(makeHtml(['Pre-NOFO approval']), 'pre-nofo-v2.docx');
    expect(result.signals).toContain('filename:pre-nofo');
    expect(result.detected).toBe(true);
  });

  it('fires for "prenofo" in the filename (no hyphen)', () => {
    const result = detectPreNofo(makeHtml(['Pre-NOFO approval']), 'prenofo-template.docx');
    expect(result.signals).toContain('filename:pre-nofo');
    expect(result.detected).toBe(true);
  });

  it('matches filename case-insensitively', () => {
    const result = detectPreNofo(makeHtml(['Pre-NOFO approval']), 'Pre-NOFO.docx');
    expect(result.signals).toContain('filename:pre-nofo');
    expect(result.detected).toBe(true);
  });

  it('does not fire for a filename that merely contains "nofo"', () => {
    const result = detectPreNofo(makeHtml(['Introduction', 'Background']), 'nofo-draft.docx');
    expect(result.signals).not.toContain('filename:pre-nofo');
  });

  it('filename alone (1 signal) does not trigger detection', () => {
    const result = detectPreNofo(makeHtml(['Introduction', 'Background']), 'pre-nofo-draft.docx');
    expect(result.detected).toBe(false);
  });
});
