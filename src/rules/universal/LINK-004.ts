import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-004: Malformed URL check
 * Flags links with obviously malformed or invalid URLs.
 */
const LINK_004: Rule = {
  id: 'LINK-004',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));

    links.forEach((link, index) => {
      const href = (link.getAttribute('href') ?? '').trim();
      const text = (link.textContent ?? '').trim();

      // Skip internal anchors, mailto, tel, empty
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href === ''
      ) {
        return;
      }

      // Only check http/https links for malformation
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        return;
      }

      let isValid = false;
      try {
        const url = new URL(href);
        // Basic checks: must have a hostname with a dot
        isValid = url.hostname.includes('.') && url.hostname.length > 3;
      } catch {
        isValid = false;
      }

      if (!isValid) {
        const sectionId = findSectionForElement(link, doc);

        issues.push({
          id: `LINK-004-${index}`,
          ruleId: 'LINK-004',
          title: 'Malformed link URL',
          severity: 'error',
          sectionId,
          description: `The link "${text}" has a URL that appears to be malformed: "${href}". This link may not work correctly.`,
          suggestedFix: 'Verify and correct the URL.',
          location: href,
          inputRequired: {
            type: 'text',
            label: 'Corrected URL',
            prefill: href,
            hint: 'Enter the correct full URL including https://',
            targetField: `link.LINK-004-${index}.href`,
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

export default LINK_004;
