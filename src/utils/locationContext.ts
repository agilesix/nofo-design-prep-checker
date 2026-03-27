/**
 * Shared utility for computing per-element location context from a parsed
 * mammoth HTML document.
 *
 * Build a lookup once per rule invocation (O(n) over the document), then look
 * up any element in O(1).
 */

export interface LocationContext {
  /** Text of the nearest preceding h1–h4, or null if none has been seen yet. */
  nearestHeading: string | null;
  /** Estimated 1-based page number derived from cumulative character offset. */
  page: number;
}

/** Characters per page — matches the convention in parseDocx.ts. */
const CHARS_PER_PAGE = 3000;

/**
 * Scans `htmlDoc` in tree order and returns a lookup function that maps any
 * Element in the document to its LocationContext.
 *
 * nearestHeading — the text of the h1–h4 element most recently encountered
 *                  before the queried element in document order (null if none)
 * page           — floor(charsBefore / CHARS_PER_PAGE) + 1, always ≥ 1
 *
 * Elements that appear before any text (charsBefore = 0) receive page 1.
 * Elements not found in the map (added after the scan) fall back to
 * { nearestHeading: null, page: 1 }.
 */
export function buildLocationLookup(
  htmlDoc: Document
): (el: Element) => LocationContext {
  const map = new Map<Element, LocationContext>();
  let currentHeading: string | null = null;
  let charCount = 0;

  const root = htmlDoc.body ?? htmlDoc.documentElement;
  const walker = htmlDoc.createTreeWalker(
    root,
    // NodeFilter.SHOW_ELEMENT (1) | NodeFilter.SHOW_TEXT (4) = 5
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );

  let node: Node | null = walker.nextNode();
  while (node !== null) {
    if (node.nodeType === Node.TEXT_NODE) {
      charCount += (node.textContent ?? '').length;
    } else {
      const el = node as Element;
      if (/^h[1-4]$/i.test(el.tagName)) {
        currentHeading = (el.textContent ?? '').trim() || null;
      }
      map.set(el, {
        nearestHeading: currentHeading,
        page: Math.floor(charCount / CHARS_PER_PAGE) + 1,
      });
    }
    node = walker.nextNode();
  }

  return (el: Element): LocationContext =>
    map.get(el) ?? { nearestHeading: null, page: 1 };
}
