import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-007: [PDF] label on external PDF links (auto-apply)
 *
 * External hyperlinks whose URL contains ".pdf" (case-insensitive) must include
 * "[PDF]" at the end of the link text so readers know the link opens a PDF.
 *
 * Three cases are handled:
 *  1. Link text does not already contain "[PDF" (case-insensitive)
 *     → Append " [PDF]" to the link text in the downloaded document.
 *  2. Link text already contains "[PDF" anywhere (case-insensitive) — including
 *     "[PDF]", "[PDF - 312KB]", "[PDF - 1.2MB]", etc.
 *     → No change needed.
 *  3. "[PDF]" appears as plain text immediately after the hyperlink but is not
 *     part of the link text itself (e.g. "Report<a>…</a>[PDF]")
 *     → Move "[PDF]" inside the link text and remove the adjacent plain-text
 *        occurrence.
 *
 * Detection uses doc.html (mammoth-parsed HTML).  The OOXML patch is applied
 * in buildDocx via targetField 'link.pdf.label'.
 *
 * Internal bookmark links (#…) and mailto: links are excluded.
 */

const LINK_007: Rule = {
  id: 'LINK-007',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.html) return [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    let count = 0;

    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    for (const link of links) {
      const href = (link.getAttribute('href') ?? '').toLowerCase();

      // Exclude internal bookmark links, mailto links, and non-external URLs
      if (href.startsWith('#') || href.startsWith('mailto:')) continue;
      if (!href.startsWith('http://') && !href.startsWith('https://')) continue;

      // Only process links whose URL contains ".pdf"
      if (!href.includes('.pdf')) continue;

      const linkText = (link.textContent ?? '').trim();

      // Case 2: already contains [PDF anywhere (e.g. [PDF], [PDF - 312KB]) → no change
      if (/\[pdf/i.test(linkText)) continue;

      // Cases 1 and 3: link needs [PDF] added
      count++;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'LINK-007',
        description: `[PDF] label added to ${count} external PDF link${count === 1 ? '' : 's'}.`,
        targetField: 'link.pdf.label',
        value: String(count),
      },
    ];
  },
};

export default LINK_007;
