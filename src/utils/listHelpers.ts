/**
 * Shared OOXML list-grouping helpers used by CLEAN-010 (detection) and
 * buildDocx.ts (patch). Centralizing them here ensures both stay in sync:
 * the same grouping rules and numId extraction are applied during detection
 * and during the actual document mutation.
 */

/** Return the w:numId value for a list paragraph, or null if not a list item. */
export function getListNumId(para: Element): string | null {
  const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
  if (!pPr) return null;
  const numPr = Array.from(pPr.children).find(c => c.localName === 'numPr');
  if (!numPr) return null;
  const numIdEl = Array.from(numPr.children).find(c => c.localName === 'numId');
  if (!numIdEl) return null;
  const val = numIdEl.getAttribute('w:val') ?? '';
  return !val || val === '0' ? null : val;
}

/**
 * Group consecutive <w:p> elements that share the same w:numId value into
 * arrays. A non-list paragraph (or a change in numId) closes the current group.
 */
export function groupListParagraphs(paragraphs: Element[]): Element[][] {
  const groups: Element[][] = [];
  let currentGroup: Element[] = [];
  let currentNumId: string | null = null;

  for (const para of paragraphs) {
    const numId = getListNumId(para);
    if (numId !== null && numId === currentNumId) {
      currentGroup.push(para);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = numId !== null ? [para] : [];
      currentNumId = numId;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups;
}
