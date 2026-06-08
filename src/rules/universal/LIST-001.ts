import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LIST-001: Fake lists using manual bullets or dashes
 * Detects paragraphs that start with manual bullet characters instead of using proper list markup.
 */
const MANUAL_BULLET_PATTERN = /^[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB\u25A0\u25A1\-*]\s+/;
const MANUAL_NUMBER_PATTERN = /^\d+[.)]\s+/;

const LIST_001: Rule = {
  id: 'LIST-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const paragraphs = Array.from(htmlDoc.querySelectorAll('p'));
    const getContext = buildLocationLookup(htmlDoc);

    // Build a set of paragraph text content for paragraphs that carry a Word
    // list style (w:pStyle w:val containing "list", case-insensitive). These
    // paragraphs are excluded from manual-bullet detection: they are properly
    // styled as list items even when numId="0" suppresses the auto-generated
    // glyph and the text run opens with a typed bullet character such as ◦.
    const listStyledTexts = new Set<string>();
    if (doc.documentXml) {
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(doc.documentXml, 'application/xml');
      for (const para of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
        const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
        if (!pPr) continue;
        const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
        if (!pStyle) continue;
        const styleName = pStyle.getAttribute('w:val') ?? '';
        if (styleName.toLowerCase().includes('list')) {
          const text = Array.from(para.getElementsByTagName('w:t'))
            .map(t => t.textContent ?? '')
            .join('')
            .trim();
          if (text) listStyledTexts.add(text);
        }
      }
    }

    // Find consecutive paragraphs that look like list items
    const fakeBulletGroups: { start: number; end: number; type: 'bullet' | 'numbered' }[] = [];
    let currentGroupStart = -1;
    let currentGroupType: 'bullet' | 'numbered' | null = null;

    paragraphs.forEach((p, index) => {
      const text = (p.textContent ?? '').trim();
      const isBullet = MANUAL_BULLET_PATTERN.test(text);
      const isNumbered = MANUAL_NUMBER_PATTERN.test(text);

      // Paragraphs with a Word list style are excluded even when their text
      // run starts with a typed bullet character (e.g. ◦ with numId="0").
      if ((isBullet || isNumbered) && !listStyledTexts.has(text)) {
        const type = isBullet ? 'bullet' : 'numbered';
        if (currentGroupStart === -1 || currentGroupType !== type) {
          if (currentGroupStart !== -1 && index - currentGroupStart >= 2) {
            fakeBulletGroups.push({ start: currentGroupStart, end: index - 1, type: currentGroupType! });
          }
          currentGroupStart = index;
          currentGroupType = type;
        }
      } else {
        if (currentGroupStart !== -1 && index - currentGroupStart >= 2) {
          fakeBulletGroups.push({ start: currentGroupStart, end: index - 1, type: currentGroupType! });
        }
        currentGroupStart = -1;
        currentGroupType = null;
      }
    });

    // Handle trailing group
    if (currentGroupStart !== -1 && paragraphs.length - currentGroupStart >= 2) {
      fakeBulletGroups.push({ start: currentGroupStart, end: paragraphs.length - 1, type: currentGroupType! });
    }

    fakeBulletGroups.forEach((group, index) => {
      const firstPara = paragraphs[group.start];
      const text = (firstPara?.textContent ?? '').trim().slice(0, 60);
      const count = group.end - group.start + 1;
      const sectionId = firstPara ? findSectionForElement(firstPara, doc) : (doc.sections[0]?.id ?? 'section-preamble');
      const { nearestHeading } = firstPara ? getContext(firstPara) : { nearestHeading: null };

      issues.push({
        id: `LIST-001-${index}`,
        ruleId: 'LIST-001',
        title: `Manual ${group.type === 'bullet' ? 'bullet' : 'numbered'} list detected`,
        severity: 'warning',
        sectionId,
        nearestHeading,
        description: `${count} consecutive paragraphs starting near "${text}…" appear to use manual ${group.type === 'bullet' ? 'bullet characters' : 'numbering'} instead of proper Word list formatting. This may not convert correctly in NOFO Builder, potentially causing garbled text or missing formatting in the designed PDF.`,
        suggestedFix: group.type === 'bullet'
          ? `In Word, select the affected paragraphs, open the Styles pane, and confirm they are tagged as 'List Paragraph' or a 'Bullet' style — anything tagged as 'Normal' may not convert correctly in NOFO Builder. To fix: select the paragraphs, open the Styles pane, select 'Clear Formatting', then click the 'Bullets' button in the ribbon. For nested bullets, use the 'Increase Indent' button.`
          : `Select these paragraphs in the source document and apply the proper numbered list style from the Word paragraph formatting options.`,
        instructionOnly: true,
      });
    });

    return issues;
  },
};

function findSectionForElement(el: Element, doc: ParsedDocument): string {
  const text = (el.textContent ?? '').slice(0, 50);
  for (const section of doc.sections) {
    if (section.rawText.includes(text)) {
      return section.id;
    }
  }
  return doc.sections[0]?.id ?? 'section-preamble';
}

export default LIST_001;
