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
 *  - Only applies to content under H1–H6 headings whose text exactly matches
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
 * Count how many times phraseLC appears in text (case-sensitive substring search).
 */
function countOccurrences(text: string, phraseLC: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(phraseLC, pos)) !== -1) {
    count++;
    pos++;
  }
  return count;
}

/**
 * Count the number of non-bold occurrences of phraseLC in the given element.
 * Total occurrences minus those found inside <strong> or <b> children.
 * Uses Math.max(0, …) to guard against over-subtraction from nested bold elements.
 */
function countNonBoldOccurrences(el: Element, phraseLC: string): number {
  const total = countOccurrences((el.textContent ?? '').toLowerCase(), phraseLC);
  if (total === 0) return 0;

  let boldCount = 0;
  for (const bold of Array.from(el.querySelectorAll('strong, b'))) {
    boldCount += countOccurrences((bold.textContent ?? '').toLowerCase(), phraseLC);
  }
  return Math.max(0, total - boldCount);
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

      // Count non-bold occurrences so the reported total matches what buildDocx
      // actually changes (multiple occurrences in one element all get bolded).
      count += countNonBoldOccurrences(el, PHRASE_LC);
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
