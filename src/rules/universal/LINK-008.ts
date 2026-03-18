import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-008: Email links without mailto: protocol
 * Flags email addresses that appear as plain text or non-mailto links.
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

const LINK_008: Rule = {
  id: 'LINK-008',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Find email addresses in plain text (not already in mailto links)
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker
      ? document.createTreeWalker(htmlDoc.body, NodeFilter.SHOW_TEXT)
      : null;

    if (walker) {
      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        const parent = (node as Text).parentElement;
        // Skip if already inside a mailto link
        if (parent?.closest('a[href^="mailto:"]')) continue;
        textNodes.push(node as Text);
      }
    }

    let issueIndex = 0;
    for (const textNode of textNodes) {
      const text = textNode.textContent ?? '';
      const matches = text.match(EMAIL_PATTERN);
      if (matches) {
        for (const email of matches) {
          const sectionId = findSectionForNode(textNode, doc);
          issues.push({
            id: `LINK-008-${issueIndex}`,
            ruleId: 'LINK-008',
            title: 'Email address not formatted as a link',
            severity: 'suggestion',
            sectionId,
            description: `The email address "${email}" appears as plain text. It should be formatted as a mailto: hyperlink so users can click to send email.`,
            suggestedFix: `Format as a link: <a href="mailto:${email}">${email}</a>`,
            location: email,
            instructionOnly: true,
          });
          issueIndex++;
        }
      }
    }

    // Also check for links with email addresses in href that aren't mailto:
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    links.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      if (EMAIL_PATTERN.test(href) && !href.startsWith('mailto:')) {
        const sectionId = findSectionForElement(link, doc);
        issues.push({
          id: `LINK-008-href-${index}`,
          ruleId: 'LINK-008',
          title: 'Email link missing mailto: protocol',
          severity: 'error',
          sectionId,
          description: `A link appears to point to an email address but is missing the "mailto:" protocol: "${href}"`,
          suggestedFix: `Change the href to "mailto:${href}"`,
          location: href,
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

function findSectionForNode(node: Text, doc: ParsedDocument): string {
  const text = (node.textContent ?? '').slice(0, 50);
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LINK_008;
