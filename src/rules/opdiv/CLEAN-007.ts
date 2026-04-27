import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { DGHT_STEP1_ANCHOR } from './CLEAN-007-constants';

/**
 * CLEAN-007: Remove CDC preamble content and DGHT/DGHP instruction boxes (auto-apply)
 *
 * CDC NOFO templates often begin with editorial instructions and content-guide
 * reference tables that are not part of the NOFO itself. This rule detects
 * that editorial scaffolding preamble by requiring BOTH of the following to be
 * true of the content before "Step 1: Review the Opportunity":
 *
 *   1. A scaffolding table is present — a <table> whose first cell contains
 *      "Here is the color coding", "CDC/DGHT NOFO Content Guide", or
 *      "CDC/DGHP" (when "Before you begin" also appears in the preamble).
 *   2. No NOFO metadata field labels are present (OpDiv:, Agency:, etc.).
 *      If metadata labels are found the removal is aborted — that content is
 *      real NOFO material, not editorial scaffolding.
 *
 * Additionally, DGHT and DGHP templates embed "DGHT-SPECIFIC INSTRUCTIONS" /
 * "DGHP-SPECIFIC INSTRUCTIONS" boxes throughout the document body. These are
 * single-cell tables with a light-blue cell shading (fill BCD6F4). This rule
 * also detects and removes them from the output DOCX.
 *
 * Scoped to all CDC content guides: cdc, cdc-research, cdc-dght-ssj,
 * cdc-dght-competitive, cdc-dghp.
 */

/**
 * NOFO metadata field label prefixes that appear at the start of paragraphs in
 * the standard CDC metadata block (OpDiv, Agency, Opportunity name, etc.).
 * Content containing these labels is real document content and must never be
 * removed as part of preamble clean-up.
 */
const METADATA_LABEL_PREFIXES = [
  'opdiv:',
  'agency:',
  'subagency:',
  'opportunity name:',
  'opportunity number:',
  'cfda number:',
  'program name:',
  'due date:',
];

/**
 * Returns true when the first cell of a table matches a known CDC/DGHT
 * editorial scaffolding signature, indicating a genuine preamble table.
 * Also accepts "CDC/DGHP" in the first cell when "Before you begin" appears
 * anywhere in the pre-Step-1 text.
 */
function hasScaffoldingTable(preambleElements: Element[], preambleText: string): boolean {
  for (const el of preambleElements) {
    if (el.tagName.toLowerCase() !== 'table') continue;
    const firstCell = el.querySelector('td, th');
    if (!firstCell) continue;
    const firstCellText = (firstCell.textContent ?? '').trim().toLowerCase();
    if (firstCellText.includes('here is the color coding')) return true;
    if (firstCellText.includes('cdc/dght nofo content guide')) return true;
    if (
      firstCellText.includes('cdc/dghp') &&
      preambleText.toLowerCase().includes('before you begin')
    ) return true;
  }
  return false;
}

/**
 * Returns true when any pre-Step-1 element's text starts with a known NOFO
 * metadata field label. Such content must never be removed.
 */
function hasPreambleMetadataLabels(preambleElements: Element[]): boolean {
  return preambleElements.some(el => {
    const text = (el.textContent ?? '').trim().toLowerCase();
    return METADATA_LABEL_PREFIXES.some(label => text.startsWith(label));
  });
}

const CLEAN_007: Rule = {
  id: 'CLEAN-007',
  autoApply: true,
  contentGuideIds: ['cdc', 'cdc-research', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cdc-dghp'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const results: AutoAppliedChange[] = [];

    // ── Preamble detection (from doc.html) ───────────────────────────────────
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Find the Step 1 anchor heading among direct body children.
    const bodyChildren = Array.from(htmlDoc.body.children);
    const step1Idx = bodyChildren.findIndex(
      el =>
        /^h[1-6]$/i.test(el.tagName) &&
        (el.textContent ?? '').trim().toLowerCase() === DGHT_STEP1_ANCHOR
    );

    // Only fire when the Step 1 heading exists, non-empty content precedes it,
    // the content includes a CDC/DGHT scaffolding table, and no NOFO metadata
    // field labels are present (which would indicate real document content).
    if (step1Idx > 0) {
      const preambleElements = bodyChildren.slice(0, step1Idx);
      const hasPreamble = preambleElements.some(
        el => (el.textContent ?? '').trim().length > 0
      );
      if (hasPreamble) {
        const preambleText = preambleElements.map(el => el.textContent ?? '').join(' ');
        const isScaffolding = hasScaffoldingTable(preambleElements, preambleText);
        const hasMetadata = hasPreambleMetadataLabels(preambleElements);
        if (isScaffolding && !hasMetadata) {
          results.push({
            ruleId: 'CLEAN-007',
            description: 'CDC preamble removed from beginning of document.',
            // Intentionally retain the legacy DGHT-specific key for backward
            // compatibility with downstream consumers (for example buildDocx and
            // existing filtering/analytics) that still recognize this targetField.
            targetField: 'struct.dght.removescaffolding',
          });
        }
      }
    }

    // ── Instruction box detection (from doc.documentXml) ─────────────────────
    // DGHT/DGHP instruction boxes are single-cell tables shaded BCD6F4 whose
    // first cell text starts with "DGHT-SPECIFIC INSTRUCTIONS" or
    // "DGHP-SPECIFIC INSTRUCTIONS". Detection requires OOXML because mammoth.js
    // does not surface cell background shading in the rendered HTML.
    const instructionBoxCount = countInstructionBoxes(doc.documentXml);
    if (instructionBoxCount > 0) {
      results.push({
        ruleId: 'CLEAN-007',
        description: `Removed ${instructionBoxCount} DGHT/DGHP instruction box${instructionBoxCount === 1 ? '' : 'es'}.`,
        targetField: 'struct.dght.removeinstructionboxes',
        value: String(instructionBoxCount),
      });
    }

    return results;
  },
};

/**
 * Count DGHT/DGHP instruction box tables in the given OOXML string.
 * A table qualifies when it has exactly one w:tc whose w:shd fill is BCD6F4
 * and whose concatenated text starts with "DGHT-SPECIFIC INSTRUCTIONS" or
 * "DGHP-SPECIFIC INSTRUCTIONS" (case-insensitive).
 */
function countInstructionBoxes(xml: string): number {
  if (!xml) return 0;
  const lower = xml.toLowerCase();
  if (!lower.includes('bcd6f4')) return 0;
  if (!lower.includes('specific instructions')) return 0;

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');

  let count = 0;
  for (const tbl of Array.from(xmlDoc.getElementsByTagName('w:tbl'))) {
    if (isInstructionBoxElement(tbl)) count++;
  }
  return count;
}

/** Returns true when a w:tbl element matches the instruction box criteria. */
export function isInstructionBoxElement(tbl: Element): boolean {
  const cells = Array.from(tbl.getElementsByTagName('w:tc'));
  if (cells.length !== 1) return false;

  const cell = cells[0]!;

  // Cell shading must be BCD6F4
  const shd = cell.getElementsByTagName('w:shd')[0];
  if (!shd) return false;
  const fill = (shd.getAttribute('w:fill') ?? '').toLowerCase();
  if (fill !== 'bcd6f4') return false;

  // First cell text must start with instruction box prefix
  const cellText = Array.from(cell.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
  return (
    cellText.startsWith('dght-specific instructions') ||
    cellText.startsWith('dghp-specific instructions')
  );
}

export default CLEAN_007;
