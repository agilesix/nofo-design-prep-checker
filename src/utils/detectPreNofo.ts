/**
 * detectPreNofo
 *
 * Examines a parsed document's heading structure and filename for signals that
 * indicate the user has uploaded a pre-NOFO template rather than a content
 * guide. Two or more signals must be present before the document is flagged —
 * requiring multiple signals reduces false positives from edge-case documents
 * that contain one matching phrase for unrelated reasons.
 *
 * Signals checked (any two trigger detection):
 *  1. A heading containing "Pre-NOFO approval" (case-insensitive, any level)
 *  2. A heading containing "Pre-NOFO checklist" (case-insensitive, any level)
 *  3. A heading containing "Writing instructions" within the first 5 headings
 *  4. A heading containing "Relevant deadlines" within the first 3 headings
 *  5. Filename contains "pre-nofo" or "prenofo" (case-insensitive)
 */

export interface PreNofoDetectionResult {
  detected: boolean;
  /** Internal list of matched signal keys, useful for debugging. */
  signals: string[];
}

export function detectPreNofo(html: string, filename: string): PreNofoDetectionResult {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, 'text/html');
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headingTexts = headings.map(h => (h.textContent ?? '').trim());

  const signals: string[] = [];

  // Signal 1: any heading contains "Pre-NOFO approval"
  if (headingTexts.some(t => /pre-nofo approval/i.test(t))) {
    signals.push('heading:pre-nofo-approval');
  }

  // Signal 2: any heading contains "Pre-NOFO checklist"
  if (headingTexts.some(t => /pre-nofo checklist/i.test(t))) {
    signals.push('heading:pre-nofo-checklist');
  }

  // Signal 3: "Writing instructions" appears within the first 5 headings
  if (headingTexts.slice(0, 5).some(t => /writing instructions/i.test(t))) {
    signals.push('heading:writing-instructions-top5');
  }

  // Signal 4: "Relevant deadlines" appears within the first 3 headings
  if (headingTexts.slice(0, 3).some(t => /relevant deadlines/i.test(t))) {
    signals.push('heading:relevant-deadlines-top3');
  }

  // Signal 5: filename contains "pre-nofo" or "prenofo"
  if (/pre-?nofo/i.test(filename)) {
    signals.push('filename:pre-nofo');
  }

  return {
    detected: signals.length >= 2,
    signals,
  };
}
