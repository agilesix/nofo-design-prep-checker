import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LINK-002: Non-descriptive link text ("click here", "here", "this link", etc.)
 */
const NON_DESCRIPTIVE_PATTERNS = [
  /^click here$/i,
  /^here$/i,
  /^this link$/i,
  /^link$/i,
  /^read more$/i,
  /^more$/i,
  /^learn more$/i,
  /^this$/i,
  /^go here$/i,
  /^this page$/i,
  /^this document$/i,
  /^this form$/i,
  /^this website$/i,
  /^this site$/i,
  /^click$/i,
];

const LINK_002: Rule = {
  id: 'LINK-002',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    const getContext = buildLocationLookup(htmlDoc);

    links.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const text = (link.textContent ?? '').trim();

      const isNonDescriptive = NON_DESCRIPTIVE_PATTERNS.some(pattern => pattern.test(text));

      if (isNonDescriptive) {
        const sectionId = findSectionForElement(link, doc);
        const { nearestHeading } = getContext(link);

        issues.push({
          id: `LINK-002-${index}`,
          ruleId: 'LINK-002',
          title: 'Non-descriptive link text',
          severity: 'error',
          sectionId,
          nearestHeading,
          description: `A hyperlink uses non-descriptive text: "${text}". This fails accessibility requirements. Link text must describe the destination without relying on surrounding context.`,
          suggestedFix: 'Replace the link text with a descriptive phrase that identifies where the link goes.',
          location: href,
          inputRequired: {
            type: 'text',
            label: 'New link text',
            placeholder: 'Descriptive link text',
            hint: 'Describe where the link goes. Avoid "click here", "here", or similar phrases.',
            targetField: `link.LINK-002-${index}.text`,
          },
        });
      }
    });

    return issues;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LINK_002;
