import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-006: Internal bookmark links
 *
 * Three-tier resolution:
 *  1. Exact match   — anchor ID exists in the HTML or as an OOXML bookmark → no issue
 *  2. Fuzzy match   — normalized anchor compared against OOXML bookmark names and
 *                     HTML element IDs (exact equality after normalization), or
 *                     contained within any normalized heading text
 *     a. Exactly one match → user-confirmed issue with pre-filled suggestion
 *     b. Multiple matches  → instructionOnly issue asking user to resolve manually
 *  3. No match      — unresolvable → instructionOnly broken-link issue
 *
 * Fuzzy match candidate sources (in priority order):
 *  a. OOXML <w:bookmarkStart w:name="..."> entries from doc.documentXml
 *     — authoritative; returned verbatim as the suggested anchor
 *  b. HTML element IDs — mammoth maps Word bookmarks to id attributes
 *  c. HTML heading text — containment check: the normalized anchor must appear
 *     within the normalized heading text (e.g. "attachment 1" is found within
 *     "attachment 1 instructions for applicants")
 */

type FuzzyMatchResult =
  | { kind: 'single'; anchor: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

const LINK_006: Rule = {
  id: 'LINK-006',
  autoApply: false,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (Issue | AutoAppliedChange)[] {
    const results: (Issue | AutoAppliedChange)[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const bookmarkLinks = Array.from(htmlDoc.querySelectorAll('a[href^="#"]'));

    // Pre-parse OOXML once; passed to findFuzzyMatch to avoid re-parsing per anchor
    const xmlDoc = doc.documentXml
      ? parser.parseFromString(doc.documentXml, 'application/xml')
      : null;

    // Precompute exact OOXML bookmark names once to avoid O(links × bookmarks) scans
    const ooxmlBookmarkNames: Set<string> | null = xmlDoc
      ? new Set(
          Array.from(xmlDoc.getElementsByTagName('w:bookmarkStart'))
            .map((el) => el.getAttribute('w:name'))
            .filter((name): name is string => !!name)
        )
      : null;

    // Cache fuzzy results — the same broken anchor may appear in many links
    const fuzzyCache = new Map<string, FuzzyMatchResult>();

    bookmarkLinks.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const anchor = href.slice(1); // strip leading #
      const linkText = (link.textContent ?? '').trim();

      // Tier 1a: exact match — anchor ID exists in the parsed HTML
      if (htmlDoc.getElementById(anchor) !== null) return;

      // Tier 1b: exact match against OOXML bookmark names
      if (ooxmlBookmarkNames && ooxmlBookmarkNames.has(anchor)) return;

      // Tier 2: fuzzy match (result cached per anchor)
      if (!fuzzyCache.has(anchor)) {
        fuzzyCache.set(anchor, findFuzzyMatch(anchor, htmlDoc, xmlDoc));
      }
      const fuzzyResult = fuzzyCache.get(anchor)!;

      if (fuzzyResult.kind === 'single') {
        const fuzzy = fuzzyResult.anchor;
        const sectionId = findSectionForElement(link, doc);
        results.push({
          id: `LINK-006-${index}`,
          ruleId: 'LINK-006',
          title: 'Internal link anchor may need updating',
          severity: 'warning',
          sectionId,
          location: href,
          description:
            `The anchor "#${anchor}" wasn't found, but a likely match was found: "#${fuzzy}". ` +
            `Accept to update the link, or skip to leave it unchanged.`,
          suggestedFix: `Retarget "#${anchor}" → "#${fuzzy}"`,
          inputRequired: {
            type: 'text',
            label: 'Replacement anchor',
            fieldDescription: `Current anchor: #${anchor}`,
            prefill: fuzzy,
            prefillNote: 'Matched by normalizing the anchor against content in the document (e.g., bookmarks, IDs, or headings). Edit if needed.',
            targetField: `link.bookmark.${anchor}`,
          },
        } as Issue);
        return;
      }

      if (fuzzyResult.kind === 'ambiguous') {
        const sectionId = findSectionForElement(link, doc);
        results.push({
          id: `LINK-006-${index}`,
          ruleId: 'LINK-006',
          title: 'Internal link anchor is ambiguous',
          severity: 'warning',
          sectionId,
          location: href,
          description: `The anchor "#${anchor}" wasn't found, and multiple possible matches exist in the document. Resolve this link manually in Word before handoff.`,
          instructionOnly: true,
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

// ─── OOXML helpers ────────────────────────────────────────────────────────────

const ooxmlBookmarkNamesCache = new WeakMap<XMLDocument, string[]>();

function getOoxmlBookmarkNames(xmlDoc: XMLDocument): string[] {
  const cached = ooxmlBookmarkNamesCache.get(xmlDoc);
  if (cached) {
    return cached;
  }

  const names = Array.from(xmlDoc.getElementsByTagName('w:bookmarkStart'))
    .map(bm => bm.getAttribute('w:name') ?? '')
    .filter(name => name && name !== '_GoBack');

  ooxmlBookmarkNamesCache.set(xmlDoc, names);
  return names;
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/**
 * Normalize an anchor slug or heading text for fuzzy comparison:
 *  1. Lowercase
 *  2. Replace underscores and hyphens with spaces
 *  3. Strip remaining punctuation (non-alphanumeric, non-space characters)
 *  4. Collapse whitespace
 */
function normalizeAnchor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return a FuzzyMatchResult for `anchor`:
 *  - { kind: 'single', anchor } if exactly one candidate matches
 *  - { kind: 'ambiguous' } if more than one candidate matches
 *  - { kind: 'none' } if no candidates match
 *
 * Candidate sources tried in order:
 *  1. OOXML bookmark names  — exact equality after normalization
 *  2. HTML element IDs      — exact equality after normalization
 *  3. HTML heading text     — containment: normalized anchor must appear within
 *                              the normalized heading text (e.g. "attachment 1"
 *                              is found inside "attachment 1 background")
 *
 * For heading matches, the suggestion is the heading's own id when present,
 * otherwise the original anchor with leading underscores stripped.
 */
function findFuzzyMatch(
  anchor: string,
  htmlDoc: Document,
  xmlDoc: XMLDocument | null
): FuzzyMatchResult {
  const normalizedAnchor = normalizeAnchor(anchor);
  if (!normalizedAnchor) return { kind: 'none' };

  // ── Source 1: OOXML bookmark names ─────────────────────────────────────────
  if (xmlDoc) {
    const names = getOoxmlBookmarkNames(xmlDoc);
    const matches = names.filter(n => normalizeAnchor(n) === normalizedAnchor);
    if (matches.length === 1) return { kind: 'single', anchor: matches[0]! };
    if (matches.length > 1) return { kind: 'ambiguous' };
  }

  // ── Source 2: HTML element IDs (mammoth-mapped bookmarks) ──────────────────
  const allIds = Array.from(htmlDoc.querySelectorAll('[id]'))
    .map(el => el.getAttribute('id') ?? '')
    .filter(Boolean);

  const idMatches = allIds.filter(id => normalizeAnchor(id) === normalizedAnchor);
  if (idMatches.length === 1) return { kind: 'single', anchor: idMatches[0]! };
  if (idMatches.length > 1) return { kind: 'ambiguous' };

  // ── Source 3: HTML heading text (containment check) ─────────────────────────
  // The normalized anchor must be contained within the normalized heading text.
  // The suggested anchor prefers the heading's own id if mammoth assigned one;
  // otherwise falls back to the original anchor with leading underscores stripped.
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headingMatches: string[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? '').trim();
    if (!text) continue;
    if (!normalizeAnchor(text).includes(normalizedAnchor)) continue;

    const suggestion = h.getAttribute('id') ?? anchor.replace(/^_+/, '');
    if (!headingMatches.includes(suggestion)) {
      headingMatches.push(suggestion);
    }
  }

  if (headingMatches.length === 1) return { kind: 'single', anchor: headingMatches[0]! };
  if (headingMatches.length > 1) return { kind: 'ambiguous' };

  return { kind: 'none' };
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
