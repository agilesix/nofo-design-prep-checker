import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-017: Correct "grants.gov" capitalization (auto-apply)
 *
 * Replaces all case-insensitive occurrences of "grants.gov" with "Grants.gov"
 * in every w:t text run in word/document.xml, including runs inside w:hyperlink
 * elements. Only text content is updated — URLs, relationships, and all
 * formatting are untouched.
 *
 * Detection parses the HTML body text for occurrences of "grants.gov" (any
 * case) that are not already the correct "Grants.gov". If any are found, a
 * single AutoAppliedChange is emitted and buildDocx applies the fix to the
 * OOXML via applyGrantsGovCapitalization.
 *
 * Summary: "Grants.gov capitalization corrected in N location(s)."
 */

const CLEAN_017: Rule = {
  id: 'CLEAN-017',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.html) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const bodyText = htmlDoc.body?.textContent ?? '';

    const matches = bodyText.match(/grants\.gov/gi) ?? [];
    const count = matches.filter(m => m !== 'Grants.gov').length;
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
