import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import CLEAN_009 from '../universal/CLEAN-009';
import type { ParsedDocument, AutoAppliedChange } from '../../types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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

function wrapDoc(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const OPTIONS = { contentGuideId: null } as const;

// ─── Detection: tracked changes ───────────────────────────────────────────────

describe('CLEAN-009: detects tracked changes', () => {
  it('detects a w:ins element and returns an AutoAppliedChange', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:ins w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
      '<w:r><w:t>inserted</w:t></w:r></w:ins></w:p>'
    ));
    const results = CLEAN_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
    const change = results[0] as AutoAppliedChange;
    expect(change.ruleId).toBe('CLEAN-009');
    expect(change.targetField).toBe('doc.acceptchanges');
    expect(change.description).toBe('Tracked changes accepted and comments removed.');
  });

  it('detects a w:del element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:del w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
      '<w:r><w:delText>deleted</w:delText></w:r></w:del></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a w:moveFrom element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:moveFrom w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
      '<w:r><w:t>moved text</w:t></w:r></w:moveFrom></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a w:moveTo element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:moveTo w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
      '<w:r><w:t>moved text</w:t></w:r></w:moveTo></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a w:rPrChange element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:r><w:rPr><w:b/>' +
      '<w:rPrChange w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z"><w:rPr/></w:rPrChange>' +
      '</w:rPr><w:t>text</w:t></w:r></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a w:pPrChange element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:pPr>' +
      '<w:pPrChange w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z"><w:pPr/></w:pPrChange>' +
      '</w:pPr><w:r><w:t>text</w:t></w:r></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── Detection: comments ──────────────────────────────────────────────────────

describe('CLEAN-009: detects comment annotations', () => {
  it('detects a w:commentRangeStart element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:commentRangeStart w:id="1"/>' +
      '<w:r><w:t>text</w:t></w:r>' +
      '<w:commentRangeEnd w:id="1"/></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });

  it('detects a w:commentReference element', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:r><w:commentReference w:id="1"/></w:r></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(1);
  });
});

// ─── No-op: clean document ────────────────────────────────────────────────────

describe('CLEAN-009: no changes for clean documents', () => {
  it('returns no changes for a document with no tracked changes or comments', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p><w:r><w:t>Clean paragraph with no tracked changes.</w:t></w:r></w:p>'
    ));
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns no changes when documentXml is empty', () => {
    const doc = makeDoc('');
    expect(CLEAN_009.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('returns exactly one AutoAppliedChange even when both tracked changes and comments are present', () => {
    const doc = makeDoc(wrapDoc(
      '<w:p>' +
      '<w:ins w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z"><w:r><w:t>ins</w:t></w:r></w:ins>' +
      '<w:commentRangeStart w:id="1"/>' +
      '<w:r><w:t>text</w:t></w:r>' +
      '<w:commentRangeEnd w:id="1"/>' +
      '</w:p>'
    ));
    const results = CLEAN_009.check(doc, OPTIONS);
    expect(results).toHaveLength(1);
  });
});
