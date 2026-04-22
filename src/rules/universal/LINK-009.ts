import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LINK-009: Fix partial hyperlinks — characters accidentally left outside the
 * w:hyperlink element (auto-apply)
 *
 * Detects w:hyperlink elements where alphanumeric characters in a directly
 * adjacent sibling w:r run are structurally part of the linked word:
 *
 *   Leading: the run immediately preceding the hyperlink ends with [a-zA-Z0-9]
 *            AND the hyperlink's own text starts with non-whitespace.
 *   Trailing: the run immediately following the hyperlink starts with [a-zA-Z0-9]
 *             AND the hyperlink's own text ends with non-whitespace.
 *
 * Only alphanumeric characters are considered partial — punctuation such as
 * ".", ",", ";", ":", "!", "?", ")", and "]" immediately adjacent to a link
 * is sentence/list punctuation and must never be pulled inside the hyperlink.
 *
 * "Immediately adjacent" means a direct paragraph-level sibling with no
 * intervening elements other than w:bookmarkStart / w:bookmarkEnd.
 *
 * The OOXML fix is applied in buildDocx via targetField 'link.partial.fix'.
 * Applies to both external (r:id) and internal (w:anchor) hyperlinks.
 */
const LINK_009: Rule = {
  id: 'LINK-009',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml || !xml.includes('w:hyperlink')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const hyperlink of Array.from(xmlDoc.getElementsByTagName('w:hyperlink'))) {
      if (hyperlinkHasPartialChars(hyperlink)) count++;
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'LINK-009',
        description: `Partial hyperlink text corrected for ${count} link${count === 1 ? '' : 's'}.`,
        targetField: 'link.partial.fix',
        value: String(count),
      },
    ];
  },
};

function hyperlinkHasPartialChars(hyperlink: Element): boolean {
  const hlText = hlFullText(hyperlink);
  if (!hlText) return false;

  const prevRun = adjacentRunOf(hyperlink, 'prev');
  if (prevRun) {
    const trailing = trailingAlphanumeric(hlRunText(prevRun));
    if (trailing.length > 0 && !/^\s/.test(hlText)) return true;
  }

  const nextRun = adjacentRunOf(hyperlink, 'next');
  if (nextRun) {
    const leading = leadingAlphanumeric(hlRunText(nextRun));
    if (leading.length > 0 && !/\s$/.test(hlText)) return true;
  }

  return false;
}

/** Concatenate all w:t text inside a w:hyperlink (including nested runs). */
function hlFullText(hyperlink: Element): string {
  return Array.from(hyperlink.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

/** Concatenate all w:t text inside a w:r run. */
function hlRunText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

/**
 * Returns the w:r directly adjacent to `hyperlink` in the given direction,
 * skipping over w:bookmarkStart and w:bookmarkEnd elements.
 * Returns null if any other element type is encountered first.
 */
function adjacentRunOf(hyperlink: Element, direction: 'prev' | 'next'): Element | null {
  let node: Node | null =
    direction === 'prev' ? hyperlink.previousSibling : hyperlink.nextSibling;

  while (node !== null) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node = direction === 'prev' ? node.previousSibling : node.nextSibling;
      continue;
    }
    const el = node as Element;
    const name = el.localName;
    if (name === 'bookmarkStart' || name === 'bookmarkEnd') {
      node = direction === 'prev' ? node.previousSibling : node.nextSibling;
      continue;
    }
    return name === 'r' ? el : null;
  }
  return null;
}

function trailingAlphanumeric(text: string): string {
  const m = text.match(/[a-zA-Z0-9]+$/);
  return m ? m[0] : '';
}

function leadingAlphanumeric(text: string): string {
  const m = text.match(/^[a-zA-Z0-9]+/);
  return m ? m[0] : '';
}

export default LINK_009;
