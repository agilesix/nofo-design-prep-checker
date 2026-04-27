import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

// Returns the heading level (1–6) of a <w:p> XML element, or 0 if the paragraph
// is not a Heading style or uses a level outside the 1–6 range (e.g. Heading 7–9,
// which are valid Word styles but outside this rule's contract).
function xmlHeadingLevel(wP: Element): number {
  const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
  if (!pPr) return 0;
  const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
  if (!pStyle) return 0;
  const val = pStyle.getAttribute('w:val') ?? '';
  const m = val.match(/^Heading\s*(\d+)$/i);
  if (!m) return 0;
  const level = parseInt(m[1]!, 10);
  return level >= 1 && level <= 6 ? level : 0;
}

// Returns concatenated text of all <w:t> descendants inside a <w:p> XML element.
function xmlParaText(wP: Element): string {
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

/**
 * HEAD-003: Skipped heading levels
 *
 * Heading levels must be sequential — an H4 cannot follow an H2 without an
 * H3 in between. NOFO Builder warns about non-sequential heading nesting on
 * import, and screen readers rely on sequential structure for navigation.
 *
 * Suggested level logic (one issue card per skipped heading):
 *   • If the following heading is at the same or deeper level as the flagged
 *     heading, the flagged heading is a section opener → suggest H[preceding+1].
 *   • If the following heading is at the same or shallower level as the
 *     preceding heading, the flagged heading is likely a peer → suggest
 *     H[preceding].
 *   • Otherwise (following is between preceding and flagged, exclusive) or
 *     there is no following heading → instruction-only.
 *
 * When a suggestion is determinable, an accept-to-fix input is offered so the
 * user can confirm or adjust the level before downloading.
 *
 * targetField format for accepted fixes:
 *   "heading.level.H{fromLevel}.{headingIndex}::{headingText}"
 *   headingIndex is the 0-based ordinal position of the heading among all
 *   Heading 1–6 paragraphs in the document. When documentXml is present the
 *   ordinal comes from a deep getElementsByTagName('w:p') traversal of the
 *   OOXML (matching applyHeadingLevelCorrections); when only HTML is available
 *   it falls back to querySelectorAll('h1,…,h6') ordering.
 *   This disambiguates headings with identical text.
 * value: the confirmed target level as a string (e.g. "2")
 */

const HEAD_003: Rule = {
  id: 'HEAD-003',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    // Build the heading sequence using a deep traversal so that headings nested
    // inside w:sdt content controls are included. When documentXml is available
    // (real documents), parse the OOXML directly; fall back to mammoth HTML for
    // environments that provide only HTML (e.g. unit tests without XML).
    let headingData: Array<{ level: number; text: string }>;

    if (doc.documentXml) {
      const xmlParser = new DOMParser();
      const xmlDoc = xmlParser.parseFromString(doc.documentXml, 'application/xml');
      headingData = Array.from(xmlDoc.getElementsByTagName('w:p'))
        .map(wP => ({ level: xmlHeadingLevel(wP), text: xmlParaText(wP).trim() }))
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

    for (let i = 1; i < headingData.length; i++) {
      const prev = headingData[i - 1]!;
      const curr = headingData[i]!;
      const next = headingData[i + 1] ?? null;

      // Only flag when the current level skips more than one step below the previous
      if (curr.level <= prev.level + 1) continue;

      const precedingLevel = prev.level;

      const sectionId = (() => {
        for (const section of doc.sections) {
          if (section.rawText.includes(curr.text)) return section.id;
        }
        return doc.sections[0]?.id ?? 'section-preamble';
      })();

      let suggestedLevel: number | undefined;
      let isAmbiguous: boolean;

      if (next !== null) {
        if (next.level >= curr.level) {
          // Following is at same or deeper level → flagged is a section opener
          suggestedLevel = precedingLevel + 1;
          isAmbiguous = false;
        } else if (next.level <= precedingLevel) {
          // Following is at same or shallower level as preceding → flagged is a peer
          suggestedLevel = precedingLevel;
          isAmbiguous = false;
        } else {
          // Following is between preceding and current (exclusive) → ambiguous
          isAmbiguous = true;
        }
      } else {
        isAmbiguous = true;
      }

      const description =
        `The heading \u201c${curr.text}\u201d is an H${curr.level} but follows an H${precedingLevel} ` +
        `\u2014 heading levels must be sequential. ` +
        `NOFO Builder will warn about incorrectly nested headings on import.`;

      if (isAmbiguous || suggestedLevel === undefined) {
        issues.push({
          id: `HEAD-003-${i}`,
          ruleId: 'HEAD-003',
          title: 'Heading levels skip a level',
          severity: 'warning',
          sectionId,
          nearestHeading: curr.text,
          description,
          suggestedFix:
            'Change this heading to the appropriate level in Word to maintain sequential heading structure.',
          instructionOnly: true,
        });
      } else {
        const nextInfo = next ? `, following H${next.level}` : '';
        issues.push({
          id: `HEAD-003-${i}`,
          ruleId: 'HEAD-003',
          title: 'Heading levels skip a level',
          severity: 'warning',
          sectionId,
          nearestHeading: curr.text,
          description,
          suggestedFix:
            `Based on the surrounding headings, this heading should be H${suggestedLevel}. ` +
            `Accept to apply this change to your downloaded document, or correct it manually in Word.`,
          inputRequired: {
            type: 'text',
            label: 'Corrected heading level (1\u20136)',
            prefill: String(suggestedLevel),
            prefillNote:
              `Suggested based on surrounding heading structure: ` +
              `preceding H${precedingLevel}${nextInfo}.`,
            targetField: `heading.level.H${curr.level}.${i}::${curr.text}`,
            validationPattern: '^[1-6]$',
            validationMessage: 'Enter a heading level between 1 and 6.',
          },
        });
      }
    }

    return issues;
  },
};

export default HEAD_003;
