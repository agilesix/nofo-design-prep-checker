import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-004: Heading may be too long (suggestion)
 *
 * Per WCAG 2.0 G130, headings should be descriptive and concise. Flags H3-H6
 * headings that exceed 10 words or 80 characters. H1 (NOFO title) and H2
 * (step titles) are excluded -- their length is driven by content requirements.
 *
 * Headings that appear to be entirely a proper noun phrase (every significant
 * word starts with an uppercase letter) are also excluded -- long organization
 * names are not heading length violations.
 *
 * Suppression: HEAD-004 is skipped for any heading that exceeds the HEAD-005
 * thresholds (>20 words or >150 characters), regardless of whether the heading
 * ends with a colon. The colon exception in HEAD-005 only determines whether
 * HEAD-005 surfaces an issue card -- it does not affect this suppression.
 *
 * When flagged, a text input pre-filled with the current heading text is shown
 * so the user can enter a shorter replacement. The heading level (H3-H6) is
 * preserved exactly in the downloaded document; only the w:t text content is
 * updated.
 *
 * targetField: "heading.text.H{level}.{headingIndex}::{originalText}"
 * headingIndex is the 0-based ordinal among ALL headings in the document
 * (same counting used by HEAD-003 / applyHeadingLevelCorrections).
 * When documentXml is present the ordinal comes from a deep getElementsByTagName('w:p')
 * traversal of the OOXML, counting only Heading 1-6 paragraphs; when only HTML
 * is available it falls back to querySelectorAll('h1,...,h6') ordering.
 */

const WORD_LIMIT = 10;
const CHAR_LIMIT = 80;

// HEAD-005 thresholds -- HEAD-004 is suppressed for any heading that exceeds these
const HEAD_005_WORD_LIMIT = 20;
const HEAD_005_CHAR_LIMIT = 150;

const CONNECTORS = new Set([
  'of', 'and', 'or', 'for', 'the', 'a', 'an', 'in', 'at', 'by', 'on',
  'to', 'with', 'from', 'into', 'onto', 'upon', 'via', 'but', 'nor',
  'so', 'yet', 'as',
]);

function isProperNounPhrase(text: string): boolean {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.every(word => {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (clean.length === 0) return true;
    if (CONNECTORS.has(clean.toLowerCase())) return true;
    return /^[A-Z]/.test(clean);
  });
}

// Returns the heading level (1-6) of a <w:p> element, or 0 if not a heading.
function h4XmlHeadingLevel(wP: Element): number {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return 0;
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
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

// Returns concatenated text of all <w:t> descendants inside a <w:p> element.
function h4XmlParaText(wP: Element): string {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const byNS = Array.from(wP.getElementsByTagNameNS(W, 't'));
  const byTag = Array.from(wP.getElementsByTagName('w:t'));
  const seen = new Set<Element>();
  const nodes: Element[] = [];
  for (const el of [...byNS, ...byTag]) {
    if (!seen.has(el)) { seen.add(el); nodes.push(el); }
  }
  return nodes.map(t => t.textContent ?? '').join('');
}

const HEAD_004: Rule = {
  id: 'HEAD-004',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    // Build heading sequence from OOXML when available (same source of truth as
    // buildDocx patch functions), falling back to mammoth HTML for test environments.
    let headingData: Array<{ level: number; text: string }>;

    if (doc.documentXml) {
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(doc.documentXml, 'application/xml');
      headingData = Array.from(xmlDoc.getElementsByTagName('w:p'))
        .map(wP => ({ level: h4XmlHeadingLevel(wP), text: h4XmlParaText(wP).trim() }))
        .filter(h => h.level > 0);
    } else {
      const htmlParser = new DOMParser();
      const htmlDoc = htmlParser.parseFromString(doc.html, 'text/html');
      headingData = Array.from(htmlDoc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => ({
          level: parseInt(h.tagName[1] ?? '0', 10),
          text: (h.textContent ?? '').trim(),
        }));
    }

    for (let headingIndex = 0; headingIndex < headingData.length; headingIndex++) {
      const { level, text } = headingData[headingIndex]!;

      if (level < 3) continue;
      if (!text) continue;

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const charCount = text.length;

      if (wordCount <= WORD_LIMIT && charCount <= CHAR_LIMIT) continue;

      // Suppress HEAD-004 for any heading that exceeds HEAD-005 thresholds --
      // either HEAD-005 will flag it (no colon) or the colon exception makes it
      // an intentional section label; either way HEAD-004 is redundant.
      if (wordCount > HEAD_005_WORD_LIMIT || charCount > HEAD_005_CHAR_LIMIT) continue;

      if (isProperNounPhrase(text)) continue;

      const sectionId = (() => {
        for (const section of doc.sections) {
          if (section.rawText.includes(text)) return section.id;
        }
        return doc.sections[0]?.id ?? 'section-preamble';
      })();

      issues.push({
        id: `HEAD-004-${headingIndex}`,
        ruleId: 'HEAD-004',
        title: 'Heading may be too long',
        severity: 'suggestion',
        sectionId,
        nearestHeading: text,
        description: (() => {
          const overWords = wordCount > WORD_LIMIT;
          const overChars = charCount > CHAR_LIMIT;
          let lengthSummary: string;
          if (overWords && overChars) {
            lengthSummary = `${wordCount} word${wordCount === 1 ? '' : 's'} and ${charCount} characters long`;
          } else if (overWords) {
            lengthSummary = `${wordCount} word${wordCount === 1 ? '' : 's'} long`;
          } else {
            lengthSummary = `${charCount} characters long`;
          }
          return (
            `The heading “${text}” is ${lengthSummary}. ` +
            `Per WCAG 2.0 G130, headings should be concise and descriptive. ` +
            `Consider shortening it to help users navigate and orient themselves within the document. ` +
            `Screen readers and assistive technology read the full heading text aloud.`
          );
        })(),
        inputRequired: {
          type: 'text',
          label: 'Revised heading',
          fieldDescription: `Enter a shorter heading. The heading level (H${level}) will be preserved.`,
          prefill: text,
          targetField: `heading.text.H${level}.${headingIndex}::${text}`,
        },
      });
    }

    return issues;
  },
};

export default HEAD_004;
