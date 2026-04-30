import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * ATTACH-001: Ensure "Required." is the first body paragraph under each h5
 * in the Attachments section (auto-apply).
 *
 * Within the h4 whose text is exactly "Attachments", each h5 block may
 * contain a standalone paragraph (not inside a list or table) whose first
 * bold run starts with "Required" (e.g. "Required.",
 * "Required if applicable."). If that paragraph is not the first body
 * paragraph immediately after the h5, it is silently moved there.
 *
 * If no h4 with text "Attachments" exists, emits nothing.
 * Applies silently — no issue is surfaced to the user.
 */
const ATTACH_001: Rule = {
  id: 'ATTACH-001',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    if (!doc.documentXml) return [];
    const misplacedCount = countMisplacedRequiredParagraphs(doc.documentXml);
    if (misplacedCount === 0) return [];
    return [
      {
        ruleId: 'ATTACH-001',
        description: 'Required. paragraph position normalized in Attachments h5 blocks.',
        targetField: 'struct.attachments.required.position',
        value: String(misplacedCount),
      },
    ];
  },
};

function countMisplacedRequiredParagraphs(documentXml: string): number {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return 0;

  let inAttachments = false;
  let inAttachmentsH5 = false;
  let firstEligibleBodyParagraph: Element | null = null;
  let requiredParagraph: Element | null = null;
  let misplacedCount = 0;

  const finalizeCurrentH5Block = () => {
    if (inAttachmentsH5 && requiredParagraph && requiredParagraph !== firstEligibleBodyParagraph) {
      misplacedCount += 1;
    }
    inAttachmentsH5 = false;
    firstEligibleBodyParagraph = null;
    requiredParagraph = null;
  };

  for (const node of Array.from(body.children)) {
    if (node.localName !== 'p') {
      continue;
    }

    const headingLevel = localHeadingLevel(node, W);
    if (headingLevel > 0) {
      if (inAttachmentsH5 && headingLevel <= 5) {
        finalizeCurrentH5Block();
      }

      if (headingLevel === 4 && localParaText(node).trim() === 'Attachments') {
        inAttachments = true;
        continue;
      }

      if (inAttachments && headingLevel <= 4) {
        inAttachments = false;
      }

      if (inAttachments && headingLevel === 5) {
        inAttachmentsH5 = true;
        firstEligibleBodyParagraph = null;
        requiredParagraph = null;
      }

      continue;
    }

    if (!inAttachmentsH5 || isListParagraph(node)) {
      continue;
    }

    if (!firstEligibleBodyParagraph) {
      firstEligibleBodyParagraph = node;
    }

    if (!requiredParagraph && startsWithRequiredBoldRun(node)) {
      requiredParagraph = node;
    }
  }

  finalizeCurrentH5Block();
  return misplacedCount;
}

function isListParagraph(wP: Element): boolean {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return false;
  return Array.from(pPr.children).some(c => c.localName === 'numPr');
}

function startsWithRequiredBoldRun(wP: Element): boolean {
  for (const child of Array.from(wP.children)) {
    if (child.localName !== 'r') continue;

    const rPr = Array.from(child.children).find(c => c.localName === 'rPr');
    const isBold = !!rPr && Array.from(rPr.children).some(c => c.localName === 'b');
    if (!isBold) continue;

    const text = Array.from(child.getElementsByTagName('w:t'))
      .map(wt => wt.textContent ?? '')
      .join('')
      .trim();
    return /^Required\b/i.test(text);
  }
  return false;
}

function localHeadingLevel(wP: Element, W: string): number {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return 0;
  const val =
    pStyle.getAttribute('w:val') ??
    pStyle.getAttributeNS(W, 'val') ??
    pStyle.getAttribute('val') ??
    '';
  const m = val.match(/^Heading\s*(\d+)$/i);
  if (!m) return 0;
  const level = parseInt(m[1]!, 10);
  return level >= 1 && level <= 6 ? level : 0;
}

function localParaText(wP: Element): string {
  return Array.from(wP.getElementsByTagName('w:t'))
    .map(wt => wt.textContent ?? '')
    .join('');
}

export default ATTACH_001;
