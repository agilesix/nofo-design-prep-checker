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
}

/**
 * Scans `htmlDoc` in tree order and returns a lookup function that maps any
 * Element in the document to its LocationContext.
 *
 * nearestHeading — the text of the h1–h4 element most recently encountered
 *                  before the queried element in document order (null if none)
 *
 * Elements not found in the map fall back to { nearestHeading: null }.
 */
export function buildLocationLookup(
  htmlDoc: Document
): (el: Element) => LocationContext {
  const map = new Map<Element, LocationContext>();
  let currentHeading: string | null = null;

  const root = htmlDoc.body ?? htmlDoc.documentElement;
  const walker = htmlDoc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );

  let node: Node | null = walker.nextNode();
  while (node !== null) {
    if (node.nodeType !== Node.TEXT_NODE) {
      const el = node as Element;
      if (/^h[1-4]$/i.test(el.tagName)) {
        const headingText = (el.textContent ?? '').trim() || null;
        // For heading elements, nearestHeading should be the *preceding* heading,
        // so record the context using the currentHeading before updating it.
        map.set(el, { nearestHeading: currentHeading });
        currentHeading = headingText;
      } else {
        map.set(el, { nearestHeading: currentHeading });
      }
    }
    node = walker.nextNode();
  }

  return (el: Element): LocationContext =>
    map.get(el) ?? { nearestHeading: null };
}
