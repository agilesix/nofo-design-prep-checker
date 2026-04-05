import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-004: Orphaned "Footnotes" heading with no citations
 *
 * Detects a heading paragraph whose text is "Footnotes" (or a close variation)
 * when the document contains no actual footnotes or endnotes. This heading is
 * typically a leftover from the Word template that was never removed; it will
 * appear as an empty section in the published NOFO.
 */

const FOOTNOTES_HEADING_PATTERN = /^footnotes?\.?$/i;

/** Returns true if the given XML contains at least one real (non-separator) note entry. */
function hasRealNotes(xml: string): boolean {
  if (!xml) return false;
  const tagPattern = /<w:(?:footnote|endnote)\b[^>]*>/g;
  const separatorTypePattern = /w:type="(?:separator|continuationSeparator|continuationNotice)"/;
  return Array.from(xml.matchAll(tagPattern)).some(m => !separatorTypePattern.test(m[0]));
}

const NOTE_004: Rule = {
  id: 'NOTE-004',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const footnotesSection = doc.sections.find(s =>
      s.headingLevel > 0 && FOOTNOTES_HEADING_PATTERN.test(s.heading.trim())
    );
    if (!footnotesSection) return [];

    // Only flag if the document has no real footnotes or endnotes to back the heading
    if (hasRealNotes(doc.footnotesXml) || hasRealNotes(doc.endnotesXml)) return [];

    return [{
      id: 'NOTE-004-orphaned-heading',
      ruleId: 'NOTE-004',
      title: 'Footnotes heading found but document has no citations',
      severity: 'warning',
      sectionId: footnotesSection.id,
      description:
        'This document has a "Footnotes" heading but contains no footnotes or endnotes. ' +
        'The heading is likely a leftover from the Word template that was not removed. ' +
        'It will appear as an empty section in the published NOFO.',
      suggestedFix: 'Delete the "Footnotes" heading from your Word document.',
      instructionOnly: true,
    }];
  },
};

export default NOTE_004;
