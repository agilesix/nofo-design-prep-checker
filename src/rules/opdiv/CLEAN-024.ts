import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-024: Add OpDiv and Agency field labels in Basic information for ACL
 * NOFOs (auto-apply, ACL only)
 *
 * Scans the "Basic information" section (H2 or H3, case-insensitive) for
 * unlabeled organizational lines and prepends the appropriate field label.
 *
 *  1. If a paragraph containing exactly "Administration for Community Living"
 *     is found without an "OpDiv:" prefix, "OpDiv: " is prepended.
 *
 *  2. The paragraph immediately following is also checked. If it exists, is not
 *     a heading, and does not already start with a known field label, "Agency: "
 *     is prepended to it.
 *
 * Known field labels (any of these at the start of the paragraph prevent fix 2):
 *   OpDiv:, Agency:, Subagency:, Opportunity name:, Opportunity number:,
 *   NOFO number:, CFDA:, Program name:, Due date:
 *
 * Only the first qualifying "Administration for Community Living" paragraph in
 * the Basic information section is corrected.
 *
 * Scoped to ACL content guide only.
 */

const KNOWN_LABEL_RE =
  /^(?:OpDiv|Agency|Subagency|Opportunity\s+(?:name|number)|NOFO\s+number|CFDA|Program\s+name|Due\s+date)\s*:/i;

const ACL_FULL_NAME = 'Administration for Community Living';

/** Heading level from an HTML element (0 if not a heading). */
function headingLevel(el: Element): number {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1') return 1;
  if (tag === 'h2') return 2;
  if (tag === 'h3') return 3;
  if (tag === 'h4') return 4;
  if (tag === 'h5') return 5;
  if (tag === 'h6') return 6;
  return 0;
}

interface LabelFixes {
  needsOpDiv: boolean;
  needsAgency: boolean;
}

function detectLabelFixes(htmlDoc: Document): LabelFixes {
  const body = htmlDoc.body;
  if (!body) return { needsOpDiv: false, needsAgency: false };

  const children = Array.from(body.children);

  // Locate "Basic information" heading (H2 or H3)
  let sectionIdx = -1;
  let sectionLevel = 0;
  for (let i = 0; i < children.length; i++) {
    const el = children[i]!;
    const level = headingLevel(el);
    if (level >= 2 && level <= 3 && /basic\s+information/i.test(el.textContent ?? '')) {
      sectionIdx = i;
      sectionLevel = level;
      break;
    }
  }
  if (sectionIdx === -1) return { needsOpDiv: false, needsAgency: false };

  // Search within the section for an unlabeled ACL_FULL_NAME paragraph
  for (let i = sectionIdx + 1; i < children.length; i++) {
    const el = children[i]!;
    const level = headingLevel(el);
    if (level > 0 && level <= sectionLevel) break;

    if (el.tagName.toLowerCase() !== 'p') continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;

    if (text === ACL_FULL_NAME) {
      // OpDiv fix needed
      const needsOpDiv = true;

      // Check following non-empty paragraph for Agency fix
      let needsAgency = false;
      for (let j = i + 1; j < children.length; j++) {
        const next = children[j]!;
        const nextLevel = headingLevel(next);
        if (nextLevel > 0) break;
        if (next.tagName.toLowerCase() !== 'p') continue;
        const nextText = (next.textContent ?? '').trim();
        if (!nextText) continue;
        if (!KNOWN_LABEL_RE.test(nextText)) needsAgency = true;
        break;
      }

      return { needsOpDiv, needsAgency };
    }

    // If we find the line starting with "OpDiv:" that already contains ACL,
    // no OpDiv fix needed, but check for Agency on the next paragraph.
    if (/^OpDiv\s*:/i.test(text) && text.includes(ACL_FULL_NAME)) {
      let needsAgency = false;
      for (let j = i + 1; j < children.length; j++) {
        const next = children[j]!;
        const nextLevel = headingLevel(next);
        if (nextLevel > 0) break;
        if (next.tagName.toLowerCase() !== 'p') continue;
        const nextText = (next.textContent ?? '').trim();
        if (!nextText) continue;
        if (!KNOWN_LABEL_RE.test(nextText)) needsAgency = true;
        break;
      }
      return { needsOpDiv: false, needsAgency };
    }
  }

  return { needsOpDiv: false, needsAgency: false };
}

const CLEAN_024: Rule = {
  id: 'CLEAN-024',
  autoApply: true,
  contentGuideIds: ['acl'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const { needsOpDiv, needsAgency } = detectLabelFixes(htmlDoc);

    if (!needsOpDiv && !needsAgency) return [];

    const count = (needsOpDiv ? 1 : 0) + (needsAgency ? 1 : 0);
    const labels = [
      ...(needsOpDiv ? ['"OpDiv:"'] : []),
      ...(needsAgency ? ['"Agency:"'] : []),
    ].join(' and ');

    return [
      {
        ruleId: 'CLEAN-024',
        description: `Basic information field labels added: ${labels}.`,
        targetField: 'acl.basic.info.labels',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_024;
