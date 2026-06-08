import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { slugifyHeading } from '../../utils/anchorUtils';

/**
 * CDC-001: Add internal link to "Financial capability statement" bullet (auto-apply)
 *
 * CDC NOFOs contain a "Project narrative" H2 section whose body includes a
 * bullet paragraph with the text "Financial capability statement." NOFO Builder
 * expects this bullet to carry an internal hyperlink that jumps to the matching
 * H4–H6 heading elsewhere in the document.
 *
 * This rule fires when all four conditions hold:
 *   1. The document is identified as a CDC NOFO (any CDC content guide).
 *   2. A "Project narrative" H2 heading exists.
 *   3. Within that H2 section (between the H2 and the next H2), a bullet
 *      paragraph whose text is an exact case-insensitive match to
 *      "Financial capability statement" exists and has no existing internal
 *      hyperlink (i.e. no <a href="#…"> descendant in the rendered HTML).
 *   4. An H4–H6 heading with text matching "Financial capability statement"
 *      (case-insensitive) exists somewhere in the document.
 *
 * When the rule fires, it emits an AutoAppliedChange whose value is the
 * slugified anchor of the target heading (via slugifyHeading). buildDocx.ts
 * reads that anchor and wraps the bullet's runs in a w:hyperlink w:anchor
 * element pointing to the bookmark.
 *
 * Scoped to all CDC content guides: cdc, cdc-research, cdc-dght-ssj,
 * cdc-dght-competitive, cdc-dghp.
 */

const TARGET_TEXT = 'financial capability statement';
const PROJECT_NARRATIVE = 'project narrative';

function htmlHeadingLevel(el: Element): number {
  const m = el.tagName.toLowerCase().match(/^h([1-6])$/);
  return m ? parseInt(m[1]!, 10) : 0;
}

const CDC_001: Rule = {
  id: 'CDC-001',
  autoApply: true,
  contentGuideIds: ['cdc', 'cdc-research', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cdc-dghp'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const bodyChildren = Array.from(htmlDoc.body.children);

    // 1. Find the "Project narrative" H2
    let sectionStart = -1;
    for (let i = 0; i < bodyChildren.length; i++) {
      const el = bodyChildren[i]!;
      if (
        htmlHeadingLevel(el) === 2 &&
        (el.textContent ?? '').trim().toLowerCase() === PROJECT_NARRATIVE
      ) {
        sectionStart = i;
        break;
      }
    }
    if (sectionStart === -1) return [];

    // 2. Find section end — the next H2
    let sectionEnd = bodyChildren.length;
    for (let i = sectionStart + 1; i < bodyChildren.length; i++) {
      if (htmlHeadingLevel(bodyChildren[i]!) === 2) {
        sectionEnd = i;
        break;
      }
    }

    // 3. Find a matching H4–H6 heading anywhere in the document
    let targetAnchor: string | null = null;
    for (const el of bodyChildren) {
      const level = htmlHeadingLevel(el);
      if (level >= 4 && level <= 6) {
        const text = (el.textContent ?? '').trim();
        if (text.toLowerCase() === TARGET_TEXT) {
          targetAnchor = slugifyHeading(text);
          break;
        }
      }
    }
    if (!targetAnchor) return [];

    // 4. Find "Financial capability statement" bullet in the section without
    //    an existing internal hyperlink
    const sectionElements = bodyChildren.slice(sectionStart + 1, sectionEnd);
    let bulletNeedsLink = false;

    outer: for (const el of sectionElements) {
      const tag = el.tagName.toLowerCase();
      const candidates: Element[] =
        tag === 'ul' || tag === 'ol'
          ? Array.from(el.querySelectorAll('li'))
          : tag === 'p'
          ? [el]
          : [];

      for (const candidate of candidates) {
        const text = (candidate.textContent ?? '').trim();
        if (text.toLowerCase() !== TARGET_TEXT) continue;
        // Already linked — skip
        const links = Array.from(candidate.querySelectorAll('a[href]'));
        const hasInternalLink = links.some(a =>
          (a.getAttribute('href') ?? '').startsWith('#')
        );
        if (!hasInternalLink) {
          bulletNeedsLink = true;
          break outer;
        }
      }
    }

    if (!bulletNeedsLink) return [];

    return [
      {
        ruleId: 'CDC-001',
        description: 'Internal link added to "Financial capability statement" bullet in Project narrative.',
        targetField: 'cdc.financial.capability.link',
        value: targetAnchor,
      },
    ];
  },
};

export default CDC_001;
