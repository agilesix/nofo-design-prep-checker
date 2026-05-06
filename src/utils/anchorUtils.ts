/**
 * Convert a heading's display text to an anchor slug, following the same
 * format NOFO Builder uses for Word bookmark names:
 *  0. Trim leading/trailing whitespace from raw heading text before slugifying.
 *     Existing bookmark IDs (w:bookmarkStart w:name) must always be read as-is
 *     from the document — never passed through this function as "old" anchors.
 *  1. Replace whitespace runs with underscores
 *  2. Replace any remaining non-alphanumeric characters with underscores
 *     (colons, slashes, parentheses, etc. — invalid in Word bookmark names)
 *  3. Collapse consecutive underscores to a single underscore
 *  4. Strip leading/trailing underscores
 *
 * e.g. "Maintenance of Effort"                          → "Maintenance_of_Effort"
 * e.g. "Attachment 1: Accreditation documentation"      → "Attachment_1_Accreditation_documentation"
 * e.g. "Step 3/4: Overview"                             → "Step_3_4_Overview"
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
