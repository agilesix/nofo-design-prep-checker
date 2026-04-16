import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LINK-006: Internal bookmark links
 *
 * Resolution tiers:
 *  1. Exact match — anchor ID exists in the HTML or as an OOXML bookmark → no issue
 *  2. OOXML bookmark fuzzy match — anchor normalizes to exactly one existing bookmark
 *     name → user-accepted fix. The `w:anchor` value is rewritten to the exact
 *     bookmark name in the downloaded docx. Internal links in Word are purely
 *     `w:hyperlink w:anchor` → `w:bookmarkStart w:name`; no relationship entry is
 *     needed. Writing the exact existing bookmark name produces a working link.
 *  3. Source 2/3 fuzzy match (HTML id or heading text only) — instruction-only warning
 *     directing the user to use Insert → Link → This Document in Word. We do not have
 *     the exact OOXML bookmark name in these cases.
 *  4. Ambiguous or no match — instruction-only warning.
 *
 * Link text suggestions (separate from anchor handling):
 *  When the probable target heading is identified via fuzzy text matching (Source 3),
 *  a suggestion is emitted if the link text does not reference that heading by name.
 */

type FuzzyMatchResult =
  | {
      kind: 'single';
      anchor: string;
      headingText?: string;
      hadNumericSuffix?: boolean;
      matchedByNumericExtraction?: boolean;
      /** True when the match came from Source 1 (OOXML bookmarks). The anchor
       *  value is the exact w:name from an existing w:bookmarkStart element, so
       *  writing it back produces a correctly-wired internal link. */
      matchedByOoxmlBookmark?: boolean;
    }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

function cleanHeadingId(rawId: string): string {
  return rawId.replace(/^_+|_+$/g, '') || rawId;
}

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
    const getContext = buildLocationLookup(htmlDoc);
    // Precompute clean heading slug → element map so Tier 1c can (a) validate
    // anchors that target headings with leading spaces (stripped by CLEAN-008)
    // or trailing spaces (not stripped by CLEAN-008, handled defensively) and
    // (b) still surface link-text suggestions when the link text doesn't
    // reference the heading name.
    const cleanHeadingSlugMap = new Map<string, Element>(
      Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .map(h => [slugifyHeading((h.textContent ?? '').trim()), h] as const)
        .filter(([slug]) => Boolean(slug))
    );

    bookmarkLinks.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const anchor = href.slice(1); // strip leading #
      const linkText = (link.textContent ?? '').trim();
      const { nearestHeading: linkNearestHeading } = getContext(link);

      // Tier 1a: exact match — anchor ID exists in the parsed HTML
      const exactEl = htmlDoc.getElementById(anchor);
      if (exactEl !== null) {
        // If the matched element is a heading and the link text doesn't already
        // mention the heading name, surface a link-text improvement suggestion.
        if (/^h[1-6]$/i.test(exactEl.tagName)) {
          const headingText = (exactEl.textContent ?? '').trim();
          if (headingText && !linkTextContainsHeading(linkText, headingText)) {
            const sectionId = findSectionForElement(link, doc);
            // If the word "see" already appears in the text immediately preceding
            // this link, omit it from the suggestion to avoid redundant phrasing
            // like "see X (see Y)".
            const suppressSee = hasSeeBeforeLink(link as Element);
            results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId, linkNearestHeading, suppressSee));
          }
        }
        return;
      }

      // Tier 1b: exact match against OOXML bookmark names
      if (ooxmlBookmarkNames && ooxmlBookmarkNames.has(anchor)) return;

      // Tier 1c: match via slug of trimmed heading text.
      // Handles headings with leading spaces (CLEAN-008 strips these in the output)
      // and trailing spaces (not stripped by CLEAN-008, handled defensively): a link
      // pointing to the clean slug (e.g. #Contacts_and_Support) is valid even when
      // the heading element's id is still #_Contacts_and_Support.
      // Also surfaces a link-text suggestion when the link text doesn't name the
      // heading destination (consistent with the Tier 1a behaviour).
      const tier1cHeading = cleanHeadingSlugMap.get(anchor);
      if (tier1cHeading !== undefined) {
        const headingText = (tier1cHeading.textContent ?? '').trim();
        if (headingText && !linkTextContainsHeading(linkText, headingText)) {
          const sectionId = findSectionForElement(link as Element, doc);
          const suppressSee = hasSeeBeforeLink(link as Element);
          results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId, linkNearestHeading, suppressSee));
        }
        return;
      }

      // Tier 2: fuzzy match (result cached per anchor)
      if (!fuzzyCache.has(anchor)) {
        fuzzyCache.set(anchor, findFuzzyMatch(anchor, htmlDoc, xmlDoc));
      }
      const fuzzyResult = fuzzyCache.get(anchor)!;

      if (fuzzyResult.kind === 'single') {
        const headingText = fuzzyResult.headingText;
        const sectionId = findSectionForElement(link, doc);

        if (fuzzyResult.matchedByOoxmlBookmark) {
          // Source 1 OOXML match: the exact bookmark name is known, so the
          // anchor can be rewritten without user confirmation.
          results.push({
            ruleId: 'LINK-006',
            description: `Retargeted internal link "#${anchor}" → "#${fuzzyResult.anchor}"`,
            targetField: `link.bookmark.${anchor}`,
            value: fuzzyResult.anchor,
          } as AutoAppliedChange);
        } else {
          // Source 2/3 match: derived from HTML id or heading text — we don't
          // have the exact OOXML bookmark name, so instruct the user to fix manually.
          results.push({
            id: `LINK-006-${index}`,
            ruleId: 'LINK-006',
            title: 'Internal link may not work in NOFO Builder',
            severity: 'warning',
            sectionId,
            nearestHeading: linkNearestHeading,
            location: href,
            description: `This internal link may be broken. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading. Do not edit the link URL directly.`,
            instructionOnly: true,
          } as Issue);
        }

        // Link-text suggestion when heading text is known (Source 3 only) and
        // the link text doesn't already reference the heading by name.
        if (headingText && !linkTextContainsHeading(linkText, headingText)) {
          const suppressSee = hasSeeBeforeLink(link as Element);
          results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId, linkNearestHeading, suppressSee));
        }

        return;
      }

      if (fuzzyResult.kind === 'ambiguous') {
        const sectionId = findSectionForElement(link, doc);
        results.push({
          id: `LINK-006-${index}`,
          ruleId: 'LINK-006',
          title: 'Internal link may not work in NOFO Builder',
          severity: 'warning',
          sectionId,
          nearestHeading: linkNearestHeading,
          location: href,
          description: `This internal link may be broken. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading. Do not edit the link URL directly.`,
          instructionOnly: true,
        } as Issue);
        return;
      }

      // Tier 3: no match — broken link
      const sectionId = findSectionForElement(link, doc);
      results.push({
        id: `LINK-006-${index}`,
        ruleId: 'LINK-006',
        title: 'Internal link may not work in NOFO Builder',
        severity: 'warning',
        sectionId,
        nearestHeading: linkNearestHeading,
        location: href,
        description: `This internal link may be broken. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading. Do not edit the link URL directly.`,
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
 * Common stop words stripped from both anchor and heading when performing the
 * stop-word containment check (pass 1/2, Source 3, second sub-check).
 */
const STOP_WORDS = new Set(['and', 'or', 'the', 'of', 'a', 'an', 'in', 'to', 'for', 'with']);

/**
 * Structural heading keywords used by the numeric extraction fallback (pass 3).
 * A heading matches a number N if it contains one of these keywords immediately
 * followed by the standalone number N in the heading text (word-boundary match).
 */
const STRUCTURAL_KEYWORDS = ['attachment', 'section', 'step', 'part', 'appendix', 'exhibit'];

/**
 * Convert a heading's display text to an anchor slug, following the same
 * format NOFO Builder uses for Word bookmark names:
 *  0. Trim leading/trailing whitespace (defensive: prevents a leading space
 *     from producing a leading underscore even if the caller hasn't pre-trimmed)
 *  1. Replace whitespace runs with underscores
 *  2. Replace any remaining non-alphanumeric characters with underscores
 *     (colons, slashes, parentheses, etc. — invalid in Word bookmark names)
 *  3. Collapse consecutive underscores to a single underscore
 *  4. Strip leading/trailing underscores
 *
 * e.g. "Maintenance of Effort"                          → "Maintenance_of_Effort"
 * e.g. "Attachment 1: Accreditation documentation"      → "Attachment_1_Accreditation_documentation"
 * e.g. "Step 3/4: Overview"                             → "Step_3_4_Overview"
 */
function slugifyHeading(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalize an anchor slug or heading text for fuzzy comparison:
 *  1. Split CamelCase boundaries (e.g. AppendixA → Appendix A)
 *  2. Lowercase
 *  3. Replace underscores and hyphens with spaces
 *  4. Strip remaining punctuation (non-alphanumeric, non-space characters)
 *  5. Collapse whitespace
 *
 * The CamelCase split handles anchors like #AppendixA, #AppendixB that omit the
 * space between the word and the letter suffix — without it, "appendixa" ≠ "appendix a".
 */
function normalizeAnchor(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove common stop words from an already-normalized (lowercase, spaces only)
 * string. Used in the bidirectional heading containment check to match anchors
 * where Word has dropped connecting words like "and" or "of".
 *
 * e.g. "program requirements and expectations" → "program requirements expectations"
 */
function removeStopWords(text: string): string {
  return text
    .split(' ')
    .filter(w => w.length > 0 && !STOP_WORDS.has(w))
    .join(' ');
}

/**
 * Return a FuzzyMatchResult for `anchor` using a three-pass strategy.
 *
 * Pass 1 — anchor as-is:
 *   Normalize the anchor and run it through all candidate sources (OOXML
 *   bookmarks, HTML IDs, heading text with direct + stop-word containment).
 *   Return immediately if any source produces a match.
 *
 * Pass 2 — strip trailing _N suffix:
 *   Word appends _1, _2, … to bookmark slugs when multiple headings share the
 *   same text. If pass 1 found nothing and the anchor ends with _\d+, strip the
 *   suffix (e.g. "_Project_narrative_1" → "_Project_narrative") and retry
 *   Sources a–c. A match sets hadNumericSuffix on the result.
 *
 * Pass 3 — numeric extraction:
 *   For manually-abbreviated bookmarks (e.g. "#Attach8OrgChart") that don't
 *   carry enough text for containment matching, extract all integers from the
 *   anchor and search headings for `(structural keyword) N` patterns. When
 *   pass 2 detected and removed a trailing _N suffix, the stripped form is
 *   used here (rather than the original) so that the suffix digit is not
 *   extracted as a spurious additional candidate number.
 *   A match sets matchedByNumericExtraction on the result and the Review card
 *   warns the user that confidence is lower.
 */
function findFuzzyMatch(
  anchor: string,
  htmlDoc: Document,
  xmlDoc: XMLDocument | null
): FuzzyMatchResult {
  const normalizedAnchor = normalizeAnchor(anchor);
  if (!normalizedAnchor) return { kind: 'none' };

  // Pass 1: try the anchor as-is
  const firstPass = matchByNormalizedValue(normalizedAnchor, htmlDoc, xmlDoc);
  if (firstPass.kind !== 'none') return firstPass;

  // Pass 2: strip Word's trailing numeric suffix and retry
  const strippedAnchor = anchor.replace(/_\d+$/, '');
  if (strippedAnchor !== anchor) {
    const strippedNorm = normalizeAnchor(strippedAnchor);
    if (strippedNorm) {
      const secondPass = matchByNormalizedValue(strippedNorm, htmlDoc, xmlDoc);
      if (secondPass.kind === 'single') {
        return { ...secondPass, hadNumericSuffix: true };
      }
      if (secondPass.kind === 'ambiguous') {
        return { kind: 'ambiguous' };
      }
    }
  }

  // Pass 3: numeric extraction fallback.
  // When pass 2 stripped a Word trailing-suffix (e.g. "Attach8OrgChart_1" →
  // "Attach8OrgChart"), use the stripped form so the suffix digit is not
  // extracted as an additional candidate number and cause false ambiguity.
  const anchorForPass3 = strippedAnchor !== anchor ? strippedAnchor : anchor;
  return matchByNumericExtraction(anchorForPass3, htmlDoc);
}

/**
 * Core matching logic: given an already-normalized anchor string, search all
 * three candidate sources and return the first conclusive result.
 *
 * Candidate sources tried in order:
 *  1. OOXML bookmark names  — exact equality after normalization
 *  2. HTML element IDs      — exact equality after normalization
 *  3. HTML heading text     — two sub-checks per heading:
 *       a. Direct containment: normalizedAnchor is a substring of normalized heading
 *       b. Stop-word containment: both sides stripped of common stop words
 *          (and, or, the, of, a, an, in, to, for, with), then containment
 *          retried. Handles slugs where Word dropped connective words, e.g.
 *          "program requirements expectations" matches
 *          "program requirements and expectations".
 *
 * For heading matches, the suggestion is the heading's own id when present,
 * otherwise derived from the heading text via slugifyHeading(). The matched
 * heading text is included as `headingText` so the Review card can display it.
 */
function matchByNormalizedValue(
  normalizedAnchor: string,
  htmlDoc: Document,
  xmlDoc: XMLDocument | null
): FuzzyMatchResult {
  // ── Source 1: OOXML bookmark names ─────────────────────────────────────────
  if (xmlDoc) {
    const names = getOoxmlBookmarkNames(xmlDoc);
    const matches = names.filter(n => normalizeAnchor(n) === normalizedAnchor);
    if (matches.length === 1) return { kind: 'single', anchor: matches[0]!, matchedByOoxmlBookmark: true };
    if (matches.length > 1) return { kind: 'ambiguous' };
  }

  // ── Source 2: HTML element IDs (mammoth-mapped bookmarks) ──────────────────
  // For heading elements, strip leading/trailing underscores from the id before
  // using it as a candidate anchor.  Leading underscores (e.g. _Contacts_and_Support)
  // come from headings whose text has a leading space — CLEAN-008 removes leading
  // spaces from headings in the output, so the correct anchor lacks the leading
  // underscore. Trailing underscores (from trailing spaces in headings, which
  // CLEAN-008 does not remove) are also stripped defensively.
  const allIds = Array.from(htmlDoc.querySelectorAll('[id]'))
    .map(el => {
      const rawId = el.getAttribute('id') ?? '';
      if (!rawId) return '';
      if (/^h[1-6]$/i.test(el.tagName)) {
        return rawId.replace(/^_+|_+$/g, '') || rawId;
      }
      return rawId;
    })
    .filter(Boolean);

  const idMatches = allIds.filter(id => normalizeAnchor(id) === normalizedAnchor);
  if (idMatches.length === 1) return { kind: 'single', anchor: idMatches[0]! };
  if (idMatches.length > 1) return { kind: 'ambiguous' };

  // ── Source 3: HTML heading text ──────────────────────────────────────────────
  // Sub-check a (direct containment): the normalized anchor must appear *within*
  // the normalized heading text. This handles short anchors like "Attachment_1"
  // that target headings like "Attachment 1: Accreditation documentation".
  //
  // Sub-check b (stop-word containment): if direct containment fails, strip
  // STOP_WORDS from both the anchor and the heading, then retry. This handles
  // slugs where Word dropped connective words from the heading text, e.g.
  // "#Program_requirements_expectations" for heading "Program requirements
  // and expectations".
  //
  // The suggested anchor prefers the heading's own id if mammoth assigned one;
  // otherwise derives from the matched heading text via slugifyHeading().
  // Leading underscores are stripped from heading ids — they come from headings
  // whose text begins with a space (CLEAN-008 removes leading heading spaces in
  // the output). Trailing underscores (from trailing spaces not stripped by
  // CLEAN-008) are also stripped defensively — mirrors Source 2 above.
  // headingText is carried through so the Review card can display it.
  const cleanAnchor = removeStopWords(normalizedAnchor);
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headingMatches: { anchor: string; headingText: string }[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? '').trim();
    if (!text) continue;
    const normHeading = normalizeAnchor(text);
    const directMatch = normHeading.includes(normalizedAnchor);
    const stopWordMatch =
      !directMatch &&
      cleanAnchor.length > 0 &&
      removeStopWords(normHeading).includes(cleanAnchor);
    if (!directMatch && !stopWordMatch) continue;

    const rawId = h.getAttribute('id');
    // Truthy check: getAttribute returns '' (not null) for blank id=""; treat
    // blank the same as absent and fall back to slugifyHeading.
    const suggestion = rawId
      ? cleanHeadingId(rawId)
      : slugifyHeading(text);
    if (!headingMatches.some(m => m.anchor === suggestion)) {
      headingMatches.push({ anchor: suggestion, headingText: text });
    }
  }

  if (headingMatches.length === 1) {
    return { kind: 'single', anchor: headingMatches[0]!.anchor, headingText: headingMatches[0]!.headingText };
  }
  if (headingMatches.length > 1) return { kind: 'ambiguous' };

  return { kind: 'none' };
}

/**
 * Pass 3 fallback: extract all integers from the anchor and search headings
 * for `(structural keyword) N` patterns. The caller passes the stripped anchor
 * (trailing _N removed) when pass 2 detected a Word numeric suffix, so that
 * suffix digit is not extracted as an additional candidate number.
 * Returns a lower-confidence single/ambiguous result — sets
 * matchedByNumericExtraction so the Review card can display an appropriate
 * warning.
 *
 * Structural keywords: attachment, section, step, part, appendix, exhibit.
 */
function matchByNumericExtraction(
  anchor: string,
  htmlDoc: Document
): FuzzyMatchResult {
  // Extract unique integers from the anchor (e.g. "Attach8OrgChart" → [8])
  const numbers = [...new Set((anchor.match(/\d+/g) ?? []).map(Number))];
  if (numbers.length === 0) return { kind: 'none' };

  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const headingMatches: { anchor: string; headingText: string }[] = [];

  for (const num of numbers) {
    // Pattern: structural keyword immediately followed by the exact number.
    // \b before the number ensures "8" doesn't match "18" or "80".
    // Negative lookahead (?![./\-]\d) prevents matching hierarchical/decimal
    // headings like "Section 3.1" or "Section 3/1" where the number is not
    // truly standalone.
    const pattern = new RegExp(
      `\\b(${STRUCTURAL_KEYWORDS.join('|')})\\s+${num}(?![./\\-]\\d)\\b`,
      'i'
    );
    for (const h of headings) {
      const text = (h.textContent ?? '').trim();
      if (!text || !pattern.test(text)) continue;
      const rawId = h.getAttribute('id');
      const normalizedId = rawId?.trim().replace(/^_+|_+$/g, '');
      const suggestion = normalizedId ? normalizedId : slugifyHeading(text);
      if (!headingMatches.some(m => m.anchor === suggestion)) {
        headingMatches.push({ anchor: suggestion, headingText: text });
      }
    }
  }

  if (headingMatches.length === 1) {
    return {
      kind: 'single',
      anchor: headingMatches[0]!.anchor,
      headingText: headingMatches[0]!.headingText,
      matchedByNumericExtraction: true,
    };
  }
  if (headingMatches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'none' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the link text already contains the heading name (or a
 * recognisable abbreviation of it), so the link-text suggestion is suppressed.
 *
 * Two checks:
 *  1. Exact containment — the full normalised heading appears in the normalised
 *     link text.  Handles "See Appendix A" when heading is "Appendix A".
 *  2. Reverse containment — the normalised link text (≥ 5 chars) appears in the
 *     normalised heading.  Handles link text like "Appendix A" when heading is
 *     "Appendix A: Full title".
 */
function linkTextContainsHeading(linkText: string, headingText: string): boolean {
  if (!headingText || !linkText) return false;
  const normLink = normalizeAnchor(linkText);
  const normHeading = normalizeAnchor(headingText);
  if (!normHeading) return true;
  if (normLink.includes(normHeading)) return true;
  if (normLink.length >= 5 && normHeading.includes(normLink)) return true;
  return false;
}

/**
 * Return true if the word "see" (case-insensitive, standalone) appears in the
 * ~10 words of paragraph text immediately before `link`.  Used to suppress
 * "see" from the suggested link text when it would create redundant phrasing
 * like "…see roles and responsibilities (see Cooperative agreement terms)".
 */
function hasSeeBeforeLink(link: Element): boolean {
  // Walk up to the nearest block-level container
  let container: Element | null = link.parentElement;
  while (container) {
    const tag = container.tagName.toUpperCase();
    if (['P', 'LI', 'TD', 'TH', 'DIV', 'BLOCKQUOTE'].includes(tag)) break;
    container = container.parentElement;
  }
  if (!container) return false;

  // Collect text content that precedes the link in document order
  const textParts: string[] = [];
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (link.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
      textParts.push(node.textContent ?? '');
    }
  }

  const preceding = textParts.join('');
  const words = preceding.trim().split(/\s+/).filter(Boolean);
  return words.slice(-10).some(w => /^see$/i.test(w));
}

/**
 * Build a 'suggestion' severity Issue prompting the author to add the
 * destination heading name to the link text.  The inputRequired field is
 * pre-filled with "<linkText> (see <headingText>)" (or "<linkText> (<headingText>)"
 * when `suppressSee` is true) and uses the targetField "link.text.<anchor>" so
 * buildDocx can patch the OOXML when the fix is accepted.
 */
function makeLinkTextSuggestion(
  id: string,
  linkText: string,
  headingText: string,
  href: string,
  anchor: string,
  sectionId: string,
  nearestHeading: string | null,
  suppressSee = false
): Issue {
  const suggestedText = suppressSee
    ? `${linkText} (${headingText})`
    : `${linkText} (see ${headingText})`;
  return {
    id,
    ruleId: 'LINK-006',
    title: 'Consider adding destination heading name to link text',
    severity: 'suggestion',
    sectionId,
    nearestHeading,
    location: href,
    description:
      `Adding the destination heading name to the link text helps readers understand where the link goes — especially useful for appendix and section references. ` +
      `The link "${linkText}" targets "${headingText}".`,
    inputRequired: {
      type: 'text',
      label: 'Suggested link text',
      fieldDescription: `Current link text: "${linkText}"`,
      prefill: suggestedText,
      prefillNote:
        'Edit the suggested text as needed. Accepting will update the link text in the downloaded document and record your preferred wording.',
      targetField: `link.text.${anchor}`,
    },
  } as Issue;
}

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LINK_006;
