import type { Rule, AutoAppliedChange, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-017: Normalize Grants.gov link text and URLs (auto-apply)
 *
 * Any hyperlink pointing to the Grants.gov root domain is silently normalized:
 *   - Link text of "grants.gov" or "www.grants.gov" (any case) → "Grants.gov"
 *   - Root-domain URLs (http variants, no-www, trailing slash) → https://www.grants.gov
 *
 * Links pointing to specific Grants.gov paths (e.g. /apply-for-grants/…) or
 * subdomains (e.g. apply.grants.gov) are flagged with a warning Issue instead —
 * the destination may have changed and requires human review.
 *
 * mailto: links (e.g. support@grants.gov) and internal anchor links are skipped.
 */

const CANONICAL_URL = 'https://www.grants.gov';

/** Matches bare Grants.gov domain text ("grants.gov", "www.grants.gov", any case). */
const GRANTSGOV_TEXT_RE = /^(www\.)?grants\.gov$/i;

/** Matches a root-domain Grants.gov URL (any scheme, optional www, optional trailing slash). */
const GRANTSGOV_ROOT_URL_RE = /^https?:\/\/(www\.)?grants\.gov\/?$/i;

function grantsGovHostname(href: string): string | null {
  if (!href.startsWith('http://') && !href.startsWith('https://')) return null;
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isGrantsGovHostname(hostname: string): boolean {
  return hostname === 'grants.gov' || hostname.endsWith('.grants.gov');
}

function sectionIdFor(doc: ParsedDocument, linkText: string): string {
  for (const section of doc.sections) {
    if (linkText && section.rawText.includes(linkText)) return section.id;
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

const CLEAN_017: Rule = {
  id: 'CLEAN-017',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): (AutoAppliedChange | Issue)[] {
    if (!doc.html) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    const results: (AutoAppliedChange | Issue)[] = [];
    let normalizeCount = 0;
    let issueIdx = 0;

    for (const link of Array.from(htmlDoc.querySelectorAll('a[href]'))) {
      const href = link.getAttribute('href') ?? '';

      // Skip internal anchors and non-http(s) schemes (including mailto:)
      if (!href.startsWith('http://') && !href.startsWith('https://')) continue;

      const hostname = grantsGovHostname(href);
      if (!hostname || !isGrantsGovHostname(hostname)) continue;

      const linkText = (link.textContent ?? '').trim();

      if (GRANTSGOV_ROOT_URL_RE.test(href)) {
        // Root domain: silently normalize text and/or URL
        const textNeedsNorm = GRANTSGOV_TEXT_RE.test(linkText) && linkText !== 'Grants.gov';
        const urlNeedsNorm = href !== CANONICAL_URL;

        if (textNeedsNorm || urlNeedsNorm) {
          normalizeCount++;
        }
      } else {
        // Specific-path or subdomain URL → warn
        const isSubdomain = hostname !== 'grants.gov' && hostname !== 'www.grants.gov';
        const urlKind = isSubdomain ? 'subdomain' : 'specific path';

        results.push({
          id: `CLEAN-017-${issueIdx++}`,
          ruleId: 'CLEAN-017',
          title: 'Grants.gov URL may need updating',
          severity: 'warning',
          sectionId: sectionIdFor(doc, linkText),
          nearestHeading: null,
          description:
            `The link “${linkText || href}” points to a Grants.gov ${urlKind} URL ` +
            `(${href}). This URL may have changed or may no longer be valid.`,
          suggestedFix:
            `Review this link and update the URL to ${CANONICAL_URL} if appropriate, ` +
            `or confirm the specific URL is still accurate.`,
          instructionOnly: true,
        });
      }
    }

    if (normalizeCount > 0) {
      results.unshift({
        ruleId: 'CLEAN-017',
        description: `Normalized ${normalizeCount} Grants.gov link${normalizeCount === 1 ? '' : 's'}.`,
        targetField: 'link.grantsgov.normalize',
        value: String(normalizeCount),
      });
    }

    return results;
  },
};

export default CLEAN_017;
