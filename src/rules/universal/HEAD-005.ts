import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * HEAD-005: Heading may be misformatted normal text (suggestion)
 *
 * Flags H3-H6 headings that exceed 20 words or 150 characters -- lengths that
 * are strongly indicative of body text accidentally styled as a heading rather
 * than a genuine section title.
 *
 * Exceptions:
 *   - H1 and H2 are excluded (their length is content-driven).
 *   - Headings ending with a colon are excluded -- these are intentional
 *     section labels regardless of length.
 *
 * Suppression: HEAD-004 (heading may be too long) is suppressed for any
 * heading that triggers HEAD-005 -- only one rule fires per heading.
 *
 * When the user accepts, the paragraph style is changed from Heading N to
 * Normal in the downloaded docx. Only w:pStyle is updated; text content and
 * all run-level formatting are left untouched.
 *
 * targetField: "heading.style.H{level}.{headingIndex}::{originalText}"
 * headingIndex is the 0-based ordinal among ALL headings in the document
 * (same counting used by HEAD-003 / HEAD-004).
 * When documentXml is present the ordinal comes from a deep getElementsByTagName('w:p')
 * traversal of the OOXML, counting only Heading 1-6 paragraphs; when only HTML
 * is available it falls back to querySelectorAll('h1,...,h6') ordering.
 */

const WORD_LIMIT = 20;
const CHAR_LIMIT = 150;

// Returns the heading level (1-6) of a <w:p> element, or 0 if not a heading.
function h5XmlHeadingLevel(wP: Element): number {
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
function h5XmlParaText(wP: Element): string {
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

const HEAD_005: Rule = {
  id: 'HEAD-005',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    // Build heading sequence from OOXML when available (same source of truth as
    // buildDocx patch functions), falling back to mammoth HTML for test environments.
    let headingData: Array<{ level: number; text: string }>;

    if (doc.documentXml) {
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(doc.documentXml, 'application/xml');
      headingData = Array.from(xmlDoc.getElementsByTagName('w:p'))
        .map(wP => ({ level: h5XmlHeadingLevel(wP), text: h5XmlParaText(wP).trim() }))
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

      // Headings ending with a colon are intentional section labels
      if (text.trimEnd().endsWith(':')) continue;

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const charCount = text.length;

      if (wordCount <= WORD_LIMIT && charCount <= CHAR_LIMIT) continue;

      const sectionId = (() => {
        for (const section of doc.sections) {
          if (section.rawText.includes(text)) return section.id;
        }
        return doc.sections[0]?.id ?? 'section-preamble';
      })();

      const truncated = text.length > 60 ? `${text.slice(0, 60)}…` : text;

      issues.push({
        id: `HEAD-005-${headingIndex}`,
        ruleId: 'HEAD-005',
        title: 'Heading may be misformatted normal text',
        severity: 'suggestion',
        sectionId,
        nearestHeading: text,
        description:
          `The heading "${truncated}" is ${wordCount} word${wordCount === 1 ? '' : 's'} long. ` +
          `Headings this long are often normal text that was accidentally styled as a heading. ` +
          `If this text is meant to be a paragraph rather than a heading, accept the fix to change it to Normal style.`,
        targetField: `heading.style.H${level}.${headingIndex}::${text}`,
        acceptLabel: 'Change to normal text',
      } as Issue);
    }

    return issues;
  },
};

export default HEAD_005;
