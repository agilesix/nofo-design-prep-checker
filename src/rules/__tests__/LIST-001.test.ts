import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LIST_001 from '../universal/LIST-001';
import type { ParsedDocument } from '../../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OPTIONS = { contentGuideId: null } as const;

function makeDoc(html: string, documentXml = ''): ParsedDocument {
  return {
    html,
    sections: [
      {
        id: 'section-preamble',
        heading: 'Document start',
        headingLevel: 0,
        html,
        rawText: html.replace(/<[^>]+>/g, ''),
        startPage: 1,
      },
    ],
    rawText: html.replace(/<[^>]+>/g, ''),
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

/** Build document.xml for paragraphs with a given style + numId. */
function makeXmlPara(text: string, styleName: string, numId: string): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:pStyle w:val="${styleName}"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` +
    `</w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

function wrapXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}

// ─── False-positive regression ────────────────────────────────────────────────

describe('LIST-001: ListParagraph with numId=0 and typed bullet is not flagged', () => {
  it('does not flag paragraphs with ListParagraph style even when text opens with ◦', () => {
    // Three consecutive paragraphs that would normally trigger the rule:
    // they start with ◦ (U+25E6), but their OOXML style is ListParagraph
    // with numId="0" — Word suppresses the auto-glyph and the author typed ◦ directly.
    const html =
      '<p>◦ First item</p>' +
      '<p>◦ Second item</p>' +
      '<p>◦ Third item</p>';
    const documentXml = wrapXml(
      makeXmlPara('◦ First item', 'ListParagraph', '0') +
      makeXmlPara('◦ Second item', 'ListParagraph', '0') +
      makeXmlPara('◦ Third item', 'ListParagraph', '0')
    );
    expect(LIST_001.check(makeDoc(html, documentXml), OPTIONS)).toHaveLength(0);
  });

  it('does not flag a mix of "List Bullet" and "ListParagraph" style paragraphs', () => {
    const html =
      '<p>◦ Alpha</p>' +
      '<p>◦ Beta</p>' +
      '<p>◦ Gamma</p>';
    const documentXml = wrapXml(
      makeXmlPara('◦ Alpha', 'ListBullet', '0') +
      makeXmlPara('◦ Beta', 'ListParagraph', '0') +
      makeXmlPara('◦ Gamma', 'List Paragraph', '0')
    );
    expect(LIST_001.check(makeDoc(html, documentXml), OPTIONS)).toHaveLength(0);
  });
});

// ─── Normal detection still works ─────────────────────────────────────────────

describe('LIST-001: still flags genuine manual bullets', () => {
  it('flags 3+ consecutive paragraphs with bullet chars and no list style in OOXML', () => {
    const items = ['• Item one', '• Item two', '• Item three'];
    const html = items.map(t => `<p>${t}</p>`).join('');
    const documentXml = wrapXml(
      items
        .map(t => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`)
        .join('')
    );
    const issues = LIST_001.check(makeDoc(html, documentXml), OPTIONS);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('LIST-001');
    expect((issues[0] as import('../../types').Issue).severity).toBe('warning');
  });

  it('flags manual bullets even when documentXml is absent (no OOXML data)', () => {
    const html =
      '<p>• Item one</p>' +
      '<p>• Item two</p>' +
      '<p>• Item three</p>';
    const issues = LIST_001.check(makeDoc(html, ''), OPTIONS);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('LIST-001');
  });

  it('does not flag fewer than 2 consecutive matching paragraphs', () => {
    const html = '<p>• Only item</p>';
    expect(LIST_001.check(makeDoc(html, ''), OPTIONS)).toHaveLength(0);
  });
});
