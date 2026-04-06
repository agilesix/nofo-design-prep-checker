import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import LINK_002 from '../universal/LINK-002';
import type { ParsedDocument, Issue } from '../../types';

function makeDoc(html: string): ParsedDocument {
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
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

const OPTIONS = { contentGuideId: null } as const;

// ─── No issue for descriptive link text ──────────────────────────────────────

describe('LINK-002 — no issue', () => {
  it('produces no issue for descriptive link text', () => {
    const doc = makeDoc('<p><a href="https://example.com">Health IT Standards</a></p>');
    expect(LINK_002.check(doc, OPTIONS)).toHaveLength(0);
  });

  it('produces no issue when there are no links', () => {
    const doc = makeDoc('<p>No links here.</p>');
    expect(LINK_002.check(doc, OPTIONS)).toHaveLength(0);
  });
});

// ─── Phrase patterns — inline input ──────────────────────────────────────────

describe('LINK-002 — phrase patterns (inline input)', () => {
  const phraseCases = [
    'click here',
    'here',
    'this link',
    'read more',
    'more',
    'learn more',
    'this',
    'go here',
    'this page',
    'this document',
    'this form',
    'this website',
    'this site',
    'click',
  ];

  for (const phrase of phraseCases) {
    it(`flags "${phrase}" with an inline input field`, () => {
      const doc = makeDoc(`<p><a href="https://example.com">${phrase}</a></p>`);
      const results = LINK_002.check(doc, OPTIONS);
      expect(results).toHaveLength(1);
      const issue = results[0] as Issue;
      expect(issue.title).toBe('Non-descriptive link text');
      expect(issue.severity).toBe('error');
      expect(issue.instructionOnly).toBeFalsy();
      expect(issue.inputRequired).toBeDefined();
      expect(issue.inputRequired?.targetField).toMatch(/^link\.LINK-002-/);
    });
  }

  it('matching is case-insensitive for phrase patterns', () => {
    const doc = makeDoc('<p><a href="https://example.com">Click Here</a></p>');
    const issue = LINK_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.inputRequired).toBeDefined();
    expect(issue.instructionOnly).toBeFalsy();
  });
});

// ─── Single-word patterns — instruction-only ─────────────────────────────────

describe('LINK-002 — single-word patterns (instruction-only)', () => {
  const singleWordCases = ['link', 'website', 'page', 'document'];

  for (const word of singleWordCases) {
    it(`flags "${word}" as instruction-only with no input field`, () => {
      const doc = makeDoc(`<p><a href="https://example.com">${word}</a></p>`);
      const results = LINK_002.check(doc, OPTIONS);
      expect(results).toHaveLength(1);
      const issue = results[0] as Issue;
      expect(issue.title).toBe('Non-descriptive link text');
      expect(issue.severity).toBe('error');
      expect(issue.instructionOnly).toBe(true);
      expect(issue.inputRequired).toBeUndefined();
      expect(issue.suggestedFix).toContain('rewrite the surrounding sentence');
    });
  }

  it('matching is case-insensitive for single-word patterns', () => {
    const doc = makeDoc('<p><a href="https://example.com">Link</a></p>');
    const issue = LINK_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.instructionOnly).toBe(true);
    expect(issue.inputRequired).toBeUndefined();
  });

  it('single-word suggestedFix mentions rewriting the surrounding sentence', () => {
    const doc = makeDoc('<p><a href="https://example.com">website</a></p>');
    const issue = LINK_002.check(doc, OPTIONS)[0] as Issue;
    expect(issue.suggestedFix).toContain('surrounding sentence');
    expect(issue.suggestedFix).toContain('Word document');
  });
});
