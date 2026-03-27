import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LINK-003: Missing protocol in link URL
 * Flags links that are missing http:// or https:// in their href.
 */
const LINK_003: Rule = {
  id: 'LINK-003',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    const getContext = buildLocationLookup(htmlDoc);

    links.forEach((link, index) => {
      const href = (link.getAttribute('href') ?? '').trim();
      const text = (link.textContent ?? '').trim();

      // Skip internal anchors, mailto, tel, and properly formed URLs
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href === ''
      ) {
        return;
      }

      // Check for www. without protocol
      if (href.startsWith('www.') || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(href)) {
        const sectionId = findSectionForElement(link, doc);
        const { nearestHeading, page } = getContext(link);
        const suggestedUrl = `https://${href}`;

        issues.push({
          id: `LINK-003-${index}`,
          ruleId: 'LINK-003',
          title: 'Link is missing protocol (https://)',
          severity: 'error',
          sectionId,
          nearestHeading,
          page,
          description: `The link "${text}" has an href of "${href}" which is missing the protocol. Browsers may not resolve this correctly.`,
          suggestedFix: `Change the href to "${suggestedUrl}"`,
          location: href,
          inputRequired: {
            type: 'text',
            label: 'Corrected URL',
            prefill: suggestedUrl,
            prefillNote: 'We added https:// — verify this is correct.',
            targetField: `link.LINK-003-${index}.href`,
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

export default LINK_003;
