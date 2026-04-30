import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-003: Correct "grants.gov" capitalization to "Grants.gov" (auto-apply)
 *
 * Scans all w:t text runs in the document body, footnotes, and endnotes and
 * replaces any case-insensitive match of "grants.gov" with "Grants.gov". Only
 * the matched substring within each individual w:t node is replaced; surrounding
 * text, run properties, and hyperlink URLs are left untouched. Occurrences of
 * "grants.gov" split across multiple adjacent text runs are not corrected.
 */

const LINK_003: Rule = {
  id: 'LINK-003',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const sources = [doc.documentXml, doc.footnotesXml, doc.endnotesXml].filter(Boolean);
    if (sources.length === 0) return [];

    const parser = new DOMParser();
    let count = 0;
    for (const xml of sources) {
      const xmlDoc = parser.parseFromString(xml, 'application/xml');
      for (const wT of Array.from(xmlDoc.getElementsByTagName('w:t'))) {
        const text = wT.textContent ?? '';
        if (text.replace(/grants\.gov/gi, 'Grants.gov') !== text) count++;
      }
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'LINK-003',
        description: `Grants.gov capitalization corrected in ${count} location${count === 1 ? '' : 's'}.`,
        targetField: 'link.grantsgov.capitalization',
        value: String(count),
      },
    ];
  },
};

export default LINK_003;
