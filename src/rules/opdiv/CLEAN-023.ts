import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * CLEAN-023: Add "Telephone:" label before bare phone numbers in Agency
 * contacts section (auto-apply, ACL only)
 *
 * Scans paragraphs under the "Agency contacts" heading (H2 or H3,
 * case-insensitive) and prepends "Telephone: " to any standalone paragraph
 * whose text begins with a bare phone number — i.e., a number that:
 *   • Follows one of the supported formats (see PHONE_RE below)
 *   • Is not already prefixed by a label such as Telephone:, Phone:, Tel:, TTY:
 *   • Does not start with 1- or 1. (toll-free / long-distance prefixes)
 *
 * Scope ends when a heading at the same or higher level as the Agency contacts
 * heading is encountered.
 *
 * Scoped to ACL content guide only.
 */

/** Labels that already qualify a phone number — these paragraphs are skipped. */
const LABELED_RE = /^(?:telephone|phone|tel|tty)\s*:/i;

/**
 * Bare phone number at the start of a paragraph text.
 * Matches:
 *   NNN-NNN-NNNN
 *   (NNN) NNN-NNNN  or  (NNN)NNN-NNNN
 *   NNN.NNN.NNNN
 * Each may be followed by an extension:  x1234 / ext 1234 / ext. 1234
 * The number must NOT start with "1-" or "1." (toll-free prefix).
 */
const PHONE_RE =
  /^(?!1[-.])\s*(?:\(\d{3}\)\s*\d{3}[-]\d{4}|\d{3}[-]\d{3}[-]\d{4}|\d{3}[.]\d{3}[.]\d{4})(?:\s+(?:x|ext\.?)\s*\d{1,5})?\s*$/i;

function getHeadingTag(el: Element): number {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1') return 1;
  if (tag === 'h2') return 2;
  if (tag === 'h3') return 3;
  if (tag === 'h4') return 4;
  if (tag === 'h5') return 5;
  if (tag === 'h6') return 6;
  return 0;
}

function countBarePhoneNumbers(htmlDoc: Document): number {
  const body = htmlDoc.body;
  if (!body) return 0;

  const children = Array.from(body.children);
  let agencyContactsIdx = -1;
  let agencyContactsLevel = 0;

  for (let i = 0; i < children.length; i++) {
    const el = children[i]!;
    const level = getHeadingTag(el);
    if (level >= 2 && level <= 3 && /agency\s+contacts/i.test(el.textContent ?? '')) {
      agencyContactsIdx = i;
      agencyContactsLevel = level;
      break;
    }
  }

  if (agencyContactsIdx === -1) return 0;

  let count = 0;
  for (let i = agencyContactsIdx + 1; i < children.length; i++) {
    const el = children[i]!;
    const level = getHeadingTag(el);
    if (level > 0 && level <= agencyContactsLevel) break;

    if (el.tagName.toLowerCase() !== 'p') continue;

    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    if (LABELED_RE.test(text)) continue;
    if (PHONE_RE.test(text)) count++;
  }

  return count;
}

const CLEAN_023: Rule = {
  id: 'CLEAN-023',
  autoApply: true,
  contentGuideIds: ['acl'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const count = countBarePhoneNumbers(htmlDoc);
    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-023',
        description: `"Telephone:" label added to ${count} bare phone number${count === 1 ? '' : 's'} in Agency contacts.`,
        targetField: 'acl.telephone.prefix',
        value: String(count),
      },
    ];
  },
};

export default CLEAN_023;
