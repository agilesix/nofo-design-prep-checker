import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { attHeadingLevel, attParaText } from './attachmentHelpers';

/**
 * ATTACH-002: Ensure the File name value uses sentence case in Attachments
 * h5 blocks (auto-apply).
 *
 * Within the h4 whose text is exactly "Attachments", each h5 block may
 * contain a paragraph with a bold run "File name:" followed by one or more
 * non-bold runs holding the file name value. If the value is not already in
 * sentence case, it is corrected and written back as a single normal run.
 *
 * Exception: values containing an all-caps word of 2+ characters (likely an
 * acronym, e.g. "DMP", "IDC") are left unchanged.
 *
 * Only emits an AutoAppliedChange when at least one value actually requires
 * correction. If no h4 with text "Attachments" exists, or all File name
 * values are already correct (or contain acronyms), emits nothing.
 *
 * Changes are logged to the browser console. Applies silently — no issue is
 * surfaced to the user.
 */
const ATTACH_002: Rule = {
  id: 'ATTACH-002',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml) return [];
    const count = countFileNameFixesNeeded(doc.documentXml);
    if (count === 0) return [];
    return [
      {
        ruleId: 'ATTACH-002',
        description: `File name ${count === 1 ? 'value' : 'values'} in Attachments h5 blocks normalized to sentence case.`,
        targetField: 'struct.attachments.filename.sentencecase',
        value: String(count),
      },
    ];
  },
};

/**
 * Count File name values within the Attachments h4 section that are not in
 * sentence case and do not contain an acronym.
 */
function countFileNameFixesNeeded(documentXml: string): number {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return 0;

  const bodyChildren = Array.from(body.childNodes).filter(
    n => n.nodeType === Node.ELEMENT_NODE
  ) as Element[];

  // Find the Attachments h4
  const h4Idx = bodyChildren.findIndex(
    el => el.localName === 'p' && attHeadingLevel(el) === 4 && attParaText(el).trim() === 'Attachments'
  );
  if (h4Idx === -1) return 0;

  // Collect the Attachments section (stop at next h1–h4)
  const sectionEls: Element[] = [];
  for (let i = h4Idx + 1; i < bodyChildren.length; i++) {
    const el = bodyChildren[i]!;
    if (el.localName === 'p') {
      const lvl = attHeadingLevel(el);
      if (lvl > 0 && lvl <= 4) break;
    }
    sectionEls.push(el);
  }

  let count = 0;
  let inH5 = false;

  for (const el of sectionEls) {
    if (el.localName === 'p') {
      const lvl = attHeadingLevel(el);
      if (lvl === 5) { inH5 = true; continue; }
      if (lvl > 0) { inH5 = false; continue; }
    }
    if (!inH5 || el.localName !== 'p') continue;

    const runs = Array.from(el.children).filter(c => c.localName === 'r');
    const fnIdx = runs.findIndex(r => a2RunBold(r) && a2RunText(r).trim() === 'File name:');
    if (fnIdx === -1) continue;

    const valueRuns = runs.slice(fnIdx + 1).filter(r => !a2RunBold(r));
    if (valueRuns.length === 0) continue;

    const raw = valueRuns.map(a2RunText).join('').trimStart();
    if (/\b[A-Z]{2,}\b/.test(raw)) continue;

    const sc = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (sc !== raw) count++;
  }

  return count;
}

function a2RunText(run: Element): string {
  return Array.from(run.getElementsByTagName('w:t'))
    .map(wt => wt.textContent ?? '')
    .join('');
}

function a2RunBold(run: Element): boolean {
  const rPr = Array.from(run.children).find(c => c.localName === 'rPr');
  if (!rPr) return false;
  const b = Array.from(rPr.children).find(c => c.localName === 'b');
  if (!b) return false;
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const val =
    b.getAttribute('w:val') ??
    b.getAttributeNS(W, 'val') ??
    b.getAttribute('val') ??
    null;
  return val === null || val === '' || val === 'true' || val === '1';
}

export default ATTACH_002;
