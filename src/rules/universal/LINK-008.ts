import type { Rule, Issue, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-008: Email address mailto: enforcement
 *
 * Auto-apply: converts plain-text email addresses to mailto: hyperlinks.
 * The OOXML patch is applied in buildDocx using the targetField/value fields
 * carried on AutoAppliedChange.
 *
 * User-confirmed issue: links whose href contains an email but lacks mailto:.
 */

// No global flag — a regex with /g used in .test() is stateful (advances lastIndex)
// and produces false negatives on repeated calls against the same pattern instance.
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const LINK_008: Rule = {
  id: 'LINK-008',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (Issue | AutoAppliedChange)[] {
    const results: (Issue | AutoAppliedChange)[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // ── Plain-text emails → auto-applied mailto: conversion ──────────────────
    const walker = typeof htmlDoc.createTreeWalker === 'function'
      ? htmlDoc.createTreeWalker(htmlDoc.body ?? htmlDoc, NodeFilter.SHOW_TEXT)
      : null;

    if (walker) {
      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        const textNode = node as Text;
        const parent = textNode.parentElement;
        if (!parent) continue;

        // Already inside a link — skip
        if (parent.closest('a')) continue;

        // Inside a code block — skip
        if (parent.closest('code, pre')) continue;

        // Inside a table header cell (label, not value) — skip
        if (parent.closest('th')) continue;

        const text = textNode.textContent ?? '';
        const matches = text.match(new RegExp(EMAIL_PATTERN.source, 'g'));
        if (!matches) continue;

        for (const email of matches) {
          results.push({
            ruleId: 'LINK-008',
            description: `Email address converted to a mailto: link — ${email}`,
            targetField: 'email.mailto',
            value: email,
          } satisfies AutoAppliedChange);
        }
      }
    }

    // ── href with email but missing mailto: protocol → user-confirmed issue ──
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    links.forEach((link, index) => {
      const href = link.getAttribute('href') ?? '';
      if (EMAIL_PATTERN.test(href) && !href.startsWith('mailto:')) {
        const sectionId = findSectionForElement(link, doc);
        results.push({
          id: `LINK-008-href-${index}`,
          ruleId: 'LINK-008',
          title: 'Email link missing mailto: protocol',
          severity: 'error',
          sectionId,
          description: `A link appears to point to an email address but is missing the "mailto:" protocol: "${href}"`,
          suggestedFix: `Change the href to "mailto:${href}"`,
          location: href,
          instructionOnly: true,
        } satisfies Issue);
      }
    });

    return results;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = el.textContent ?? '';
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LINK_008;
