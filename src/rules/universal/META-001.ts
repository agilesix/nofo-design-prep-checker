import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { contentGuides } from '../../data/contentGuides';

/**
 * META-001: Document Author metadata check
 * Checks that the document Author field follows the format: "Full OpDiv Name (ABBREVIATION)"
 */
const META_001: Rule = {
  id: 'META-001',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    // Author metadata is checked via the zip archive's docProps/core.xml
    // We use the rawText as a proxy since mammoth doesn't expose metadata
    // The actual check will happen during XML inspection
    const authorPattern = /^.+\s+\([A-Z]{2,10}\)$/;

    // Try to detect if there's a metadata issue via zip archive inspection
    // Since we can't easily await here, we flag it for the user to review
    const archiveFile = doc.zipArchive.file('docProps/core.xml');
    if (!archiveFile) {
      issues.push({
        id: 'META-001-no-core',
        ruleId: 'META-001',
        title: 'Document author metadata is missing',
        severity: 'error',
        sectionId: 'section-preamble',
        description: 'The document is missing core metadata (docProps/core.xml). Author information cannot be verified.',
        suggestedFix: 'Save the document as a .docx file from Microsoft Word and re-upload.',
      });
      return issues;
    }

    // We'll flag that metadata should be checked — detailed async check is done in the app layer
    // For now, surface a warning so users know to check it
    void authorPattern; // used in validation

    const prefill = detectAuthorPrefill(doc.rawText, options.contentGuideId);

    issues.push({
      id: 'META-001-author',
      ruleId: 'META-001',
      title: 'Verify document author metadata',
      severity: 'warning',
      sectionId: 'section-preamble',
      description: 'The document Author field should follow the format: "Full OpDiv Name (ABBREVIATION)", e.g., "Administration for Children and Families (ACF)".',
      suggestedFix: 'Update the Author field in Document Properties.',
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
    });

    return issues;
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
