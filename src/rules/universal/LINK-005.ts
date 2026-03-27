import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-005: Duplicate link text pointing to different URLs
 * Flags cases where the same link text points to different destinations.
 * All offending link texts are consolidated into a single suggestion card.
 */
const LINK_005: Rule = {
  id: 'LINK-005',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
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

    // Collect all offending link texts (those pointing to more than one destination)
    const offenders: Array<{ text: string; count: number }> = [];
    for (const [text, hrefs] of textToHrefs.entries()) {
      if (hrefs.size > 1) {
        offenders.push({ text, count: hrefs.size });
      }
    }

    if (offenders.length === 0) return [];

    // Sort by destination count descending so the most ambiguous appear first
    offenders.sort((a, b) => b.count - a.count);

    const shown = offenders.slice(0, 3);
    const remaining = offenders.length - shown.length;

    const exampleList = shown
      .map(o => `"${o.text}" — ${o.count} destinations`)
      .join(', ');

    const description =
      `${offenders.length} link text${offenders.length === 1 ? '' : 's'} point to different URLs: ` +
      exampleList +
      (remaining > 0 ? `, and ${remaining} more` : '') +
      '. Screen reader users may find this confusing.';

    return [
      {
        id: 'LINK-005-0',
        ruleId: 'LINK-005',
        title: `${offenders.length} link text${offenders.length === 1 ? '' : 's'} point to different URLs`,
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description,
        suggestedFix: 'Use unique, descriptive link text for each distinct destination.',
        instructionOnly: true,
      },
    ];
  },
};

export default LINK_005;
