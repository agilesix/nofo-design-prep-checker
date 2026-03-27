import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LINK-001: Raw URL as link text
 * Flags hyperlinks whose display text is the same as the URL (raw URL display).
 */
const LINK_001: Rule = {
  id: 'LINK-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    const getContext = buildLocationLookup(htmlDoc);

    links.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const text = (link.textContent ?? '').trim();

      // Check if the link text looks like a URL
      const looksLikeUrl =
        text.startsWith('http://') ||
        text.startsWith('https://') ||
        text.startsWith('www.') ||
        /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(text);

      if (looksLikeUrl && text.length > 10) {
        const sectionId = findSectionForElement(link, doc);
        const { nearestHeading, page } = getContext(link);

        issues.push({
          id: `LINK-001-${index}`,
          ruleId: 'LINK-001',
          title: 'Raw URL used as link text',
          severity: 'warning',
          sectionId,
          nearestHeading,
          page,
          description: `A hyperlink uses the raw URL as its display text: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}". Link text should describe the destination, not show the URL.`,
          suggestedFix: "Update this link's display text in Word to describe where it goes — for example, 'Health IT Standards and Interoperability' instead of the raw URL. Right-click the link in Word → Edit Hyperlink → change the Text to display field.",
          location: href,
          instructionOnly: true,
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

export default LINK_001;
