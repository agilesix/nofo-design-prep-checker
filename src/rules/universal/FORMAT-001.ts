import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * FORMAT-001: Excessive bold text
 * Flags sections where an unusually high percentage of text is bold,
 * which may indicate the original document used bold for emphasis in ways
 * that won't translate well to the design system.
 */
const FORMAT_001: Rule = {
  id: 'FORMAT-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    void parser.parseFromString(doc.html, 'text/html');

    // Check each section for excessive bold
    for (const section of doc.sections) {
      if (!section.html || section.headingLevel === 0) continue;

      const sectionDoc = parser.parseFromString(section.html, 'text/html');
      const allText = sectionDoc.body.textContent ?? '';
      const boldElements = Array.from(sectionDoc.querySelectorAll('strong, b'));

      if (allText.length < 100) continue; // Skip very short sections

      const boldTextLength = boldElements.reduce((sum, el) => sum + (el.textContent ?? '').length, 0);
      const boldRatio = boldTextLength / allText.length;

      // Flag if more than 40% of section text is bold (excluding headings)
      if (boldRatio > 0.4 && boldTextLength > 200) {
        issues.push({
          id: `FORMAT-001-${section.id}`,
          ruleId: 'FORMAT-001',
          title: 'Section contains excessive bold text',
          severity: 'suggestion',
          sectionId: section.id,
          description: `The section "${section.heading}" has ${Math.round(boldRatio * 100)}% of its text formatted as bold. Excessive bold formatting may indicate that Word styles weren't used correctly, or that emphasis is overused.`,
          suggestedFix: 'Review bold formatting in this section. Use bold only for truly important terms or to indicate field labels — not for general emphasis. Consider using proper heading styles instead.',
          instructionOnly: true,
        });
      }
    }

    return issues;
  },
};

export default FORMAT_001;
