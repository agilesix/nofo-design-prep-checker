import type { Rule, AutoAppliedChange, ParsedDocument } from '../../types';

const HEAD_006: Rule = {
  id: 'HEAD-006',
  autoApply: true,
  check(doc: ParsedDocument): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const headings = Array.from(htmlDoc.querySelectorAll('h1, h2, h3'));

    const matches = headings.filter(h => {
      const text = (h.textContent ?? '').trim();
      return text.toLowerCase() === 'agency priorities';
    });

    if (matches.length === 0) return [];

    return [{
      ruleId: 'HEAD-006',
      description: `"Agency Priorities" heading corrected to sentence case.`,
      targetField: 'heading.agencypriorities.sentencecase',
      value: String(matches.length),
    }];
  },
};

export default HEAD_006;
