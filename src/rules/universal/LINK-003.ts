import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-003: Correct "grants.gov" capitalization to "Grants.gov" (auto-apply)
 *
 * Scans all w:t text runs — both inside w:hyperlink elements and in plain body
 * text — and replaces any case-insensitive match of "grants.gov" with the
 * canonical form "Grants.gov". Only the matched substring is replaced;
 * surrounding text, run properties, and hyperlink URLs are left untouched.
 */

const LINK_003: Rule = {
  id: 'LINK-003',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const wT of Array.from(xmlDoc.getElementsByTagName('w:t'))) {
      const text = wT.textContent ?? '';
      if (text.replace(/grants\.gov/gi, 'Grants.gov') !== text) count++;
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
