import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-013: Unfilled placeholder text (warning)
 *
 * Finds any occurrence of the pattern {Insert...} in the document body —
 * specifically, text enclosed in curly braces that contains the word "insert"
 * (case-insensitive). These are template placeholders that must be replaced
 * with real content before the document is imported into NOFO Builder.
 *
 * Detection:
 *  - Regex: /\{[^{}]*insert[^{}]*\}/gi
 *  - Each match is captured with the text of the nearest preceding heading
 *    so the user knows where in the document each placeholder lives.
 *  - Duplicate (placeholder, nearestHeading) pairs are shown only once
 *    to keep the list concise.
 *
 * Exclusions:
 *  - Paragraphs that start with a metadata field label (Metadata author:,
 *    Metadata subject:, Metadata keywords:, Author:, Subject:, Keywords:)
 *    — these are already surfaced by META-001, META-002, and META-003.
 *  - Content inside single-cell tables, which are treated as instructional
 *    callout boxes and may contain placeholder-style language intentionally.
 *
 * Issue presentation:
 *  - A single grouped issue card (instructionOnly: true) — no auto-fix.
 *  - Severity: warning.
 *  - The description lists each unique (placeholder, nearest heading) pair.
 */

const PLACEHOLDER_RE = /\{[^{}]*insert[^{}]*\}/gi;

const META_PREFIX_RE = /^(metadata\s+(author|subject|keywords)|author|subject|keywords)\s*:/i;

/**
 * Return true if the element (or any ancestor) is inside a single-cell table.
 * Single-cell tables are treated as callout boxes and are excluded from the check.
 */
function isInSingleCellTable(el: Element): boolean {
  const table = el.closest('table');
  if (!table) return false;
  return table.querySelectorAll('td, th').length === 1;
}

const CLEAN_013: Rule = {
  id: 'CLEAN-013',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    if (!doc.html) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Walk headings and content paragraphs in document order.
    const elements = Array.from(
      htmlDoc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th')
    );

    let nearestHeading: string | null = null;
    // Track unique (placeholder, heading) pairs to avoid listing duplicates.
    const seen = new Set<string>();
    const findings: Array<{ placeholder: string; heading: string | null }> = [];

    for (const el of elements) {
      const tag = el.tagName.toLowerCase();

      // Update the nearest heading tracker.
      if (/^h[1-6]$/.test(tag)) {
        nearestHeading = (el.textContent ?? '').trim() || null;
        continue;
      }

      // Skip content inside single-cell tables (callout boxes).
      if (isInSingleCellTable(el)) continue;

      const text = (el.textContent ?? '').trim();
      if (!text) continue;

      // Skip metadata field paragraphs — handled by META-001/002/003.
      if (META_PREFIX_RE.test(text)) continue;

      // Find all placeholder matches in this element's text.
      const matches = text.matchAll(PLACEHOLDER_RE);
      for (const match of matches) {
        const placeholder = match[0]!;
        const key = `${placeholder}||${nearestHeading ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ placeholder, heading: nearestHeading });
      }
    }

    if (findings.length === 0) return [];

    const listLines = findings.map(({ placeholder, heading }) =>
      heading ? `${placeholder} — Near: ${heading}` : placeholder
    );

    const description =
      'The following placeholder(s) were found in your document and need to be replaced ' +
      'with real content before importing into NOFO Builder:\n\n' +
      listLines.join('\n');

    return [
      {
        id: 'CLEAN-013-placeholders',
        ruleId: 'CLEAN-013',
        title: 'Unfilled placeholder text found',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description,
        instructionOnly: true,
      },
    ];
  },
};

export default CLEAN_013;
