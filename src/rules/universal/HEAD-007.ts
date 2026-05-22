import type { Rule, AutoAppliedChange, ParsedDocument } from '../../types';

const HEAD_007: Rule = {
  id: 'HEAD-007',
  autoApply: true,
  check(doc: ParsedDocument): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const headings = Array.from(htmlDoc.querySelectorAll('h2, h3, h4'));

    const matches = headings.filter(h => {
      const text = (h.textContent ?? '').trim();
      return text.toLowerCase() === 'intergovernmental review' && text !== 'Intergovernmental review';
    });

    if (matches.length === 0) return [];

    return [{
      ruleId: 'HEAD-007',
      description: `"Intergovernmental Review" heading corrected to sentence case.`,
      targetField: 'heading.intergovernmentalreview.sentencecase',
      value: String(matches.length),
    }];
  },
};

export default HEAD_007;
