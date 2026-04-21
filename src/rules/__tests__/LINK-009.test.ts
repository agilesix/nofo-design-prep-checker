import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_009 from '../universal/LINK-009';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function makeDoc(documentXml: string): ParsedDocument {
  return {
    html: '',
    sections: [],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

function wrap(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

/** Normal (non-link) run */
function run(text: string): string {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}

/** Run with xml:space="preserve" for text containing spaces */
function runSpace(text: string): string {
  return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

/** External hyperlink (r:id) wrapping given content */
function extLink(content: string, relId = 'rId1'): string {
  return `<w:hyperlink r:id="${relId}">${content}</w:hyperlink>`;
}

/** Internal hyperlink (w:anchor) wrapping given content */
function anchorLink(anchor: string, content: string): string {
  return `<w:hyperlink w:anchor="${anchor}">${content}</w:hyperlink>`;
}

/** A run styled as a hyperlink (blue/underline) */
function linkRun(text: string): string {
  return `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${text}</w:t></w:r>`;
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection: leading partial character ─────────────────────────────────────

describe('LINK-009: leading partial character', () => {
  it('detects "G" before "oogle" link and returns AutoAppliedChange', () => {
    const doc = makeDoc(
      wrap(`<w:p>${run('G')}${extLink(linkRun('oogle.com'))}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('LINK-009');
    expect(change.targetField).toBe('link.partial.fix');
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 link');
  });

  it('detects a multi-character leading fragment ("Goo" before "gle.com" link)', () => {
    const doc = makeDoc(
      wrap(`<w:p>${run('Goo')}${extLink(linkRun('gle.com'))}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    expect((results[0] as AutoAppliedChange).value).toBe('1');
  });

  it('detects when only the trailing non-whitespace chars of the preceding run are adjacent', () => {
    // Preceding run is "See G" — only "G" should be flagged as partial
    const doc = makeDoc(
      wrap(`<w:p>${runSpace('See G')}${extLink(linkRun('oogle.com'))}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── Detection: trailing partial character ────────────────────────────────────

describe('LINK-009: trailing partial character', () => {
  it('detects ".com" after "Google" link', () => {
    const doc = makeDoc(
      wrap(`<w:p>${extLink(linkRun('Google'))}${run('.com')}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
  });

  it('detects only the leading non-whitespace chars of the following run', () => {
    // Following run is ".com today" — only ".com" should be flagged
    const doc = makeDoc(
      wrap(`<w:p>${extLink(linkRun('Google'))}${runSpace('.com today')}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── Detection: both leading and trailing ─────────────────────────────────────

describe('LINK-009: both leading and trailing partial characters', () => {
  it('counts one hyperlink when both leading and trailing chars are outside', () => {
    const doc = makeDoc(
      wrap(
        `<w:p>` +
        run('G') +
        extLink(linkRun('oogle')) +
        run('.com') +
        `</w:p>`
      )
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('1');
    expect(change.description).toContain('1 link');
  });
});

// ─── Detection: plural count ──────────────────────────────────────────────────

describe('LINK-009: multiple qualifying hyperlinks', () => {
  it('counts each qualifying hyperlink once', () => {
    const linkPara = `<w:p>${run('G')}${extLink(linkRun('oogle.com'), 'rId1')}</w:p>`;
    const doc = makeDoc(wrap(linkPara + linkPara.replace('rId1', 'rId2')));
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.value).toBe('2');
    expect(change.description).toContain('2 links');
  });
});

// ─── Detection: internal (w:anchor) hyperlinks ────────────────────────────────

describe('LINK-009: internal anchor hyperlinks', () => {
  it('detects partial chars adjacent to a w:anchor hyperlink', () => {
    const doc = makeDoc(
      wrap(`<w:p>${run('G')}${anchorLink('sec1', linkRun('oto section'))}</w:p>`)
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── Detection: bookmark elements skipped ────────────────────────────────────

describe('LINK-009: bookmark elements between run and hyperlink are skipped', () => {
  it('still detects partial chars when a w:bookmarkStart sits between the run and hyperlink', () => {
    const doc = makeDoc(
      wrap(
        `<w:p>` +
        run('G') +
        `<w:bookmarkStart w:id="1" w:name="bm1"/>` +
        extLink(linkRun('oogle.com')) +
        `<w:bookmarkEnd w:id="1"/>` +
        `</w:p>`
      )
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });

  it('still detects trailing chars when a w:bookmarkEnd sits between the hyperlink and following run', () => {
    const doc = makeDoc(
      wrap(
        `<w:p>` +
        extLink(linkRun('Google')) +
        `<w:bookmarkEnd w:id="1"/>` +
        run('.com') +
        `</w:p>`
      )
    );
    const results = LINK_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});

// ─── No-op: correctly wrapped hyperlink ──────────────────────────────────────

describe('LINK-009: no change when hyperlink is correctly wrapped', () => {
  it('does not flag when preceding run ends with a space', () => {
    const doc = makeDoc(
      wrap(`<w:p>${runSpace('See ')}${extLink(linkRun('Google.com'))}</w:p>`)
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when following run starts with a space', () => {
    const doc = makeDoc(
      wrap(`<w:p>${extLink(linkRun('Google.com'))}${runSpace(' for info')}</w:p>`)
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when both adjacent runs start/end with spaces', () => {
    const doc = makeDoc(
      wrap(
        `<w:p>` +
        runSpace('See ') +
        extLink(linkRun('Google.com')) +
        runSpace(' for info') +
        `</w:p>`
      )
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when there are no adjacent runs at all', () => {
    const doc = makeDoc(
      wrap(`<w:p>${extLink(linkRun('Google.com'))}</w:p>`)
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── No-op: non-run element blocks adjacency ─────────────────────────────────

describe('LINK-009: adjacency blocked by non-bookmark elements', () => {
  it('does not flag when a w:proofErr sits between the run and the hyperlink', () => {
    const doc = makeDoc(
      wrap(
        `<w:p>` +
        run('G') +
        `<w:proofErr w:type="spellStart"/>` +
        extLink(linkRun('oogle.com')) +
        `</w:p>`
      )
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('LINK-009: edge cases', () => {
  it('returns no changes for an empty documentXml', () => {
    expect(LINK_009.check(makeDoc(''), OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when documentXml has no hyperlinks', () => {
    const doc = makeDoc(wrap('<w:p>' + run('Plain text.') + '</w:p>'));
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag an empty hyperlink (no text content)', () => {
    const doc = makeDoc(
      wrap(`<w:p>${run('G')}<w:hyperlink r:id="rId1"/></w:p>`)
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('does not flag when the adjacent run contains only whitespace', () => {
    const doc = makeDoc(
      wrap(`<w:p>${runSpace('   ')}${extLink(linkRun('Google.com'))}</w:p>`)
    );
    expect(LINK_009.check(doc, OPTIONS)).toHaveLength(0);
  });
});
