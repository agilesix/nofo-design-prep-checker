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
          'The document Keywords field should contain 8\u201310 specific terms or phrases drawn ' +
          'directly from the language of the NOFO, separated by commas. These should be ' +
          'fine-grained search terms, not high-level category words.',
        suggestedFix:
          'Replace the placeholder value after "Metadata keywords:" or "Keywords:" in the document ' +
          'with the correct keywords.',
        inputRequired: {
          type: 'textarea',
          label: 'Keywords',
          placeholder: 'keyword one, keyword two, keyword three',
          hint: '8\u201310 keywords, separated by commas. Use specific terms from the NOFO.',
          targetField: 'metadata.keywords',
          maxLength: 500,
          prefill: prefill ?? undefined,
          prefillNote: prefill
            ? 'Suggested based on your document content. Review carefully and edit before accepting \u2014 you know your NOFO better than this tool does.'
            : undefined,
          termCountRange: '8\u201310',
          minTermCount: 5,
        },
      },
    ];
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
 * Extract up to `maxWords` non-stop-word tokens from `text` and join them.
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

  const oppNameMatch = doc.rawText.match(/opportunity\s+name\s*:?\s*(.+?)(?:\n|$)/i);
  if (oppNameMatch?.[1]) {
    const oppNameRaw = oppNameMatch[1].trim().replace(/\s+/g, ' ');
    const sanitized = sanitizeKeywordCandidate(oppNameRaw);
    const candidate = sanitized ?? shortFormOf(stripArtifacts(oppNameRaw), 3);
    if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isDuplicate(candidate, keywords)) {
      keywords.push(candidate);
    }
  }

  const taglineMatch = doc.rawText.match(/tagline\s*:?\s*(.+?)(?:\n|$)/i);
  if (taglineMatch?.[1]) {
    const taglineRaw = taglineMatch[1].trim().replace(/\s+/g, ' ');
    const sanitized = sanitizeKeywordCandidate(taglineRaw);
    const candidate = sanitized ?? shortFormOf(stripArtifacts(taglineRaw), 3);
    if (candidate && candidate.length <= MAX_KEYWORD_CHARS && !isDuplicate(candidate, keywords)) {
      keywords.push(candidate);
    }
  }

  const headingTerms = extractHeadingTerms(doc.sections);
  for (const term of headingTerms) {
    if (keywords.length >= 10) break;
    if (!isDuplicate(term, keywords)) keywords.push(term);
  }

  if (keywords.length === 0) return null;

  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))].slice(0, 10);
  return unique.join(', ');
}

/**
 * Extract up to 6 keyword candidates from document section headings.
 */
function extractHeadingTerms(sections: Section[]): string[] {
  const terms: string[] = [];

  for (const section of sections) {
    if (section.headingLevel < 2) continue;

    const sanitized = sanitizeKeywordCandidate(section.heading);
    if (!sanitized) continue;

    if (isNavigationalHeading(sanitized)) continue;

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
