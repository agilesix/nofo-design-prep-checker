import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

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
        // Find which section this link is in
        const sectionId = findSectionForElement(link, doc);

        issues.push({
          id: `LINK-001-${index}`,
          ruleId: 'LINK-001',
          title: 'Raw URL used as link text',
          severity: 'error',
          sectionId,
          description: `A hyperlink uses the raw URL as its display text: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}". Link text should describe the destination, not show the URL.`,
          suggestedFix: 'Replace the link text with a descriptive phrase that tells users where the link goes.',
          location: href,
          inputRequired: {
            type: 'text',
            label: 'New link text',
            placeholder: 'Descriptive link text',
            hint: 'Describe where the link goes. Avoid "click here" or raw URLs.',
            targetField: `link.LINK-001-${index}.text`,
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

export default LINK_001;
