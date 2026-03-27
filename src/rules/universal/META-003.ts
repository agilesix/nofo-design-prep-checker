import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';
import { contentGuides } from '../../data/contentGuides';

/**
 * META-003: Document Keywords metadata check
 * Checks that keywords are present and follow guidance (8-10 comma-separated terms).
 * Pre-fills the textarea with a suggested keyword list extracted from the document.
 */
const META_003: Rule = {
  id: 'META-003',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const archiveFile = doc.zipArchive.file('docProps/core.xml');
    if (!archiveFile) return issues;

    const prefill = generateKeywordPrefill(doc, options.contentGuideId);

    issues.push({
      id: 'META-003-keywords',
      ruleId: 'META-003',
      title: 'Verify document keywords metadata',
      severity: 'warning',
      sectionId: 'section-preamble',
      description:
        'The document Keywords field should contain 8–10 specific terms or phrases drawn directly from the language of the NOFO, separated by commas. These should be fine-grained search terms, not high-level category words.',
      suggestedFix: 'Update the Keywords field in Document Properties.',
      inputRequired: {
        type: 'textarea',
        label: 'Keywords',
        placeholder: 'keyword one, keyword two, keyword three',
        hint: '8–10 keywords, separated by commas. Use specific terms from the NOFO.',
        targetField: 'metadata.keywords',
        maxLength: 500,
        prefill: prefill ?? undefined,
        prefillNote: prefill
          ? 'Suggested based on your document content. Review carefully and edit before accepting — you know your NOFO better than this tool does.'
          : undefined,
        termCountRange: '8–10',
        minTermCount: 5,
      },
    });

    return issues;
  },
};

// ─── Keyword suggestion helpers ───────────────────────────────────────────────

/**
 * Words that, on their own, are too generic to serve as keywords.
 * Headings that consist entirely of these words are excluded.
 */
const GENERIC_TERMS = new Set([
  'grant', 'grants', 'federal', 'notice', 'funding', 'opportunity', 'application',
  'program', 'nofo', 'hhs', 'award', 'awards', 'eligible', 'eligibility',
  'requirements', 'information', 'activities', 'services', 'support',
  'health', 'department', 'administration', 'office', 'bureau', 'division',
  'section', 'period', 'fiscal', 'year', 'plan', 'report', 'review',
  'contact', 'submission', 'deadline', 'announcement',
]);

/**
 * Stop words removed when extracting a short representative phrase from a
 * longer text (e.g. opportunity name, tagline).
 */
const PHRASE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'to', 'on', 'at', 'by', 'with',
]);

/**
 * Structural and navigational section headings that should never appear as
 * keyword suggestions regardless of word count.
 */
const SKIP_HEADINGS = new Set([
  // Standard NOFO structural sections
  'before you begin',
  'basic information',
  'funding details',
  'program description',
  'eligibility',
  'eligibility requirements',
  'eligibility information',
  'application and submission information',
  'application submission information',
  'submission information',
  'review information',
  'review process',
  'review criteria',
  'evaluation criteria',
  'selection criteria',
  'award administration information',
  'award information',
  'contacts and support',
  'contact information',
  'other information',
  // Generic orientation headings
  'overview',
  'summary',
  'introduction',
  'background',
  'about this notice',
  'about this opportunity',
  'about the program',
  'about this program',
  'how to apply',
  'how to get help',
  'resources and support',
  'next steps',
  'timeline',
  'key dates',
  'important dates',
  // Content-control field labels (visible after artifact stripping)
  'funding opportunity title',
  'opportunity title',
  'opportunity name',
  'program name',
  'cfda number',
  'opportunity number',
  'assistance listing',
  // Document-structure headings
  'table of contents',
  'appendix',
  'attachments',
]);

/**
 * Strip content-control artifact prefixes and leading/trailing special
 * characters from a raw string. Does not enforce a word-count limit.
 *
 * Artifacts stripped:
 *  - Leading numeric/bracket patterns: [1], [2], (1), 1., 2., 1:, 1)
 *  - Leading and trailing punctuation: [ ] ( ) { } * # @ ! » « · • – — / \ | < >
 */
function stripArtifacts(raw: string): string {
  let s = raw.replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.):\]]\s*)/, '').trim();
  s = s.replace(/^[[\](){}*#@!»«·•–—/\\|<>]+/, '')
       .replace(/[[\](){}*#@!»«·•–—/\\|<>]+$/, '')
       .trim();
  // Collapse embedded newlines and repeated spaces to a single space.
  s = s.replace(/\s+/g, ' ');
  return s;
}

/**
 * Strip content-control artifact prefixes and leading/trailing special
 * characters from a keyword candidate, then reject it if it exceeds 3 words.
 *
 * Returns the cleaned string, or null if the candidate should be discarded.
 */
function sanitizeKeywordCandidate(raw: string): string | null {
  const s = stripArtifacts(raw);
  if (!s) return null;
  if (s.split(/\s+/).filter(Boolean).length > 3) return null;
  return s;
}

/**
 * Extract up to `maxWords` non-stop-word tokens from `text` and join them.
 * Used to derive a short representative keyword phrase when the source text
 * (e.g. opportunity name) is too long to include verbatim.
 *
 * Example: "Maternal and Child Health Title V Performance"
 *          → "Maternal Child Health"  (maxWords = 3)
 */
function shortFormOf(text: string, maxWords: number): string | null {
  const result: string[] = [];
  for (const word of text.split(/\s+/)) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (lower.length > 1 && !PHRASE_STOP_WORDS.has(lower)) {
      result.push(word);
      if (result.length >= maxWords) break;
    }
  }
  return result.length > 0 ? result.join(' ') : null;
}

/**
 * Returns true for headings that are navigational or structural and should
 * never appear as keyword suggestions.
 *
 * In addition to the explicit SKIP_HEADINGS set, headings that begin with
 * Step / Part / Section / Appendix / Attachment / Exhibit / Tab followed by
 * an alphanumeric character are treated as structural navigation.
 */
function isNavigationalHeading(heading: string): boolean {
  if (SKIP_HEADINGS.has(heading.toLowerCase().trim())) return true;
  return /^(step|part|section|appendix|attachment|exhibit|tab)\s+[\dA-Za-z]/i.test(heading);
}

function isDuplicate(term: string, existing: string[]): boolean {
  const lower = term.toLowerCase();
  return existing.some(k => k.toLowerCase() === lower);
}

function generateKeywordPrefill(doc: ParsedDocument, contentGuideId: string | null): string | null {
  const keywords: string[] = [];

  // 1. Resolve the active content guide via ID or document text scan.
  let guide = contentGuideId
    ? contentGuides.find(g => g.id === contentGuideId) ?? null
    : null;

  if (!guide) {
    guide = contentGuides.find(g => {
      const { names, abbreviations } = g.detectionSignals;
      return (
        names.some(n => doc.rawText.includes(n)) ||
        abbreviations.some(a => new RegExp(`\\b${a}\\b`).test(doc.rawText))
      );
    }) ?? null;
  }

  if (guide) {
    // HRSA: lead with application guide type keyword.
    if (guide.opDiv === 'HRSA') {
      keywords.push(guide.subType?.includes('R&R') ? 'R&R Application Guide' : 'Application Guide');
    }

    // Full OpDiv name and abbreviation — authoritative identifiers, not
    // subject to the 3-word limit applied to content-extracted keywords.
    const fullName = guide.detectionSignals.names[0];
    if (fullName) keywords.push(fullName);
    keywords.push(guide.opDiv);

    // Sub-agency name if present in the document (names[1+]).
    for (let i = 1; i < guide.detectionSignals.names.length; i++) {
      const subName = guide.detectionSignals.names[i];
      if (subName && doc.rawText.includes(subName)) {
        keywords.push(subName);
        break;
      }
    }
  }

  // Max character length for a single extracted keyword phrase (opp name / tagline).
  // A ≤3-word phrase should never exceed this; anything longer is a parsing artifact.
  const MAX_KEYWORD_CHARS = 60;

  // 2. Opportunity name — include directly if ≤ 3 words; otherwise derive a
  //    short representative phrase so the program area is still represented.
  const oppNameMatch = doc.rawText.match(/opportunity\s+name\s*:?\s*(.+?)(?:\n|$)/i);
  if (oppNameMatch?.[1]) {
    const oppNameRaw = oppNameMatch[1].trim().replace(/\s+/g, ' ');
    const sanitized = sanitizeKeywordCandidate(oppNameRaw);
    const candidate = sanitized ?? shortFormOf(stripArtifacts(oppNameRaw), 3);
    if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isDuplicate(candidate, keywords)) {
      keywords.push(candidate);
    }
  }

  // 3. Tagline — "Tagline:" field when present in the document.
  const taglineMatch = doc.rawText.match(/tagline\s*:?\s*(.+?)(?:\n|$)/i);
  if (taglineMatch?.[1]) {
    const taglineRaw = taglineMatch[1].trim().replace(/\s+/g, ' ');
    const sanitized = sanitizeKeywordCandidate(taglineRaw);
    const candidate = sanitized ?? shortFormOf(stripArtifacts(taglineRaw), 3);
    if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isDuplicate(candidate, keywords)) {
      keywords.push(candidate);
    }
  }

  // 4. Distinctive heading terms — subject-matter headings from the document,
  //    with structural / navigational headings excluded.
  const headingTerms = extractHeadingTerms(doc.sections);
  for (const term of headingTerms) {
    if (keywords.length >= 10) break;
    if (!isDuplicate(term, keywords)) keywords.push(term);
  }

  if (keywords.length === 0) return null;

  // Deduplicate, trim, cap at 10.
  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))].slice(0, 10);
  return unique.join(', ');
}

/**
 * Extract up to 6 keyword candidates from document section headings.
 *
 * Each candidate must:
 *  - Come from an h2+ heading
 *  - Pass sanitizeKeywordCandidate (no artifact prefixes; ≤ 3 words after cleaning)
 *  - Not be a navigational / structural heading (SKIP_HEADINGS or Step/Part/... pattern)
 *  - Contain at least one word that is not in GENERIC_TERMS
 */
function extractHeadingTerms(sections: Section[]): string[] {
  const terms: string[] = [];

  for (const section of sections) {
    if (section.headingLevel < 2) continue;

    const sanitized = sanitizeKeywordCandidate(section.heading);
    if (!sanitized) continue;

    if (isNavigationalHeading(sanitized)) continue;

    // Require at least one non-generic word so pure boilerplate headings
    // ("Program Requirements", "Review Criteria") are excluded.
    const meaningfulWords = sanitized.split(/\s+/).filter(w => {
      const lower = w.toLowerCase().replace(/[^a-z]/g, '');
      return lower.length > 2 && !GENERIC_TERMS.has(lower);
    });
    if (meaningfulWords.length === 0) continue;

    terms.push(sanitized);
    if (terms.length >= 6) break;
  }

  return terms;
}

export default META_003;
