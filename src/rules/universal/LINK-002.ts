import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LINK-002: Non-descriptive link text ("click here", "here", "this link", etc.)
 *
 * Two sub-cases:
 *  - Phrase patterns ("click here", "here", "read more", …) — surfaced with an
 *    inline text input so the user can supply replacement link text directly.
 *  - Single generic words ("link", "website", "page", "document") — surfaced as
 *    instruction-only because replacing just the link text won't produce a natural
 *    sentence; the user needs to rewrite the surrounding text in Word.
 */

/** Single generic words whose surrounding sentence must be rewritten in Word. */
const SINGLE_WORD_PATTERNS = [
  /^link$/i,
  /^website$/i,
  /^page$/i,
  /^document$/i,
];

/** Phrases where only the link text needs updating. */
const PHRASE_PATTERNS = [
  /^click here$/i,
  /^here$/i,
  /^this link$/i,
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

      const isSingleWord = SINGLE_WORD_PATTERNS.some(p => p.test(text));
      const isPhrase = !isSingleWord && PHRASE_PATTERNS.some(p => p.test(text));

      if (!isSingleWord && !isPhrase) return;

      const sectionId = findSectionForElement(link, doc);
      const { nearestHeading } = getContext(link);
      const description = `A hyperlink uses non-descriptive text: "${text}". This fails accessibility requirements. Link text must describe the destination without relying on surrounding context.`;

      if (isSingleWord) {
        issues.push({
          id: `LINK-002-${index}`,
          ruleId: 'LINK-002',
          title: 'Non-descriptive link text',
          severity: 'error',
          sectionId,
          nearestHeading,
          description,
          suggestedFix:
            `This link text is a single generic word embedded in a sentence. Replacing just the link text won't be enough — you'll need to rewrite the surrounding sentence in your Word document so the link text describes the destination in context.`,
          location: href,
          instructionOnly: true,
        });
      } else {
        issues.push({
          id: `LINK-002-${index}`,
          ruleId: 'LINK-002',
          title: 'Non-descriptive link text',
          severity: 'error',
          sectionId,
          nearestHeading,
          description,
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
