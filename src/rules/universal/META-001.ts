import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { contentGuides } from '../../data/contentGuides';
import { extractMetadataBodyValue, isMetadataPlaceholder } from './metadataUtils';

/**
 * META-001: Document author body-paragraph check.
 *
 * Flags the "Metadata author:" (or "Author:") paragraph when its value is
 * empty or a known placeholder. If the paragraph already contains a real
 * value, the rule produces no issue.
 */

function buildMetadataFieldPattern(labels: readonly string[]): RegExp {
  return new RegExp(`^(?:${labels.join('|')})\\s*:`, 'i');
}

const AUTHOR_METADATA_FIELD_LABELS = ['metadata\\s+author', 'author'] as const;
const AUTHOR_FIELD_PATTERN = buildMetadataFieldPattern(AUTHOR_METADATA_FIELD_LABELS);
const META_001: Rule = {
  id: 'META-001',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    const value = extractMetadataBodyValue(doc.html, AUTHOR_FIELD_PATTERN);

    // No matching paragraph in the document body — nothing to flag.
    if (value === null) return [];

    // Paragraph found with a real value — already filled in.
    if (!isMetadataPlaceholder(value)) return [];

    const prefill = detectAuthorPrefill(doc.rawText, options.contentGuideId);

    return [
      {
        id: 'META-001-author',
        ruleId: 'META-001',
        title: 'Verify document author metadata',
        severity: 'warning',
        sectionId: 'section-preamble',
        description:
          'The document Author field should follow the format: "Full OpDiv Name (ABBREVIATION)", ' +
          'e.g., "Administration for Children and Families (ACF)".',
        suggestedFix:
          'Replace the placeholder value after "Metadata author:" or "Author:" in the document ' +
          'with the correct author name.',
        inputRequired: {
          type: 'text',
          label: 'Document author',
          placeholder: 'e.g. Centers for Disease Control and Prevention (CDC)',
          hint: 'Use the format: Full OpDiv Name (ABBREVIATION)',
          targetField: 'metadata.author',
          validationPattern: '^.+\\s+\\([A-Z]{2,10}\\)$',
          validationMessage: 'Must match format: Full Name (ABBREVIATION)',
          prefill: prefill ?? undefined,
          prefillNote: prefill
            ? 'Suggested based on your document. Confirm this is correct before accepting.'
            : undefined,
        },
      },
    ];
  },
};

/**
 * Detect the most likely OpDiv author string from the content guide or document text.
 * Returns a formatted "Full Name (ABBR)" string, or null if nothing could be detected.
 */
function detectAuthorPrefill(rawText: string, contentGuideId: string | null): string | null {
  // 1. Content guide is the strongest signal — use its OpDiv directly.
  if (contentGuideId) {
    const guide = contentGuides.find(g => g.id === contentGuideId);
    if (guide) {
      const fullName = guide.detectionSignals.names[0];
      const abbr = guide.opDiv;
      if (fullName && abbr) {
        return `${fullName} (${abbr})`;
      }
    }
  }

  // 2. Fall back to scanning raw document text for known OpDiv signals.
  for (const guide of contentGuides) {
    const { names, abbreviations } = guide.detectionSignals;
    const nameMatch = names.some(name => rawText.includes(name));
    const abbrMatch = abbreviations.some(abbr =>
      new RegExp(`\\b${abbr}\\b`).test(rawText)
    );
    if (nameMatch || abbrMatch) {
      const fullName = names[0];
      const abbr = guide.opDiv;
      if (fullName && abbr) {
        return `${fullName} (${abbr})`;
      }
    }
  }

  return null;
}

export default META_001;
