import type JSZip from 'jszip';
import { serializeXml } from './xmlSerialize';
import { getStoryPartPaths } from './storyParts';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Walks sibling nodes starting at `node` in the given direction, clearing a
 * `w:displacedByCustomXml` attribute whose value matches `value`. Stops at
 * the first element that doesn't carry a matching attribute (non-element
 * nodes, e.g. whitespace text, are skipped over transparently).
 *
 * Checks the qualified attribute name, the namespace-aware form, and the
 * bare unprefixed local name — some DOM implementations only populate one
 * of the three for namespace-prefixed XML attributes (see the three-way
 * getAttribute/getAttributeNS/getAttribute fallback pattern used throughout
 * buildDocx.ts, e.g. bookmark w:id and w:name lookups).
 */
function clearDisplacedByCustomXml(
  node: ChildNode | null,
  direction: 'previousSibling' | 'nextSibling',
  value: 'next' | 'prev'
): void {
  let current = node;
  while (current) {
    if (current.nodeType === 1 /* ELEMENT_NODE */) {
      const el = current as Element;
      const displaced =
        el.getAttribute('w:displacedByCustomXml') ??
        el.getAttributeNS(W, 'displacedByCustomXml') ??
        el.getAttribute('displacedByCustomXml');
      if (displaced !== value) break;
      el.removeAttribute('w:displacedByCustomXml');
      el.removeAttributeNS(W, 'displacedByCustomXml');
      el.removeAttribute('displacedByCustomXml');
    }
    current = current[direction];
  }
}

/**
 * Unwraps all <w:sdt> elements in the given XML document in-place, splicing
 * each control's <w:sdtContent> children into the parent in its place.
 * <w:sdtPr> and <w:sdtEndPr> are discarded with the wrapper.
 * Returns true when at least one <w:sdt> was found and removed.
 *
 * Processes in reverse document order so nested controls are unwrapped before
 * their ancestors — when an inner <w:sdt> is removed, its extracted children
 * land inside the outer <w:sdtContent>, which the outer pass then hoists
 * correctly.
 *
 * Word sometimes cannot nest a bookmarkStart/bookmarkEnd (or other range
 * marker) inside a content control and instead places it as a body-level
 * sibling immediately before/after the <w:sdt>, flagging it with
 * w:displacedByCustomXml="next"/"prev" to record which control it logically
 * belongs to. Once that <w:sdt> is unwrapped there is no longer any custom
 * XML displacing the marker, so the stale attribute is cleared — leaving it
 * in place risks Word treating the bookmark as orphaned on a later resave,
 * breaking whatever internal link anchors to it.
 */
export function stripContentControlsFromXmlDoc(xmlDoc: Document): boolean {
  // Combine the namespace-aware and qualified-name lookups (and de-dupe via
  // Set) — some DOM implementations only populate one or the other for
  // namespace-prefixed elements, matching the pattern used for bookmarkStart/
  // bookmarkEnd lookups elsewhere in buildDocx.ts. A silent empty result here
  // would make this whole pre-processing step a no-op.
  const sdts = Array.from(
    new Set([
      ...Array.from(xmlDoc.getElementsByTagNameNS(W, 'sdt')),
      ...Array.from(xmlDoc.getElementsByTagName('w:sdt')),
    ])
  ).reverse();
  if (sdts.length === 0) return false;

  for (const sdt of sdts) {
    const parent = sdt.parentNode;
    if (!parent) continue;

    clearDisplacedByCustomXml(sdt.previousSibling, 'previousSibling', 'next');
    clearDisplacedByCustomXml(sdt.nextSibling, 'nextSibling', 'prev');

    // Walk sdt children in document order so the relative positions of
    // bookmarkStart, sdtContent body, and bookmarkEnd are preserved after
    // unwrapping — hoisting sdtContent first (previous approach) placed
    // bookmarks after the content they wrapped, breaking the bookmark span.
    // sdtPr / sdtEndPr are style metadata and are dropped.
    for (const child of Array.from(sdt.childNodes)) {
      if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
      const el = child as Element;
      if (el.localName === 'sdtContent') {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, sdt);
        }
      } else if (el.localName === 'sdtPr' || el.localName === 'sdtEndPr') {
        // Drop: style metadata, not document content
      } else {
        // bookmarkStart, bookmarkEnd, etc. — hoist in place
        parent.insertBefore(child, sdt);
      }
    }
    parent.removeChild(sdt);
  }

  return true;
}

/**
 * Strips <w:sdt> content controls from every story part in `zip`
 * (word/document.xml, word/footnotes.xml, word/endnotes.xml, and any
 * header/footer parts present), rewriting each modified part in place.
 *
 * A cheap string pre-check ('<w:sdt') skips DOM parsing for parts that contain
 * no content controls, keeping the common case (no content controls) nearly free.
 */
export async function stripContentControlsFromZip(zip: JSZip): Promise<void> {
  const parser = new DOMParser();

  for (const path of getStoryPartPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlStr = await file.async('string');
    if (!xmlStr.includes('<w:sdt')) continue;

    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    if (stripContentControlsFromXmlDoc(xmlDoc)) {
      zip.file(path, serializeXml(xmlDoc));
    }
  }
}
