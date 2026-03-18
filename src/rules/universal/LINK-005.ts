import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-005: Duplicate link text pointing to different URLs
 * Flags cases where the same link text points to different destinations.
 */
const LINK_005: Rule = {
  id: 'LINK-005',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));

    // Build a map of link text -> set of hrefs
    const textToHrefs = new Map<string, Set<string>>();
    links.forEach(link => {
      const href = (link.getAttribute('href') ?? '').trim();
      const text = (link.textContent ?? '').trim().toLowerCase();

      if (text.length < 3 || href.startsWith('#') || href.startsWith('mailto:')) return;

      if (!textToHrefs.has(text)) {
        textToHrefs.set(text, new Set());
      }
      textToHrefs.get(text)!.add(href);
    });

    let issueIndex = 0;
    for (const [text, hrefs] of textToHrefs.entries()) {
      if (hrefs.size > 1) {
        const sectionId = doc.sections[0]?.id ?? 'section-preamble';
        const hrefList = Array.from(hrefs);

        issues.push({
          id: `LINK-005-${issueIndex}`,
          ruleId: 'LINK-005',
          title: 'Same link text points to different URLs',
          severity: 'warning',
          sectionId,
          description: `The link text "${text}" is used ${hrefs.size} times but points to different destinations: ${hrefList.map(h => `"${h}"`).join(', ')}. Screen reader users may find this confusing.`,
          suggestedFix: 'Use unique, descriptive link text for each distinct destination.',
          instructionOnly: true,
        });
        issueIndex++;
      }
    }

    return issues;
  },
};

export default LINK_005;
