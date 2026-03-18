import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * IMG-001: Images missing alt text
 *
 * Parses word/document.xml (stored on ParsedDocument.documentXml) rather than
 * the mammoth HTML so we can read the wp:docPr element's `id` attribute — a
 * stable, unique integer per drawing in the OOXML spec — and store it as the
 * targetField. buildDocx then finds the exact element by that id instead of
 * the first element with an empty descr, which would apply alt text to the
 * wrong image when multiple images are missing alt text.
 */
const IMG_001: Rule = {
  id: 'IMG-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    if (!doc.documentXml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');

    const issues: Issue[] = [];
    const docPrElements = Array.from(xmlDoc.getElementsByTagName('wp:docPr'));

    docPrElements.forEach(docPr => {
      const docPrId = docPr.getAttribute('id');
      if (!docPrId) return;

      const descr = docPr.getAttribute('descr');
      const name = docPr.getAttribute('name') ?? `Image ${docPrId}`;

      const isMissingAlt = descr === null;
      const isEmptyAlt = descr !== null && descr.trim() === '';

      // Determine nearest section by looking for the element in sections' raw text
      const sectionId = findSectionForDocPrId(docPrId, doc);

      if (isMissingAlt) {
        issues.push({
          id: `IMG-001-${docPrId}`,
          ruleId: 'IMG-001',
          title: 'Image is missing alt text',
          severity: 'error',
          sectionId,
          description: `"${name}" has no alt text (the descr attribute is absent). All images must have alt text unless they are purely decorative.`,
          suggestedFix: 'Add descriptive alt text, or set descr="" to mark the image as decorative.',
          inputRequired: {
            type: 'text',
            label: `Alt text for "${name}"`,
            placeholder: 'Describe what the image shows',
            hint: 'Leave blank to mark this image as decorative (sets descr="").',
            targetField: `image.docPr.${docPrId}`,
            maxLength: 250,
          },
        });
      } else if (isEmptyAlt) {
        issues.push({
          id: `IMG-001-empty-${docPrId}`,
          ruleId: 'IMG-001',
          title: 'Image has empty alt text — verify it is decorative',
          severity: 'suggestion',
          sectionId,
          description: `"${name}" has an empty alt attribute (descr=""). This is correct for decorative images, but if this image conveys information it needs descriptive alt text.`,
          suggestedFix: 'Verify this image is purely decorative. If it conveys information, add descriptive alt text.',
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

function findSectionForDocPrId(docPrId: string, doc: ParsedDocument): string {
  // Use the name attribute text as a loose proxy; fall back to first section
  for (const section of doc.sections) {
    if (section.rawText.includes(docPrId)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default IMG_001;
