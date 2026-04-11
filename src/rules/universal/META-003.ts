import type { Rule, Issue, ParsedDocument, RuleRunnerOptions, Section } from '../../types';
import { contentGuides } from '../../data/contentGuides';
import { extractMetadataBodyValue, isMetadataPlaceholder } from './metadataUtils';

/**
 * META-003: Document keywords body-paragraph check.
 *
 * Flags the "Metadata keywords:" (or "Keywords:") paragraph when its value is
 * empty or a known placeholder. If the paragraph already contains a real
 * value, the rule produces no issue.
 */

const KEYWORDS_FIELD_LABELS = ['metadata keywords', 'keywords'] as const;
const KEYWORDS_FIELD_PATTERN = new RegExp(
  `^(${KEYWORDS_FIELD_LABELS.map((label) => label.replace(/\s+/g, '\\s+')).join('|')})\\s*:`,
  'i',
);

const META_003: Rule = {
  id: 'META-003',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    const value = extractMetadataBodyValue(doc.html, KEYWORDS_FIELD_PATTERN);

    // No matching paragraph in the document body — nothing to flag.
    if (value === null) return [];

    // Paragraph found with a real value — already filled in.
    if (!isMetadataPlaceholder(value)) return [];

    const prefill = generateKeywordPrefill(doc, options.contentGuideId);

    return [
      {
        id: 'META-003-keywords',
        ruleId: 'META-003',
        title: 'Verify document keywords metadata',
        severity: 'warning',
        sectionId: 'section-preamble',
        description:
          'The document Keywords field should contain at least 6 specific terms or phrases drawn ' +
          'directly from the language of the NOFO, separated by commas. These should be ' +
          'fine-grained search terms that are specific to this opportunity \u2014 not generic headings ' +
          'that appear in every NOFO.',
        suggestedFix:
          'Replace the placeholder value after "Metadata keywords:" or "Keywords:" in the document ' +
          'with the correct keywords.',
        inputRequired: {
          type: 'textarea',
          label: 'Keywords',
          placeholder: 'keyword one, keyword two, keyword three',
          hint: 'At least 6 keywords, separated by commas. Use specific terms from this NOFO.',
          targetField: 'metadata.keywords',
          maxLength: 500,
          prefill: prefill ?? undefined,
          prefillNote: prefill
            ? 'Suggested based on your document content. Review carefully and edit before accepting \u2014 you know your NOFO better than this tool does.'
            : undefined,
          termCountRange: '6\u201310',
          minTermCount: 6,
        },
      },
    ];
  },
};

// ─── Keyword suggestion helpers ───────────────────────────────────────────────

/**
 * Words that are too generic to serve as keywords on their own.
 * A phrase where every content word appears in this set is excluded.
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
 * Stop words removed when extracting short representative phrases and when
 * scanning program description text for repeated n-grams.
 */
const PHRASE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'to', 'on', 'at', 'by', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'these', 'those', 'that', 'which', 'who', 'what', 'its',
  'from', 'into', 'over', 'under', 'through', 'between', 'among',
  'as', 'if', 'but', 'not', 'no', 'nor', 'so', 'yet', 'also',
]);

/**
 * Structural and generic NOFO section headings that must never appear as
 * keyword suggestions — these terms appear in every NOFO regardless of
 * the specific program content.
 */
const EXCLUDED_HEADINGS = new Set([
  // Structural headings that are universal to all NOFOs
  'funding strategy',
  'funding amounts',
  'component funding',
  'statutory authority',
  'eligible applicants',
  'delivery location',
  'application deadline',
  'merit review',
  'award information',
  'period of performance',
  'budget narrative',
  'project narrative',
  'grants management',
  'reporting requirements',
  // Standard NOFO structural sections
  'before you begin',
  'basic information',
  'funding details',
  'program description',
  'program summary',
  'program overview',
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
  'award administration',
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
  // Content-control field labels
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
 */
function stripArtifacts(raw: string): string {
  let s = raw.replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.):\]]\s*)/, '').trim();
  s = s.replace(/^[[\](){}*#@!»«·•–—/\\|<>\]]+/, '')
       .replace(/[[\](){}*#@!»«·•–—/\\|<>\]]+$/, '')
       .trim();
  s = s.replace(/\s+/g, ' ');
  return s;
}

/**
 * Strip artifact prefixes and reject if the result exceeds 3 words.
 */
function sanitizeKeywordCandidate(raw: string): string | null {
  const s = stripArtifacts(raw);
  if (!s) return null;
  if (s.split(/\s+/).filter(Boolean).length > 3) return null;
  return s;
}

/**
 * Extract up to `maxWords` tokens from `text`, skipping stop words.
 * When `excludeGeneric` is true, tokens in GENERIC_TERMS are also skipped,
 * producing a phrase made entirely of content words.
 */
function shortFormOf(text: string, maxWords: number, excludeGeneric = false): string | null {
  const result: string[] = [];
  for (const word of text.split(/\s+/)) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (
      lower.length > 1 &&
      !PHRASE_STOP_WORDS.has(lower) &&
      (!excludeGeneric || !GENERIC_TERMS.has(lower))
    ) {
      result.push(word);
      if (result.length >= maxWords) break;
    }
  }
  return result.length > 0 ? result.join(' ') : null;
}

/**
 * Normalize a keyword candidate: trim whitespace, condense internal whitespace,
 * and strip trailing punctuation (commas, periods). Applied once before exclusion
 * and duplicate checks so that candidates like "Funding strategy," are correctly
 * recognized as excluded rather than slipping through as a non-matching string.
 */
function normalizeCandidate(term: string): string {
  return term.trim().replace(/[,.]+$/, '').trim().replace(/\s+/g, ' ');
}

function isDuplicate(term: string, existing: string[]): boolean {
  const lower = term.toLowerCase();
  return existing.some(k => k.toLowerCase() === lower);
}

function isExcluded(term: string): boolean {
  return EXCLUDED_HEADINGS.has(term.toLowerCase());
}

/**
 * Returns true when `word` (already lowercased) is a content word:
 * at least 3 characters, not a stop word, and not in the generic-terms list.
 */
function isContentWord(word: string): boolean {
  return word.length >= 3 && !PHRASE_STOP_WORDS.has(word) && !GENERIC_TERMS.has(word);
}

/**
 * Extract agency/subagency/bureau/division names from metadata field lines in rawText.
 * Looks for lines formatted as "Agency: Name" or "Subagency: Name".
 * Values of 3 words or fewer are used as-is (after artifact stripping). Longer values
 * are shortened to the first 3 content words — skipping both stop words and generic
 * terms (e.g. "office", "bureau", "division") so the result is substantive.
 */
function extractAgencyTerms(rawText: string): string[] {
  const AGENCY_FIELD_RE = /^(?:agency|subagency|sub-agency|bureau|division)\s*:\s*(.+)/gim;
  const terms: string[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = AGENCY_FIELD_RE.exec(rawText)) !== null) {
    const raw = (m[1] ?? '').trim().replace(/\s+/g, ' ');
    if (!raw) continue;
    const sanitized = sanitizeKeywordCandidate(raw);
    const candidate = sanitized ?? shortFormOf(stripArtifacts(raw), 3, true);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(candidate);
  }
  return terms;
}

/**
 * Extract subject-matter keyword candidates from program description and summary
 * sections by counting repeated 2- and 3-word phrases (n-grams).
 *
 * A phrase must appear at least twice to be treated as intentional terminology
 * specific to this NOFO, which filters out one-off sentence starters and generic
 * structural language. At least one word in each phrase must be a content word
 * (not generic, not a stop word). Output is title-cased for display; capped at 6.
 */
function extractProgramSectionTerms(sections: Section[]): string[] {
  const PROGRAM_SECTION_RE =
    /^(program\s+(description|summary|overview|narrative|purpose)|about\s+(the\s+)?program|project\s+(description|summary|narrative))/i;

  const relevantText = sections
    .filter(s => PROGRAM_SECTION_RE.test(s.heading.trim()))
    .map(s => s.rawText)
    .join('\n');

  if (!relevantText) return [];

  // Tokenize: lowercase, treat hyphens as word boundaries, keep 3+ char alpha tokens.
  const words = relevantText
    .toLowerCase()
    .replace(/-/g, ' ')
    .match(/\b[a-z]{3,}\b/g) ?? [];

  const ngrams = new Map<string, number>();

  for (let i = 0; i < words.length; i++) {
    const w1 = words[i]!;
    if (PHRASE_STOP_WORDS.has(w1)) continue;

    // 2-gram: w1 + w2
    if (i + 1 < words.length) {
      const w2 = words[i + 1]!;
      if (!PHRASE_STOP_WORDS.has(w2) && (isContentWord(w1) || isContentWord(w2))) {
        const key = `${w1} ${w2}`;
        ngrams.set(key, (ngrams.get(key) ?? 0) + 1);
      }
    }

    // 3-gram: w1 + w2 + w3 (no stop words in any position)
    if (i + 2 < words.length) {
      const w2 = words[i + 1]!;
      const w3 = words[i + 2]!;
      if (
        !PHRASE_STOP_WORDS.has(w2) &&
        !PHRASE_STOP_WORDS.has(w3) &&
        (isContentWord(w1) || isContentWord(w2) || isContentWord(w3))
      ) {
        const key = `${w1} ${w2} ${w3}`;
        ngrams.set(key, (ngrams.get(key) ?? 0) + 1);
      }
    }
  }

  return [...ngrams.entries()]
    .filter(([phrase, count]) => count >= 2 && !EXCLUDED_HEADINGS.has(phrase))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)
    .map(([phrase]) =>
      // Title-case for display; user reviews before accepting
      phrase.replace(/\b\w/g, c => c.toUpperCase())
    );
}

function generateKeywordPrefill(doc: ParsedDocument, contentGuideId: string | null): string | null {
  const keywords: string[] = [];

  // 1. OpDiv name and abbreviation (from content guide detection)
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
    if (guide.opDiv === 'HRSA') {
      keywords.push(guide.subType?.includes('R&R') ? 'R&R Application Guide' : 'Application Guide');
    }

    const fullName = guide.detectionSignals.names[0];
    if (fullName) keywords.push(fullName);
    keywords.push(guide.opDiv);

    for (let i = 1; i < guide.detectionSignals.names.length; i++) {
      const subName = guide.detectionSignals.names[i];
      if (subName && doc.rawText.includes(subName)) {
        keywords.push(subName);
        break;
      }
    }
  }

  const MAX_KEYWORD_CHARS = 60;

  // 2. Agency/subagency/bureau/division names from metadata field lines
  for (const raw of extractAgencyTerms(doc.rawText)) {
    if (keywords.length >= 10) break;
    const term = normalizeCandidate(raw);
    if (term && !isExcluded(term) && !isDuplicate(term, keywords)) keywords.push(term);
  }

  // 3. Opportunity name
  const oppNameMatch = doc.rawText.match(/opportunity\s+name\s*:?\s*(.+?)(?:\n|$)/i);
  if (oppNameMatch?.[1]) {
    const oppNameRaw = oppNameMatch[1].trim().replace(/\s+/g, ' ');
    const raw = sanitizeKeywordCandidate(oppNameRaw) ?? shortFormOf(stripArtifacts(oppNameRaw), 3);
    if (raw) {
      const candidate = normalizeCandidate(raw);
      if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isExcluded(candidate) && !isDuplicate(candidate, keywords)) {
        keywords.push(candidate);
      }
    }
  }

  // 4. Tagline
  const taglineMatch = doc.rawText.match(/tagline\s*:?\s*(.+?)(?:\n|$)/i);
  if (taglineMatch?.[1]) {
    const taglineRaw = taglineMatch[1].trim().replace(/\s+/g, ' ');
    const raw = sanitizeKeywordCandidate(taglineRaw) ?? shortFormOf(stripArtifacts(taglineRaw), 3);
    if (raw) {
      const candidate = normalizeCandidate(raw);
      if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isExcluded(candidate) && !isDuplicate(candidate, keywords)) {
        keywords.push(candidate);
      }
    }
  }

  // 5. Subject-matter terms from program description / summary sections
  // (extractProgramSectionTerms applies EXCLUDED_HEADINGS internally; the
  // isExcluded guard here ensures consistency if the function ever changes)
  for (const raw of extractProgramSectionTerms(doc.sections)) {
    if (keywords.length >= 10) break;
    const term = normalizeCandidate(raw);
    if (term && !isExcluded(term) && !isDuplicate(term, keywords)) keywords.push(term);
  }

  if (keywords.length === 0) return null;

  const unique = [...new Set(keywords.filter(Boolean))].slice(0, 10);
  return unique.join(', ');
}

export default META_003;
