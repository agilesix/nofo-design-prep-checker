import type JSZip from 'jszip';

/**
 * Returns the canonical set of OOXML "story part" paths that carry document
 * body content: the main document, footnotes, endnotes, and any header/footer
 * parts present in the ZIP.
 *
 * Any function that needs to operate across all text-bearing parts should use
 * this helper so the set stays consistent in one place.
 */
export function getStoryPartPaths(zip: JSZip): string[] {
  const fixed = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  const headerFooter = Object.keys(zip.files).filter(name =>
    /^word\/(header|footer)\d*\.xml$/.test(name)
  );
  return [...fixed, ...headerFooter];
}
