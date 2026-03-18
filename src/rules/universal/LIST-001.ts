import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * LIST-001: Fake lists using manual bullets or dashes
 * Detects paragraphs that start with manual bullet characters instead of using proper list markup.
 */
const MANUAL_BULLET_PATTERN = /^[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB\u25A0\u25A1\-\*]\s+/;
const MANUAL_NUMBER_PATTERN = /^\d+[\.\)]\s+/;

const LIST_001: Rule = {
  id: 'LIST-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const paragraphs = Array.from(htmlDoc.querySelectorAll('p'));

    // Find consecutive paragraphs that look like list items
    const fakeBulletGroups: { start: number; end: number; type: 'bullet' | 'numbered' }[] = [];
    let currentGroupStart = -1;
    let currentGroupType: 'bullet' | 'numbered' | null = null;

    paragraphs.forEach((p, index) => {
      const text = (p.textContent ?? '').trim();
      const isBullet = MANUAL_BULLET_PATTERN.test(text);
      const isNumbered = MANUAL_NUMBER_PATTERN.test(text);

      if (isBullet || isNumbered) {
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

      issues.push({
        id: `LIST-001-${index}`,
        ruleId: 'LIST-001',
        title: `Manual ${group.type === 'bullet' ? 'bullet' : 'numbered'} list detected`,
        severity: 'warning',
        sectionId,
        description: `${count} consecutive paragraphs starting near "${text}…" appear to use manual ${group.type === 'bullet' ? 'bullet characters' : 'numbering'} instead of proper Word list formatting. This may not convert correctly to accessible HTML.`,
        suggestedFix: `Select these paragraphs in the source document and apply the proper ${group.type === 'bullet' ? 'bulleted' : 'numbered'} list style from the Word paragraph formatting options.`,
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
