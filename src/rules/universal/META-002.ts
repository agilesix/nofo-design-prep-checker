import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { extractMetadataBodyValue, isMetadataPlaceholder } from './metadataUtils';

/**
 * META-002: Document subject body-paragraph check.
 *
 * Flags the "Metadata subject:" (or "Subject:") paragraph when its value is
 * empty or a known placeholder. If the paragraph already contains a real
 * value, the rule produces no issue.
 */

const SUBJECT_FIELD_LABELS = ['metadata subject', 'subject'] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SUBJECT_FIELD_PATTERN = new RegExp(
  `^(?:${SUBJECT_FIELD_LABELS.map((label) => escapeRegex(label).replace(/\s+/g, '\\s+')).join('|')})\\s*:`,
  'i'
);
const META_002: Rule = {
  id: 'META-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const value = extractMetadataBodyValue(doc.html, SUBJECT_FIELD_PATTERN);

    // No matching paragraph in the document body — nothing to flag.
    if (value === null) return [];

    // Paragraph found with a real value — already filled in.
    if (!isMetadataPlaceholder(value)) return [];

    return [
      {
        id: 'META-002-subject',
        ruleId: 'META-002',
        title: 'Verify document subject metadata',
        severity: 'warning',
        sectionId: 'section-preamble',
        description:
          'The document Subject field should follow the formula: ' +
          '"A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO]." ' +
          'It should be a broad, high-level statement of purpose in one line (~25 words or less).',
        suggestedFix:
          'Replace the placeholder value after "Metadata subject:" or "Subject:" in the document ' +
          'with the correct subject.',
        inputRequired: {
          type: 'textarea',
          label: 'Document subject',
          placeholder:
            'A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO].',
          hint: 'One line, ~25 words or less. Begin with "A notice of funding opportunity from the\u2026"',
          targetField: 'metadata.subject',
          maxLength: 300,
        },
      },
    ];
  },
};

export default META_002;
