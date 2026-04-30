import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-017: Correct "grants.gov" capitalization (auto-apply)
 *
 * Replaces all case-insensitive occurrences of "grants.gov" with "Grants.gov"
 * in every w:t text run in word/document.xml, including runs inside w:hyperlink
 * elements. Only text content is updated — URLs, relationships, and all
 * formatting are untouched.
 *
 * Detection counts matches directly from doc.documentXml w:t nodes using the
 * same boundary-aware regex as the OOXML patch, so the reported count matches
 * what buildDocx will actually change. Occurrences inside longer domains
 * (e.g. "notgrants.gov", "grants.gov.uk", "apply.grants.gov") are excluded.
 *
 * Summary: "Grants.gov capitalization corrected in N location(s)."
 */

// Matches "grants.gov" (any case) only when it is not preceded by a word
// character or dot, and not followed by a dot + alpha (TLD extension).
// This avoids false positives on "notgrants.gov", "grants.gov.uk", etc.
const GRANTSGOV_RE = /(?<![.\w])grants\.gov(?!\.[a-zA-Z])/gi;

const CLEAN_017: Rule = {
  id: 'CLEAN-017',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');
    const wtNodes = Array.from(xmlDoc.getElementsByTagName('w:t'));

    let count = 0;
    for (const wt of wtNodes) {
      const text = wt.textContent ?? '';
      const matches = text.match(GRANTSGOV_RE) ?? [];
      count += matches.filter(m => m !== 'Grants.gov').length;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-017',
        description: `Grants.gov capitalization corrected in ${count} location${count === 1 ? '' : 's'}.`,
        targetField: 'text.grantsgov.capitalize',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_017;
