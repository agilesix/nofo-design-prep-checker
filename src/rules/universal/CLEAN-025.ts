import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';

// SYNC: C25_EXCLUDED_STYLES, C25_HEADING_STYLES, and the HSL logic in c25IsGreenOrBrown
// are duplicated in src/utils/buildDocx.ts (applyGreenBrownColorFix). If you change
// HSL thresholds or the excluded/heading style lists here, update buildDocx.ts to match.
const C25_EXCLUDED_STYLES = new Set([
  'InstructionBoxes',
  'InstructionBoxHeading',
  'Fillintext',
  'FillintextChar',
  'PlaceholderText',
]);

const C25_HEADING_STYLES = new Set([
  'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6',
]);

const CLEAN_025: Rule = {
  id: 'CLEAN-025',
  autoApply: true,
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const xml = doc.documentXml;
    if (!xml) return [];
    if (!xml.includes('w:color')) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');

    let count = 0;
    for (const wP of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
      if (c25InTable(wP)) continue;
      if (!c25IsQualifyingParagraph(wP)) continue;
      count += c25CountGreenBrownColors(wP);
    }

    if (count === 0) return [];

    return [
      {
        ruleId: 'CLEAN-025',
        description: `Green or brown text color removed from ${count} location${count === 1 ? '' : 's'}.`,
        targetField: 'run.color.green-brown.strip',
        value: String(count),
      },
    ];
  },
};

function c25HexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
}

function c25RgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
    case gn: h = (bn - rn) / d + 2; break;
    default:  h = (rn - gn) / d + 4; break;
  }
  return [h * 60, s * 100, l * 100];
}

function c25IsGreenOrBrown(hex: string): boolean {
  const rgb = c25HexToRgb(hex);
  if (!rgb) return false;
  const [h, s, l] = c25RgbToHsl(...rgb);
  if (s < 5) return false;
  // Green: hue 80–160°
  if (h >= 80 && h <= 160) return true;
  // Brown: hue 20–45°, saturation ≤ 60%, lightness 15–75%
  if (h >= 20 && h <= 45 && s <= 60 && l >= 15 && l <= 75) return true;
  return false;
}

function c25InTable(el: Element): boolean {
  let node: Element | null = el.parentElement;
  while (node) {
    if (node.localName === 'tbl') return true;
    node = node.parentElement;
  }
  return false;
}

function c25GetPStyle(wP: Element): string {
  const pPr = c25DirectChild(wP, 'w:pPr');
  if (!pPr) return '';
  const pStyle = c25DirectChild(pPr, 'w:pStyle');
  return pStyle?.getAttribute('w:val') ?? '';
}

function c25IsQualifyingParagraph(wP: Element): boolean {
  const pStyle = c25GetPStyle(wP);
  if (C25_EXCLUDED_STYLES.has(pStyle)) return false;
  return pStyle === '' || pStyle === 'Normal' || C25_HEADING_STYLES.has(pStyle);
}

function c25CountGreenBrownColors(wP: Element): number {
  let count = 0;

  for (const run of Array.from(wP.getElementsByTagName('w:r'))) {
    const rPr = c25DirectChild(run, 'w:rPr');
    if (!rPr) continue;
    const rStyle = c25DirectChild(rPr, 'w:rStyle');
    if (C25_EXCLUDED_STYLES.has(rStyle?.getAttribute('w:val') ?? '')) continue;
    const color = c25DirectChild(rPr, 'w:color');
    const val = color?.getAttribute('w:val') ?? '';
    if (val && val.toLowerCase() !== 'auto' && c25IsGreenOrBrown(val)) count++;
  }

  // Paragraph mark color (pPr/rPr/w:color)
  const pPr = c25DirectChild(wP, 'w:pPr');
  if (pPr) {
    const pRpr = c25DirectChild(pPr, 'w:rPr');
    if (pRpr) {
      const color = c25DirectChild(pRpr, 'w:color');
      const val = color?.getAttribute('w:val') ?? '';
      if (val && val.toLowerCase() !== 'auto' && c25IsGreenOrBrown(val)) count++;
    }
  }

  return count;
}

function c25DirectChild(parent: Element, tagName: string): Element | null {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

export default CLEAN_025;
