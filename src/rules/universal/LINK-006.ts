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
 *  c. HTML heading text — two checks applied in sequence per heading:
 *       i.  Direct containment: normalized anchor is a substring of normalized heading
 *       ii. Stop-word containment: both sides have common stop words removed, then
 *           the cleaned anchor is checked as a substring of the cleaned heading.
 *           Handles slugs where Word drops words like "and"/"or"/"the" (e.g.
 *           "#Program_requirements_expectations" → "Program requirements and expectations")
 *
 * Fuzzy matching passes (applied in order, return on first conclusive result):
 *  Pass 1 — anchor as-is through Sources a–c
 *  Pass 2 — strip Word's trailing _N suffix (duplicate-heading disambiguation),
 *            then Sources a–c again. Match sets hadNumericSuffix on the result.
 *  Pass 3 — numeric extraction fallback: extract integers from the anchor and
 *            find headings containing those integers preceded by a structural
 *            keyword (Attachment, Section, Step, …). Handles manually-created
 *            abbreviation bookmarks like "#Attach8OrgChart". Match sets
 *            matchedByNumericExtraction on the result.
 */

type FuzzyMatchResult =
  | {
      kind: 'single';
      anchor: string;
      headingText?: string;
      hadNumericSuffix?: boolean;
      matchedByNumericExtraction?: boolean;
    }
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
      const exactEl = htmlDoc.getElementById(anchor);
      if (exactEl !== null) {
        // If the matched element is a heading and the link text doesn't already
        // mention the heading name, surface a link-text improvement suggestion.
        if (/^h[1-6]$/i.test(exactEl.tagName)) {
          const headingText = (exactEl.textContent ?? '').trim();
          if (headingText && !linkTextContainsHeading(linkText, headingText)) {
            const sectionId = findSectionForElement(link, doc);
            results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId));
          }
        }
        return;
      }

      // Tier 1b: exact match against OOXML bookmark names
      if (ooxmlBookmarkNames && ooxmlBookmarkNames.has(anchor)) return;

      // Tier 2: fuzzy match (result cached per anchor)
      if (!fuzzyCache.has(anchor)) {
        fuzzyCache.set(anchor, findFuzzyMatch(anchor, htmlDoc, xmlDoc));
      }
      const fuzzyResult = fuzzyCache.get(anchor)!;

      if (fuzzyResult.kind === 'single') {
        const fuzzy = fuzzyResult.anchor;
        const headingText = fuzzyResult.headingText;
        const sectionId = findSectionForElement(link, doc);
        // Lower-confidence numeric-extraction matches get "possible" rather than "likely"
        const confidence = fuzzyResult.matchedByNumericExtraction ? 'possible' : 'likely';
        const description = headingText
          ? `The anchor "#${anchor}" wasn't found, but a ${confidence} match was found via heading "${headingText}": "#${fuzzy}". Accept to update the link, or skip to leave it unchanged.`
          : `The anchor "#${anchor}" wasn't found, but a ${confidence} match was found: "#${fuzzy}". Accept to update the link, or skip to leave it unchanged.`;
        const numericSuffixWarning = fuzzyResult.hadNumericSuffix
          ? ' The trailing numeric suffix on the original anchor was stripped during matching — there may be multiple headings with this name in the document. Verify you are targeting the correct one.'
          : '';
        let prefillNote: string;
        if (fuzzyResult.matchedByNumericExtraction) {
          prefillNote = `Matched by number extraction — a number in the anchor was found in a structural heading ("${headingText ?? ''}"). This is a lower-confidence match; verify this is the correct target before accepting.`;
        } else {
          prefillNote = headingText
            ? `Matched via heading text: "${headingText}". Confirm this is the correct heading before accepting.${numericSuffixWarning}`
            : `Matched by normalizing the anchor against content in the document (e.g., bookmarks, IDs, or headings). Edit if needed.${numericSuffixWarning}`;
        }
        results.push({
          id: `LINK-006-${index}`,
          ruleId: 'LINK-006',
          title: 'Internal link anchor may need updating',
          severity: 'warning',
          sectionId,
          location: href,
          description,
          suggestedFix: `Retarget "#${anchor}" → "#${fuzzy}"`,
          inputRequired: {
            type: 'text',
            label: 'Replacement anchor',
            fieldDescription: `Current anchor: #${anchor}`,
            prefill: fuzzy,
            prefillNote,
            hint: headingText
              ? 'Note: spaces and punctuation in heading text may be normalized (for example, converted to hyphens or underscores) in anchor links.'
              : undefined,
            targetField: `link.bookmark.${anchor}`,
          },
        } as Issue);

        // If the anchor resolved to a heading via fuzzy text matching, also
        // surface a link-text suggestion when the link text doesn't already
        // reference that heading by name.
        if (headingText && !linkTextContainsHeading(linkText, headingText)) {
          results.push(makeLinkTextSuggestion(`LINK-006-ltext-${index}`, linkText, headingText, href, anchor, sectionId));
        }

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
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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

    const suggestion = h.getAttribute('id') ?? slugifyHeading(text);
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
      const suggestion = h.getAttribute('id') ?? slugifyHeading(text);
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
 * Build a 'suggestion' severity Issue prompting the author to add the
 * destination heading name to the link text.  The inputRequired field is
 * pre-filled with "<linkText> (see <headingText>)" and uses the targetField
 * "link.text.<anchor>" so buildDocx can patch the OOXML when the fix is
 * accepted.
 */
function makeLinkTextSuggestion(
  id: string,
  linkText: string,
  headingText: string,
  href: string,
  anchor: string,
  sectionId: string
): Issue {
  const suggestedText = `${linkText} (see ${headingText})`;
  return {
    id,
    ruleId: 'LINK-006',
    title: 'Consider adding destination heading name to link text',
    severity: 'suggestion',
    sectionId,
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
