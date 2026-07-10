import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';
import { slugifyHeading } from '../../utils/anchorUtils';

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
      /** True when the anchor is known to be correct: either a case-insensitive
       *  match to an existing w:bookmarkStart, or derived from heading text when
       *  OOXML is present (so buildDocx can create the bookmark if needed).
       *  When true, the check() emits an AutoAppliedChange instead of an Issue. */
      matchedByOoxmlBookmark?: boolean;
      /** True when the anchor was derived from heading text and no existing
       *  w:bookmarkStart with that name was found. buildDocx will insert a new
       *  w:bookmarkStart / w:bookmarkEnd on the heading paragraph so the
       *  downloaded docx is immediately usable in Word. */
      needsBookmarkCreation?: boolean;
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

    // Precompute exact OOXML bookmark names once to avoid O(links × bookmarks) scans.
    // getOoxmlBookmarkNames already excludes _GoBack and caches per xmlDoc.
    const ooxmlBookmarkNames: Set<string> | null = xmlDoc
      ? new Set(getOoxmlBookmarkNames(xmlDoc))
      : null;

    // Build a fuzzy lookup index (normalizedForm → bookmarkName | null) once per
    // document so each malformed link resolves in O(1) instead of O(bookmarks).
    // null = multiple bookmarks map to the same normalized form (ambiguous).
    const fuzzyBookmarkIndex = new Map<string, string | null>();
    if (ooxmlBookmarkNames) {
      for (const bm of ooxmlBookmarkNames) {
        const norm = normalizeBookmarkForFuzzyMatch(bm);
        fuzzyBookmarkIndex.set(norm, fuzzyBookmarkIndex.has(norm) ? null : bm);
      }
    }

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

      // Exclude auto-generated endnote/footnote navigation anchors. Mammoth
      // renders round-trip endnote links as #endnote-N / #endnote-ref-N and
      // footnote links as #footnote-N / #footnote-ref-N. These are never NOFO
      // Builder heading bookmarks and must never be flagged.
      if (/^(end|foot)note(-ref)?-\d+$/i.test(anchor)) return;

      // Tier 1a: exact match — anchor ID exists in the parsed HTML
      const exactEl = htmlDoc.getElementById(anchor);
      if (exactEl !== null) {
        // Mammoth renders w:bookmarkStart elements as <a id="..."> inside their
        // containing paragraph or heading, NOT as an id on the block element
        // itself. Use .closest() to resolve to the nearest heading ancestor so
        // links that target a heading bookmark are handled correctly regardless
        // of whether the id is on the heading element or on an <a> inside it.
        const headingEl = exactEl.closest('h1,h2,h3,h4,h5,h6');
        if (headingEl !== null) {
          const headingText = (headingEl.textContent ?? '').trim();
          if (headingText && !linkTextContainsHeading(linkText, headingText)) {
            const sectionId = findSectionForElement(link, doc);
            // If the word "see" already appears in the text immediately preceding
            // this link, omit it from the suggestion to avoid redundant phrasing
            // like "see X (see Y)".
            const suppressSee = hasSeeBeforeLink(link);
            results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId, linkNearestHeading, suppressSee));
          }
        } else if (!isResolvableByNOFOBuilder(anchor, cleanHeadingSlugMap)) {
          // Anchor resolves to a non-heading element with no heading ancestor:
          // NOFO Builder resolves links by heading slug only, so this anchor
          // will be unresolvable after import.
          const sectionId = findSectionForElement(link, doc);
          results.push({
            id: `LINK-006-${index}`,
            ruleId: 'LINK-006',
            title: 'Internal link may not work in NOFO Builder',
            severity: 'warning',
            sectionId,
            nearestHeading: linkNearestHeading,
            location: href,
            description: `This internal link points to a non-heading anchor (#${anchor}). NOFO Builder resolves internal links by heading name only, so this link may not work in the published NOFO. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading.`,
            instructionOnly: true,
          } as Issue);
        }
        return;
      }

      // Tier 1b: exact match against OOXML bookmark names
      if (ooxmlBookmarkNames && ooxmlBookmarkNames.has(anchor)) {
        // Anchor exists as an OOXML bookmark, but NOFO Builder resolves links by
        // heading slug only. Warn when the bookmark is not derived from any heading.
        if (!isResolvableByNOFOBuilder(anchor, cleanHeadingSlugMap)) {
          const sectionId = findSectionForElement(link, doc);
          results.push({
            id: `LINK-006-${index}`,
            ruleId: 'LINK-006',
            title: 'Internal link may not work in NOFO Builder',
            severity: 'warning',
            sectionId,
            nearestHeading: linkNearestHeading,
            location: href,
            description: `This internal link points to bookmark "#${anchor}" which is not derived from a heading. NOFO Builder resolves internal links by heading name only, so this link may not work in the published NOFO. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading.`,
            instructionOnly: true,
          } as Issue);
        }
        return;
      }

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
          const sectionId = findSectionForElement(link, doc);
          const suppressSee = hasSeeBeforeLink(link);
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
          // Anchor is known to be correct (OOXML bookmark exists or heading
          // found with OOXML present). Rewrite without user confirmation.
          // When needsBookmarkCreation, encode headingText so buildDocx can
          // insert w:bookmarkStart/End on the heading paragraph.
          const encodedValue =
            fuzzyResult.needsBookmarkCreation && fuzzyResult.headingText
              ? `${fuzzyResult.anchor}::${fuzzyResult.headingText}`
              : fuzzyResult.anchor;
          results.push({
            ruleId: 'LINK-006',
            description: `Retargeted internal link "#${anchor}" → "#${fuzzyResult.anchor}"`,
            targetField: `link.bookmark.${anchor}`,
            value: encodedValue,
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
          const suppressSee = hasSeeBeforeLink(link);
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

    // Case 1: bookmark:// pseudo-scheme links.
    // Word creates these when a hyperlink dialog produces a relationship with
    // TargetMode="External" and Target="bookmark://anchorName". Mammoth renders
    // them as <a href="bookmark://..."> — not caught by the a[href^="#"] query above.
    // Word and NOFO Builder cannot resolve this URL scheme, so the link is always
    // broken. Rewrite to w:anchor when the anchor can be resolved; emit a warning
    // when it cannot.
    const bookmarkSchemeLinks = Array.from(htmlDoc.querySelectorAll('a[href^="bookmark://"]'));
    bookmarkSchemeLinks.forEach((link, malformedIdx) => {
      const href = link.getAttribute('href') ?? '';
      const rawAnchor = href.slice('bookmark://'.length);
      if (!rawAnchor) return;
      const { nearestHeading: linkNearestHeading } = getContext(link);
      const sectionId = findSectionForElement(link, doc);

      // Prefer OOXML bookmark name (preserves case, works in Word immediately)
      const exactOoxmlAnchor =
        (ooxmlBookmarkNames?.has(rawAnchor) ? rawAnchor : null) ??
        (ooxmlBookmarkNames?.has('_' + rawAnchor) ? '_' + rawAnchor : null);
      if (exactOoxmlAnchor !== null) {
        results.push({
          ruleId: 'LINK-006',
          description: `Rewired malformed bookmark:// link to internal link "#${exactOoxmlAnchor}"`,
          targetField: `link.malformed.bookmark.${rawAnchor}`,
          value: exactOoxmlAnchor,
        } as AutoAppliedChange);
        return;
      }

      // Fuzzy OOXML match: treat 'and' ↔ '&' as equivalent and collapse separators.
      // Only auto-fix when normalization yields exactly one match; if multiple
      // bookmarks normalize to the same string, emit an instruction-only warning — never guess.
      if (fuzzyBookmarkIndex.size > 0) {
        const normRaw = normalizeBookmarkForFuzzyMatch(rawAnchor);
        const fuzzyTarget = fuzzyBookmarkIndex.get(normRaw);
        if (fuzzyTarget !== undefined) {
          if (fuzzyTarget !== null) {
            results.push({
              ruleId: 'LINK-006',
              description: `Rewired malformed bookmark:// link to internal link "#${fuzzyTarget}"`,
              targetField: `link.malformed.bookmark.${rawAnchor}`,
              value: fuzzyTarget,
            } as AutoAppliedChange);
            return;
          }
          results.push({
            id: `LINK-006-malformed-${malformedIdx}`,
            ruleId: 'LINK-006',
            title: 'Internal link may not work in NOFO Builder',
            severity: 'warning',
            sectionId,
            nearestHeading: linkNearestHeading,
            location: href,
            description: `This link uses a "bookmark://" URL that Word cannot resolve, and the anchor name matches multiple bookmarks after normalization. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading.`,
            instructionOnly: true,
          } as Issue);
          return;
        }
      }

      // Fall back to heading slug (NOFO Builder can resolve this)
      const headingEl = cleanHeadingSlugMap.get(rawAnchor);
      if (headingEl !== undefined) {
        const headingText = (headingEl.textContent ?? '').trim();
        // Encode headingText so buildDocx can insert a bookmark if none exists
        results.push({
          ruleId: 'LINK-006',
          description: `Rewired malformed bookmark:// link to internal link "#${rawAnchor}"`,
          targetField: `link.malformed.bookmark.${rawAnchor}`,
          value: `${rawAnchor}::${headingText}`,
        } as AutoAppliedChange);
        return;
      }

      // No match — cannot rewrite, instruct user to fix manually
      results.push({
        id: `LINK-006-malformed-${malformedIdx}`,
        ruleId: 'LINK-006',
        title: 'Internal link may not work in NOFO Builder',
        severity: 'warning',
        sectionId,
        nearestHeading: linkNearestHeading,
        location: href,
        description: `This link uses a "bookmark://" URL that Word cannot resolve, and no matching heading was found to rewire it to. To fix it, select the link text in Word, go to Insert → Link → This Document, and select the correct heading.`,
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

// slugifyHeading is imported from ../../utils/anchorUtils

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
  // ── Source 2: HTML element IDs (mammoth-mapped bookmarks) ──────────────────
  // Exact normalized equality match against element IDs.  Retains higher
  // priority than Source 3 (heading-text containment) so that a precise HTML
  // id match wins over a looser heading-text containment match — this also
  // preserves the original behaviour where Source 2 matches do not surface a
  // link-text suggestion (no headingText is returned).
  //
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

  // ── Source 3: HTML heading text (before OOXML bookmark names) ────────────────
  // Running heading-text matching before OOXML bookmark name matching (Source 1)
  // ensures that when a heading is found, the anchor is always derived from the
  // heading text (via slugifyHeading) rather than from a legacy or TOC-generated
  // bookmark that happens to normalise to the same string.
  //
  // Sub-check a (direct containment): the normalized anchor appears within the
  // normalized heading text.  Handles short anchors like "Attachment_1" that
  // target headings like "Attachment 1: Accreditation documentation".
  //
  // Sub-check b (stop-word containment): if direct containment fails, strip
  // STOP_WORDS from both sides and retry.  Handles slugs where Word dropped
  // connective words, e.g. "#Program_requirements_expectations" for heading
  // "Program requirements and expectations".
  //
  // When OOXML is present, a case-insensitive lookup is performed to find an
  // existing bookmark whose name matches the derived anchor:
  //  • Found  → use the exact OOXML name (preserving case), matchedByOoxmlBookmark
  //  • Absent → auto-fix still applies but buildDocx must create the bookmark
  //
  // When OOXML is absent, the result carries no matchedByOoxmlBookmark flag and
  // becomes an instruction-only Issue (unchanged behaviour).
  const cleanAnchor = removeStopWords(normalizedAnchor);
  const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const ooxmlNamesList = xmlDoc ? getOoxmlBookmarkNames(xmlDoc) : [];
  // Precompute lowercase → exact-name map for O(1) lookup per heading instead
  // of an O(bookmarks) linear scan inside the heading loop.
  const ooxmlNamesLower = new Map<string, string>();
  for (const n of ooxmlNamesList) {
    if (!ooxmlNamesLower.has(n.toLowerCase())) ooxmlNamesLower.set(n.toLowerCase(), n);
  }
  const headingMatches: { anchor: string; headingText: string; exactBookmarkName?: string }[] = [];

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

    // Case-insensitive OOXML bookmark lookup: if an existing bookmark already
    // carries the derived anchor name (possibly with different case — Word and
    // NOFO Builder may produce different casing), use it verbatim so the
    // written anchor value wires up to the existing w:bookmarkStart element.
    // Also try a leading-underscore variant: NOFO Builder creates bookmarks as
    // "_HeadingText" (underscore + spaces→underscores), but slugifyHeading
    // strips leading underscores, so "grants_management" must also match
    // "_Grants_management" to avoid spurious needsBookmarkCreation.
    const exactBookmarkName =
      ooxmlNamesLower.get(suggestion.toLowerCase()) ??
      ooxmlNamesLower.get('_' + suggestion.toLowerCase());

    const resolvedAnchor = exactBookmarkName ?? suggestion;
    if (headingMatches.some(m => m.anchor === resolvedAnchor)) return { kind: 'ambiguous' };
    headingMatches.push({ anchor: resolvedAnchor, headingText: text, exactBookmarkName });
  }

  if (headingMatches.length === 1) {
    const match = headingMatches[0]!;
    if (xmlDoc !== null) {
      // OOXML is present — anchor is reliable; emit auto-fix.
      // needsBookmarkCreation signals buildDocx to insert w:bookmarkStart/End
      // when no existing bookmark matched.
      return {
        kind: 'single',
        anchor: match.anchor,
        headingText: match.headingText,
        matchedByOoxmlBookmark: true,
        ...(match.exactBookmarkName ? {} : { needsBookmarkCreation: true }),
      };
    }
    // No OOXML — instruction-only (headingText surfaced for link-text suggestion).
    return { kind: 'single', anchor: match.anchor, headingText: match.headingText };
  }
  if (headingMatches.length > 1) return { kind: 'ambiguous' };

  // ── Source 1: OOXML bookmark names (fallback) ──────────────────────────────
  // Only reached when neither Source 2 (HTML id) nor Source 3 (heading text)
  // produced a match.  Handles cases where a bookmark was renamed but has no
  // corresponding heading element in the HTML (e.g. a stand-alone non-heading
  // bookmark that the link truly targets).
  if (xmlDoc) {
    const names = getOoxmlBookmarkNames(xmlDoc);
    const matches = names.filter(n => normalizeAnchor(n) === normalizedAnchor);
    if (matches.length === 1) return { kind: 'single', anchor: matches[0]!, matchedByOoxmlBookmark: true };
    if (matches.length > 1) return { kind: 'ambiguous' };
  }

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
      // Encode anchor + original link text so buildDocx can scope the patch
      // to this exact hyperlink instance rather than all links with the same anchor.
      targetField: `link.text.${anchor}::${linkText}`,
    },
  } as Issue;
}

/**
 * Normalize a bookmark name for fuzzy Case-1 matching in `bookmark://` links.
 * Treats 'and' and '&' as equivalent and collapses all non-alphanumeric separators
 * (underscores, spaces, punctuation) to a uniform underscore, then strips
 * leading/trailing underscores.
 *
 * e.g. '_Contacts_and_Support' → 'contacts_and_support'
 *      '_Contacts_&_Support'   → 'contacts_and_support'  (same → match)
 */
function normalizeBookmarkForFuzzyMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')   // pad with spaces so R&D → r_and_d, not rand
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

/**
 * Returns true when the anchor is resolvable by NOFO Builder after import.
 *
 * NOFO Builder resolves internal links exclusively via slugifyHeading(headingText).
 * Two cases are treated as resolvable:
 *  1. The anchor exactly matches a heading slug in cleanHeadingSlugMap.
 *  2. The anchor begins with '_' AND its body (the portion after '_') resolves to
 *     a heading slug in cleanHeadingSlugMap — see matchesHeadingSlugWithWordQuirks
 *     for the exact/suffix/truncation tolerance applied to the body. NOFO Builder
 *     creates heading bookmarks as '_' + slugifyHeading(headingText); a bookmark
 *     like '_Grants.gov' whose body 'Grants.gov' does not resolve to any heading's
 *     slug (slugifyHeading('Grants.gov') = 'Grants_gov') is orphaned and will be
 *     unresolvable after import — even if a same-named heading exists elsewhere.
 *
 * Case 2's body-matching tolerance is deliberately NOT applied to case 1 (the bare,
 * no-underscore anchor): case 1 covers anchors that are literally typed as a heading
 * slug, not Word's auto-generated heading-bookmark convention, so it stays a strict
 * exact match. This also keeps a non-heading, non-underscore-prefixed bookmark (e.g.
 * a bookmark sitting on a bullet-list paragraph) correctly unresolvable even if its
 * name happens to be a prefix of some unrelated heading's slug.
 *
 * A bookmark that exists in OOXML but is not derived from a heading text will be
 * unresolvable in the published NOFO even though Word can navigate to it locally.
 */
function isResolvableByNOFOBuilder(
  anchor: string,
  cleanHeadingSlugMap: Map<string, Element>
): boolean {
  if (cleanHeadingSlugMap.has(anchor)) return true;
  // For '_'-prefixed bookmarks, verify the body resolves to a heading slug.
  // NOFO Builder creates heading bookmarks as '_' + slugifyHeading(text), so a
  // correctly-placed bookmark's body will be a key in cleanHeadingSlugMap —
  // modulo the known Word bookmark-naming quirks handled below.
  if (anchor.startsWith('_')) {
    return matchesHeadingSlugWithWordQuirks(anchor.slice(1), cleanHeadingSlugMap);
  }
  return false;
}

/**
 * Returns true when `body` resolves to some key in `cleanHeadingSlugMap`,
 * tolerating known Word/bookmark-generator naming quirks that surface when a
 * heading-derived bookmark was displaced next to a content control
 * (w:displacedByCustomXml) and ends up outside its heading paragraph after
 * the sdt is unwrapped at import time — the exact match against the current
 * heading slug then fails even though the bookmark is genuinely
 * heading-derived and NOFO Builder resolves it correctly on import:
 *
 *  1. Literal punctuation slugifyHeading would have converted to an
 *     underscore. Some bookmark-generating tools (unlike Word's native
 *     "Insert Bookmark" UI, which forbids these characters entirely) preserve
 *     '&' (treated as the word "and", matching normalizeBookmarkForFuzzyMatch's
 *     existing convention), ':' (common in "Step N:"/"Section N:" headings),
 *     and '-' literally instead of substituting an underscore. Deliberately
 *     does NOT extend to '.' or other punctuation — see isResolvableByNOFOBuilder's
 *     doc comment for why (the _Grants.gov case must stay unresolvable).
 *  2. Case differences between the stored bookmark name and the heading's
 *     current text — Word/NOFO Builder casing has been observed to drift
 *     independently of the bookmark (the same tolerance Source 3's OOXML
 *     bookmark lookup already applies elsewhere in this file).
 *  3. Trailing numeric disambiguation suffix — Word appends _1, _2, … to
 *     bookmark names when multiple headings share the same text (the same
 *     quirk the Tier 2 fuzzy matcher already strips; see findFuzzyMatch).
 *  4. Legacy 40-character bookmark-name truncation — Word truncates long
 *     bookmark names at an underscore boundary, so the body is a clean
 *     underscore-delimited prefix of the full heading slug (e.g.
 *     "Line_item_budget_and" prefixing "Line_item_budget_and_staffing_plan"),
 *     never a mid-word cut. A double underscore can appear where a whole
 *     segment was dropped, so runs of underscores are collapsed to one
 *     before comparing.
 *
 * Requiring an underscore immediately after the matched prefix (rather than
 * a bare substring match) prevents an unrelated short heading from
 * spuriously "prefix-matching" a longer, unrelated one.
 */
function matchesHeadingSlugWithWordQuirks(
  body: string,
  cleanHeadingSlugMap: Map<string, Element>
): boolean {
  const normalizedBody = normalizeBookmarkBodyForHeadingComparison(body);
  const candidates = [normalizedBody];
  const withoutSuffix = normalizedBody.replace(/_\d+$/, '');
  if (withoutSuffix !== normalizedBody) candidates.push(withoutSuffix);
  const candidatesLower = candidates.map(c => c.toLowerCase());

  const slugsLower = new Set<string>();
  for (const slug of cleanHeadingSlugMap.keys()) {
    slugsLower.add(slug.toLowerCase());
  }

  if (candidatesLower.some(c => slugsLower.has(c))) return true;

  for (const slugLower of slugsLower) {
    for (const candidateLower of candidatesLower) {
      if (
        slugLower.length > candidateLower.length &&
        slugLower.startsWith(candidateLower) &&
        slugLower[candidateLower.length] === '_'
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normalizes a bookmark body for comparison against heading slugs: treats
 * '&' as the word "and" (padded with underscores so it becomes a standalone
 * word, matching normalizeBookmarkForFuzzyMatch's convention — e.g.
 * "Contacts_&_Support" → "Contacts_and_Support"), converts ':' and '-' to
 * '_' (matching what slugifyHeading itself does to any non-alphanumeric
 * character), then collapses repeated underscores. Deliberately leaves every
 * other character — most importantly '.' — untouched.
 */
function normalizeBookmarkBodyForHeadingComparison(body: string): string {
  return body
    .replace(/&/g, '_and_')
    .replace(/[:-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default LINK_006;
