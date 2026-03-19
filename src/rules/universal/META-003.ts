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

const GENERIC_TERMS = new Set([
  'grant', 'grants', 'federal', 'notice', 'funding', 'opportunity', 'application',
  'program', 'nofo', 'hhs', 'award', 'awards', 'eligible', 'eligibility',
  'requirements', 'information', 'activities', 'services', 'support',
  'health', 'department', 'administration', 'office', 'bureau', 'division',
  'section', 'period', 'fiscal', 'year', 'plan', 'report', 'review',
  'contact', 'submission', 'deadline', 'announcement',
]);

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

    // Full OpDiv name and abbreviation.
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

  // 2. Opportunity name — look for "Opportunity name:" near the top of the document.
  const oppNameMatch = doc.rawText.match(/opportunity\s+name\s*:?\s*(.+?)(?:\n|$)/i);
  if (oppNameMatch?.[1]) {
    const oppName = oppNameMatch[1].trim().replace(/\s+/g, ' ');
    if (oppName && oppName.length <= 120 && !isDuplicate(oppName, keywords)) {
      keywords.push(oppName);
    }
  }

  // 3. Distinctive noun phrases from H2/H3 section headings.
  const headingTerms = extractHeadingTerms(doc.sections);
  for (const term of headingTerms) {
    if (keywords.length >= 10) break;
    if (!isDuplicate(term, keywords)) keywords.push(term);
  }

  if (keywords.length === 0) return null;

  // Deduplicate, clean, cap at 10.
  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))].slice(0, 10);
  return unique.join(', ');
}

function isDuplicate(term: string, existing: string[]): boolean {
  const lower = term.toLowerCase();
  return existing.some(k => k.toLowerCase() === lower);
}

const SKIP_HEADINGS = new Set([
  'before you begin',
  'program description',
  'eligibility',
  'application and submission information',
  'review information',
  'award administration information',
  'contacts and support',
  'other information',
  'overview',
  'summary',
  'introduction',
  'background',
]);

function extractHeadingTerms(sections: Section[]): string[] {
  const terms: string[] = [];

  for (const section of sections) {
    if (section.headingLevel < 2) continue;
    const heading = section.heading.trim();
    if (!heading) continue;
    if (SKIP_HEADINGS.has(heading.toLowerCase())) continue;

    // Use the full heading if it's short enough and has specific content.
    const words = heading.split(/\s+/).filter(w => {
      const lower = w.toLowerCase().replace(/[^a-z]/g, '');
      return lower.length > 3 && !GENERIC_TERMS.has(lower);
    });

    if (words.length === 0) continue;

    // Short headings: use as-is. Long headings: take first 4 meaningful words.
    const term = words.length <= 5 ? heading : words.slice(0, 4).join(' ');
    terms.push(term);

    if (terms.length >= 6) break;
  }

  return terms;
}

export default META_003;
