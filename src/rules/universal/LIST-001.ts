import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { buildLocationLookup } from '../../utils/locationContext';

/**
 * LIST-001: Fake lists using manual bullets or dashes
 * Detects paragraphs that start with manual bullet characters instead of using proper list markup.
 */
const MANUAL_BULLET_PATTERN = /^[•‣◦⁃∙●○■□\-*]\s+/;
const MANUAL_NUMBER_PATTERN = /^\d+[.)]\s+/;

const LIST_001: Rule = {
  id: 'LIST-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const paragraphs = Array.from(htmlDoc.querySelectorAll('p'));
    const getContext = buildLocationLookup(htmlDoc);

    // Build an ordered sequence of (text, isListStyled) from all non-empty
    // OOXML body paragraphs. A forward-only cursor advances through this
    // sequence as each HTML paragraph is processed, so a list-styled OOXML
    // paragraph can only suppress the HTML paragraph at or after the same
    // document position. This prevents a list-styled paragraph that appears
    // LATER in the document from masking an earlier genuine manual-bullet
    // paragraph that happens to share the same text (false negative).
    interface OoxmlPara { text: string; isListStyled: boolean }
    const ooxmlParas: OoxmlPara[] = [];
    if (doc.documentXml) {
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(doc.documentXml, 'application/xml');
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      for (const para of Array.from(xmlDoc.getElementsByTagName('w:p'))) {
        const pPr = Array.from(para.children).find(c => c.localName === 'pPr');
        const pStyle = pPr ? Array.from(pPr.children).find(c => c.localName === 'pStyle') : undefined;
        const styleName = pStyle
          ? (pStyle.getAttribute('w:val') ?? pStyle.getAttributeNS(W, 'val') ?? pStyle.getAttribute('val') ?? '')
          : '';
        const byNS = Array.from(para.getElementsByTagNameNS(W, 't'));
        const byTag = Array.from(para.getElementsByTagName('w:t'));
        const seen = new Set<Element>();
        const nodes: Element[] = [];
        for (const el of [...byNS, ...byTag]) {
          if (!seen.has(el)) { seen.add(el); nodes.push(el); }
        }
        const text = nodes.map(t => t.textContent ?? '').join('').trim();
        if (text) {
          ooxmlParas.push({ text, isListStyled: styleName.toLowerCase().includes('list') });
        }
      }
    }

    // Scan forward from this cursor to find the OOXML paragraph whose text
    // matches the current HTML paragraph, then advance the cursor past it.
    // Returns true iff that matching OOXML paragraph carries a list style.
    let ooxmlCursor = 0;
    function isOoxmlListStyled(text: string): boolean {
      if (!doc.documentXml || ooxmlParas.length === 0) return false;
      for (let i = ooxmlCursor; i < ooxmlParas.length; i++) {
        if (ooxmlParas[i]!.text === text) {
          ooxmlCursor = i + 1;
          return ooxmlParas[i]!.isListStyled;
        }
      }
      return false;
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
      // isOoxmlListStyled advances the forward cursor so each OOXML paragraph
      // can only suppress the HTML paragraph at its matching document position.
      if ((isBullet || isNumbered) && !isOoxmlListStyled(text)) {
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
