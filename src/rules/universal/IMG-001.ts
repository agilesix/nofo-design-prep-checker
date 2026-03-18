import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * IMG-001: Images missing alt text
 * Flags <img> elements with no or empty alt attribute.
 */
const IMG_001: Rule = {
  id: 'IMG-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const images = Array.from(htmlDoc.querySelectorAll('img'));

    images.forEach((img, index) => {
      const alt = img.getAttribute('alt');
      const src = img.getAttribute('src') ?? '';

      const isMissingAlt = alt === null;
      const isEmptyAlt = alt !== null && alt.trim() === '';

      if (isMissingAlt) {
        const sectionId = findSectionForElement(img, doc);

        issues.push({
          id: `IMG-001-${index}`,
          ruleId: 'IMG-001',
          title: 'Image is missing alt text',
          severity: 'error',
          sectionId,
          description: `An image (${src ? `src: "${src.slice(0, 60)}"` : 'no src'}) is missing the alt attribute entirely. All images must have alt text unless they are decorative.`,
          suggestedFix: 'Add a descriptive alt text to the image in the source document, or mark it as decorative with an empty alt="" if it conveys no information.',
          inputRequired: {
            type: 'text',
            label: 'Alt text for this image',
            placeholder: 'Describe what the image shows',
            hint: 'If the image is decorative (adds no information), leave this blank and check the "decorative" option.',
            targetField: `image.IMG-001-${index}.alt`,
            maxLength: 250,
          },
        });
      } else if (isEmptyAlt) {
        // Empty alt is valid for decorative images, but flag as suggestion to verify
        const sectionId = findSectionForElement(img, doc);

        issues.push({
          id: `IMG-001-empty-${index}`,
          ruleId: 'IMG-001',
          title: 'Image has empty alt text — verify it is decorative',
          severity: 'suggestion',
          sectionId,
          description: `An image has an empty alt attribute (alt=""). This is correct for decorative images, but if this image conveys information, it needs descriptive alt text.`,
          suggestedFix: 'Verify this image is purely decorative. If it conveys information, add descriptive alt text.',
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  // Images may not have text content; try to find by position in document
  const allImages = new DOMParser()
    .parseFromString(doc.html, 'text/html')
    .querySelectorAll('img');
  const elSrc = el.getAttribute('src') ?? '';

  for (const section of doc.sections) {
    if (elSrc && section.html.includes(elSrc)) {
      return section.id;
    }
  }

  void allImages;
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default IMG_001;
