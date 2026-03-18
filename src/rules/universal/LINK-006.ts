import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-006: Internal bookmark links
 *
 * Three-tier resolution:
 *  1. Exact match   — anchor ID exists in the document → no issue
 *  2. Fuzzy match   — normalized anchor matches exactly one heading/bookmark
 *                     → user-confirmed issue with pre-filled suggested anchor
 *  3. No match      — unresolvable → instructionOnly broken-link issue
 */
const LINK_006: Rule = {
  id: 'LINK-006',
  autoApply: false,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (Issue | AutoAppliedChange)[] {
    const results: (Issue | AutoAppliedChange)[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const bookmarkLinks = Array.from(htmlDoc.querySelectorAll('a[href^="#"]'));

    // Cache fuzzy-match results per anchor to avoid repeating expensive DOM work
    const fuzzyMatchCache = new Map<string, string | null>();

    bookmarkLinks.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const anchor = href.slice(1); // strip leading #
      const linkText = (link.textContent ?? '').trim();

      // Tier 1: exact match — anchor ID exists in the parsed HTML
      if (htmlDoc.getElementById(anchor) !== null) return;

      // Tier 2: fuzzy match
      if (!fuzzyMatchCache.has(anchor)) {
        fuzzyMatchCache.set(anchor, findFuzzyMatch(anchor, htmlDoc));
      }
      const fuzzy = fuzzyMatchCache.get(anchor);

      if (fuzzy !== null) {
        const sectionId = findSectionForElement(link, doc);
        results.push({
          id: `LINK-006-${index}`,
          ruleId: 'LINK-006',
          title: 'Internal link anchor may need updating',
          severity: 'warning',
          sectionId,
          location: href,
          description:
            `The link "${linkText}" points to "#${anchor}" which was not found verbatim. ` +
            `A likely match was found: "#${fuzzy}". ` +
            `Accept to retarget the link, or skip to leave it unchanged.`,
          suggestedFix: `Retarget "#${anchor}" → "#${fuzzy}"`,
          inputRequired: {
            type: 'text',
            label: 'Replacement anchor',
            fieldDescription: `Current anchor: #${anchor}`,
            prefill: fuzzy,
            prefillNote: 'Matched by normalizing the anchor against heading text in the document. Edit if needed.',
            targetField: `link.bookmark.${anchor}`,
            validationPattern: '^[^#]*$',
            validationHint: 'Enter the bookmark ID without the leading "#".',
          },
        } as Issue);
        return;
      }

      // Tier 3: no match — broken link
      const sectionId = findSectionForElement(link, doc);
      results.push({
        id: `LINK-006-${index}`,
        ruleId: 'LINK-006',
        title: 'Internal bookmark link target not found',
        severity: 'warning',
        sectionId,
        description: `The link "${linkText}" points to "#${anchor}" but no matching anchor was found in the document. This link may be broken.`,
        suggestedFix: 'Verify the bookmark exists in the document, or update the link to point to the correct section.',
        location: href,
        instructionOnly: true,
      } as Issue);
    });

    return results;
  },
};

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/** Normalize an anchor or heading text for fuzzy comparison. */
function normalizeAnchor(value: string): string {
  return value
    .replace(/^_+/, '')           // strip leading underscores
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // replace special chars with space
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim();
}

/**
 * Try to find exactly one heading or existing element ID in `htmlDoc` whose
 * normalized form matches the normalized form of `anchor`.
 *
 * Returns the original (un-normalized) ID/anchor of the match if exactly one
 * candidate matches, or `null` if zero or more than one match.
 */
function findFuzzyMatch(anchor: string, htmlDoc: Document): string | null {
  const normalizedAnchor = normalizeAnchor(anchor);
  if (!normalizedAnchor) return null;

  const candidates: { id: string; normalized: string }[] = [];

  // Collect all element IDs that exist in the document
  const allIds = Array.from(htmlDoc.querySelectorAll('[id]'))
    .map(el => el.getAttribute('id') ?? '')
    .filter(Boolean);

  for (const id of allIds) {
    candidates.push({ id, normalized: normalizeAnchor(id) });
  }

  // Also collect heading text mapped to real heading IDs (if present)
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  for (const h of headings) {
    const text = (h.textContent ?? '').trim();
    const headingId = h.getAttribute('id') ?? '';
    // Only consider headings that already have a real ID; do not synthesize new ones
    if (text && headingId && !candidates.some(c => c.id === headingId)) {
      candidates.push({ id: headingId, normalized: normalizeAnchor(text) });
    }
  }

  const matches = candidates.filter(c => c.normalized === normalizedAnchor);

  // Only suggest if exactly one candidate matches — avoid guessing when ambiguous
  if (matches.length === 1) return matches[0]?.id ?? null;
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LINK_006;
