import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-012: Bold "asterisked ( * )" in Approach and Program logic model sections (auto-apply)
 *
 * Finds the exact phrase "asterisked ( * )" (case-insensitive) in paragraphs and
 * list items under headings that match "Approach" or "Program logic model"
 * (case-insensitive). If the phrase is present and not already fully bold, it is
 * silently bolded in the downloaded output.
 *
 * Scope:
 *  - Only applies to content under H2–H6 headings whose text exactly matches
 *    "Approach" or "Program logic model" (and their subheadings).
 *  - Scope ends when a heading at the same or higher level is encountered.
 *  - No changes are made outside these sections.
 *
 * Detection uses doc.html (mammoth-parsed HTML). The OOXML patch is applied in
 * buildDocx via targetField 'text.asterisked.bold'. The OOXML handler splits runs
 * as needed to isolate the exact phrase before adding bold.
 */

const PHRASE = 'asterisked ( * )';
const PHRASE_LC = PHRASE.toLowerCase();
const SCOPE_PATTERN = /^(approach|program logic model)$/i;

/**
 * Returns true if the phrase is fully wrapped in a <strong> or <b> element
 * within the given element.
 */
function isPhraseFullyBold(el: Element, phraseLC: string): boolean {
  const bolds = Array.from(el.querySelectorAll('strong, b'));
  for (const bold of bolds) {
    if ((bold.textContent ?? '').toLowerCase().includes(phraseLC)) return true;
  }
  return false;
}

const CLEAN_012: Rule = {
  id: 'CLEAN-012',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.html) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    let inScope = false;
    let scopeLevel = 0;
    let count = 0;

    const elements = Array.from(
      htmlDoc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li')
    );

    for (const el of elements) {
      const tag = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1]!, 10);
        const text = (el.textContent ?? '').trim();

        if (SCOPE_PATTERN.test(text)) {
          inScope = true;
          scopeLevel = level;
        } else if (inScope && level <= scopeLevel) {
          inScope = false;
        }
        continue;
      }

      if (!inScope) continue;

      const paraText = (el.textContent ?? '').toLowerCase();
      if (!paraText.includes(PHRASE_LC)) continue;

      // Phrase is present — check if already fully bold
      if (isPhraseFullyBold(el, PHRASE_LC)) continue;

      count++;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-012',
        description: `"${PHRASE}" bolded in ${count} instance${count === 1 ? '' : 's'}.`,
        targetField: 'text.asterisked.bold',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_012;
