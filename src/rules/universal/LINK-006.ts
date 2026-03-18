import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-006: Internal bookmark links
 *
 * Three-tier resolution:
 *  1. Exact match   — anchor ID exists in the HTML or as an OOXML bookmark → no issue
 *  2. Fuzzy match   — normalized anchor matches exactly one OOXML bookmark name or
 *                     heading text → user-confirmed issue with pre-filled suggestion
 *  3. No match      — unresolvable → instructionOnly broken-link issue
 *
 * Fuzzy match candidate sources (in priority order):
 *  a. OOXML <w:bookmarkStart w:name="..."> entries from doc.documentXml
 *     — authoritative; returned verbatim as the suggested anchor
 *  b. HTML element IDs — mammoth maps Word bookmarks to id attributes
 *  c. HTML heading text — for documents with no explicit bookmarks;
 *     the suggestion is the anchor with leading underscores stripped
 *     (e.g. _Eligibility → Eligibility, _Maintenance_of_effort → Maintenance_of_effort)
 */
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

    // Cache fuzzy results — the same broken anchor may appear in many links
    const fuzzyCache = new Map<string, string | null>();

    bookmarkLinks.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const anchor = href.slice(1); // strip leading #
      const linkText = (link.textContent ?? '').trim();

      // Tier 1a: exact match — anchor ID exists in the parsed HTML
      if (htmlDoc.getElementById(anchor) !== null) return;

      // Tier 1b: exact match against OOXML bookmark names
      if (xmlDoc && ooxmlBookmarkExists(anchor, xmlDoc)) return;

      // Tier 2: fuzzy match (result cached per anchor)
      if (!fuzzyCache.has(anchor)) {
        fuzzyCache.set(anchor, findFuzzyMatch(anchor, htmlDoc, xmlDoc));
      }
      const fuzzy = fuzzyCache.get(anchor) ?? null;

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
            `The anchor "#${anchor}" wasn\u2019t found, but a likely match was found: "#${fuzzy}". ` +
            `Accept to update the link, or skip to leave it unchanged.`,
          suggestedFix: `Retarget "#${anchor}" \u2192 "#${fuzzy}"`,
          inputRequired: {
            type: 'text',
            label: 'Replacement anchor',
            fieldDescription: `Current anchor: #${anchor}`,
            prefill: fuzzy,
            prefillNote: 'Matched by normalizing the anchor against bookmark names in the document. Edit if needed.',
            targetField: `link.bookmark.${anchor}`,
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

// ─── OOXML helpers ────────────────────────────────────────────────────────────

function ooxmlBookmarkExists(name: string, xmlDoc: XMLDocument): boolean {
  return Array.from(xmlDoc.getElementsByTagName('w:bookmarkStart'))
    .some(bm => bm.getAttribute('w:name') === name);
}

function getOoxmlBookmarkNames(xmlDoc: XMLDocument): string[] {
  return Array.from(xmlDoc.getElementsByTagName('w:bookmarkStart'))
    .map(bm => bm.getAttribute('w:name') ?? '')
    .filter(name => name && name !== '_GoBack');
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/**
 * Normalize an anchor or text value for fuzzy comparison:
 *  1. Strip leading underscores   (_Eligibility → Eligibility)
 *  2. Replace remaining non-alphanumeric chars (incl. underscores) with spaces
 *     (Maintenance_of_effort → Maintenance of effort)
 *  3. Lowercase and collapse whitespace
 */
function normalizeAnchor(value: string): string {
  return value
    .replace(/^_+/, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return a suggested replacement anchor for `anchor`, or null if no single
 * confident match is found.
 *
 * Candidate sources tried in order:
 *  1. OOXML bookmark names  — returned verbatim (preserves original casing)
 *  2. HTML element IDs      — returned verbatim
 *  3. HTML heading text     — anchor with leading underscores stripped is returned
 *                             (e.g. _Eligibility → Eligibility)
 *
 * If more than one candidate matches the normalized form, returns null to
 * avoid making an ambiguous suggestion.
 */
function findFuzzyMatch(
  anchor: string,
  htmlDoc: Document,
  xmlDoc: XMLDocument | null
): string | null {
  const normalizedAnchor = normalizeAnchor(anchor);
  if (!normalizedAnchor) return null;

  // ── Source 1: OOXML bookmark names ─────────────────────────────────────────
  if (xmlDoc) {
    const names = getOoxmlBookmarkNames(xmlDoc);
    const matches = names.filter(n => normalizeAnchor(n) === normalizedAnchor);
    if (matches.length === 1) return matches[0] ?? null;
    if (matches.length > 1) return null; // ambiguous — don't guess
  }

  // ── Source 2: HTML element IDs (mammoth-mapped bookmarks) ──────────────────
  const allIds = Array.from(htmlDoc.querySelectorAll('[id]'))
    .map(el => el.getAttribute('id') ?? '')
    .filter(Boolean);

  const idMatches = allIds.filter(id => normalizeAnchor(id) === normalizedAnchor);
  if (idMatches.length === 1) return idMatches[0] ?? null;
  if (idMatches.length > 1) return null; // ambiguous

  // ── Source 3: HTML heading text ─────────────────────────────────────────────
  // Match heading text after normalization. The suggested anchor is the original
  // anchor with leading underscores stripped — this matches the Word convention
  // where _X is the auto-generated internal name for bookmark X.
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  // Collect unique normalized heading texts and their associated suggestion
  const headingMatches: string[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? '').trim();
    if (!text) continue;
    if (normalizeAnchor(text) !== normalizedAnchor) continue;

    // Prefer the heading's own id if mammoth assigned one; otherwise strip
    // leading underscores from the original anchor as the suggested replacement
    const suggestion = h.getAttribute('id') ?? anchor.replace(/^_+/, '');
    if (!headingMatches.includes(suggestion)) {
      headingMatches.push(suggestion);
    }
  }

  if (headingMatches.length === 1) return headingMatches[0] ?? null;
  return null; // zero or multiple heading matches
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
