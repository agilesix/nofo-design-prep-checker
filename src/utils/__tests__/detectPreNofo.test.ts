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

// ─── Signal 3: "NOFO content" as H1 ──────────────────────────────────────────

describe('Signal 3 — "NOFO content" as H1', () => {
  it('fires when an H1 heading contains "NOFO content"', () => {
    const result = detectPreNofo('<h1>NOFO content</h1>', 'pre-nofo.docx');
    expect(result.signals).toContain('heading:nofo-content-h1');
    expect(result.detected).toBe(true);
  });

  it('does NOT fire when "NOFO content" appears only in a non-H1 heading', () => {
    const result = detectPreNofo(
      '<h2>NOFO content</h2><h1>Other heading</h1>',
      'pre-nofo.docx',
    );
    expect(result.signals).not.toContain('heading:nofo-content-h1');
  });

  it('matches case-insensitively', () => {
    const result = detectPreNofo('<h1>nofo content overview</h1>', 'pre-nofo.docx');
    expect(result.signals).toContain('heading:nofo-content-h1');
  });
});

// ─── Signal 4: "Sole Source Justification" in body ───────────────────────────

describe('Signal 4 — "Sole Source Justification" in body text', () => {
  it('fires when "Sole Source Justification" appears in a paragraph', () => {
    const html = '<h1>Introduction</h1><p>This is a Sole Source Justification document.</p>';
    const result = detectPreNofo(html, 'pre-nofo.docx');
    expect(result.signals).toContain('body:sole-source-justification');
    expect(result.detected).toBe(true);
  });

  it('fires when "Sole Source Justification" appears in a heading', () => {
    const html = '<h2>Sole Source Justification</h2>';
    const result = detectPreNofo(html, 'pre-nofo.docx');
    expect(result.signals).toContain('body:sole-source-justification');
  });

  it('matches case-insensitively', () => {
    const html = '<p>sole source justification for this award</p>';
    const result = detectPreNofo(html, 'pre-nofo.docx');
    expect(result.signals).toContain('body:sole-source-justification');
  });
});

// ─── Step 1 exclusion guard ───────────────────────────────────────────────────

describe('Step 1 exclusion guard', () => {
  it('suppresses detection when a "Step 1" heading is present, even with 2+ signals', () => {
    const html = makeHtml([
      'Pre-NOFO approval',
      'Pre-NOFO checklist',
      'Step 1: Review the Opportunity',
    ]);
    const result = detectPreNofo(html, CLEAN_FILENAME);
    expect(result.detected).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('suppresses detection case-insensitively ("STEP 1")', () => {
    const html = makeHtml([
      'Pre-NOFO approval',
      'Pre-NOFO checklist',
      'STEP 1: review the opportunity',
    ]);
    const result = detectPreNofo(html, CLEAN_FILENAME);
    expect(result.detected).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('does not suppress detection when no Step 1 heading is present', () => {
    const html = makeHtml(['Pre-NOFO approval', 'Pre-NOFO checklist']);
    const result = detectPreNofo(html, CLEAN_FILENAME);
    expect(result.detected).toBe(true);
  });
});

// ─── Signal 7: filename (formerly Signal 5) ───────────────────────────────────

describe('Signal 7 — filename', () => {
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

// ─── Integration: CDC/DGHT SSJ pre-NOFO (South Africa / Ethiopia) ─────────────

describe('Integration — CDC/DGHT SSJ pre-NOFO (South Africa / Ethiopia pattern)', () => {
  it('detects an SSJ pre-NOFO with "NOFO content" H1 and "Sole Source Justification"', () => {
    const html = [
      '<h1>NOFO content</h1>',
      '<p>This document serves as a Sole Source Justification for the award.</p>',
      '<h2>Writing instructions</h2>',
    ].join('\n');
    const result = detectPreNofo(html, 'ethiopia-ssj.docx');
    expect(result.detected).toBe(true);
    expect(result.signals).toContain('heading:nofo-content-h1');
    expect(result.signals).toContain('body:sole-source-justification');
  });

  it('detects with SSJ body text alone paired with a filename signal', () => {
    const html = '<p>This is a Sole Source Justification for a sole-source award.</p>';
    const result = detectPreNofo(html, 'south-africa-pre-nofo.docx');
    expect(result.detected).toBe(true);
  });
});

// ─── Integration: Haiti CDC/DGHT content guide (must NOT be flagged) ─────────

describe('Integration — Haiti CDC/DGHT content guide (not a pre-NOFO)', () => {
  it('does not detect when a "Step 1" heading is present despite other matching content', () => {
    const html = [
      '<p>Here is the color coding for the doc:</p>',
      '<h1>CDC/DGHT NOFO Content Guide</h1>',
      '<h2>Step 1: Review the Opportunity</h2>',
      '<p>Sole Source Justification language that should be ignored.</p>',
    ].join('\n');
    const result = detectPreNofo(html, 'Haiti_JG-26-0141.docx');
    expect(result.detected).toBe(false);
    expect(result.signals).toHaveLength(0);
  });
});

// ─── Integration: original DGHP/PEPFAR pre-NOFO (still flagged) ──────────────

describe('Integration — original DGHP/PEPFAR pre-NOFO (still flagged)', () => {
  it('detects a classic DGHP pre-NOFO with approval + checklist headings', () => {
    const html = makeHtml(['Pre-NOFO approval', 'Pre-NOFO checklist', 'Background', 'Eligibility']);
    const result = detectPreNofo(html, 'dghp-pre-nofo.docx');
    expect(result.detected).toBe(true);
    expect(result.signals).toContain('heading:pre-nofo-approval');
    expect(result.signals).toContain('heading:pre-nofo-checklist');
  });

  it('detects a PEPFAR pre-NOFO with writing instructions + relevant deadlines', () => {
    const html = makeHtml(['Relevant deadlines', 'Writing instructions', 'Background']);
    const result = detectPreNofo(html, 'pepfar-content-guide.docx');
    expect(result.detected).toBe(true);
    expect(result.signals).toContain('heading:relevant-deadlines-top3');
    expect(result.signals).toContain('heading:writing-instructions-top5');
  });
});
