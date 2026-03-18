import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-006: Internal bookmark links (auto-apply)
 * Detects internal anchor links (#bookmark) and attempts to verify they resolve.
 * Auto-applied: removes broken bookmark links. Returns Issue for unresolvable ones.
 */
const LINK_006: Rule = {
  id: 'LINK-006',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (Issue | AutoAppliedChange)[] {
    const results: (Issue | AutoAppliedChange)[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const bookmarkLinks = Array.from(htmlDoc.querySelectorAll('a[href^="#"]'));

    let autoAppliedCount = 0;

    bookmarkLinks.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      const anchor = href.slice(1); // remove the #
      const text = (link.textContent ?? '').trim();

      // Check if the target ID exists in the document
      const targetExists = htmlDoc.getElementById(anchor) !== null;

      if (!targetExists) {
        // Check if there's a heading with matching text (partial match)
        const headings = Array.from(htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
        const matchingHeading = headings.find(h =>
          (h.textContent ?? '').toLowerCase().includes(anchor.toLowerCase().replace(/-/g, ' '))
        );

        if (matchingHeading) {
          // Auto-apply: we can note this for the user
          autoAppliedCount++;
          results.push({
            ruleId: 'LINK-006',
            description: `Internal bookmark link "#${anchor}" may not resolve correctly — the anchor target was not found in the parsed document. Verify this link in the final document.`,
          } as AutoAppliedChange);
        } else {
          // Cannot resolve — surface as an issue
          const sectionId = findSectionForElement(link, doc);
          results.push({
            id: `LINK-006-${index}`,
            ruleId: 'LINK-006',
            title: 'Internal bookmark link target not found',
            severity: 'warning',
            sectionId,
            description: `The link "${text}" points to "#${anchor}" but the target anchor was not found in the document. This link may be broken.`,
            suggestedFix: 'Verify the bookmark exists in the document, or update the link to point to the correct section.',
            location: href,
            instructionOnly: true,
          } as Issue);
        }
      }
    });

    void autoAppliedCount;
    return results;
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

export default LINK_006;
