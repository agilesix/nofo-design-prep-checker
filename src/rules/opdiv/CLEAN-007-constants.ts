/**
 * Shared constants for CLEAN-007 (CDC/DGHT editorial scaffolding removal).
 *
 * Imported by both the detection rule (CLEAN-007.ts) and the OOXML mutation
 * function in buildDocx.ts so the anchor heading text stays in sync between
 * the HTML-side detection pass and the DOCX-side removal pass.
 */

/**
 * The exact heading text (compared case-insensitively after trimming) that
 * marks the boundary between editorial scaffolding and substantive NOFO
 * content in CDC/DGHT documents. Everything before this heading is removed;
 * the heading itself is preserved.
 */
export const DGHT_STEP1_ANCHOR = 'step 1: review the opportunity';
