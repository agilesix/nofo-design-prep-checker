import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-014: Remove wrapping quotation marks from the tagline value (auto-apply)
 *
 * Finds the tagline paragraph ("Tagline: …") in the document body. If the
 * value after the colon is wrapped in matching straight double quotes ("…") or
 * smart/curly double quotes (\u201C…\u201D), strips them. Only removes quotes
 * that wrap the entire value — mid-value quotes and mismatched pairs (one side
 * only) are left for the user to fix manually.
 */
const CLEAN_014: Rule = {
  id: 'CLEAN-014',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const taglinePara = Array.from(htmlDoc.querySelectorAll('p')).find(p =>
      /^tagline\s*:/i.test((p.textContent ?? '').trim())
    );
    if (!taglinePara) return [];

    const fullText = (taglinePara.textContent ?? '').trim();
    const colonIdx = fullText.indexOf(':');
    if (colonIdx === -1) return [];

    const value = fullText.slice(colonIdx + 1).trim();
    if (!hasWrappingQuotes(value)) return [];

    return [
      {
        ruleId: 'CLEAN-014',
        description: 'Quotation marks removed from tagline.',
        targetField: 'text.tagline.unquote',
      },
    ];
  },
};

function hasWrappingQuotes(value: string): boolean {
  if (value.length < 2) return false;
  const first = value[0];
  const last = value[value.length - 1];
  if (first === '"' && last === '"') return true;
  if (first === '\u201C' && last === '\u201D') return true;
  return false;
}

export default CLEAN_014;
