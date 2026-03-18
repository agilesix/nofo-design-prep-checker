import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';

/**
 * NOTE-001: Footnotes present in document
 * Detects footnotes (Word footnotes appear as superscript numbers in mammoth output).
 * Flags them for review since the design system converts all notes to endnotes.
 */
const NOTE_001: Rule = {
  id: 'NOTE-001',
  check(doc: ParsedDocument, _options: RuleRunnerOptions): Issue[] {
    const issues: Issue[] = [];

    // Check if the zip contains footnotes.xml
    const footnotesFile = doc.zipArchive.file('word/footnotes.xml');
    if (!footnotesFile) return issues;

    // We can't easily read the file synchronously, so we flag it based on presence
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');
    const supElements = Array.from(htmlDoc.querySelectorAll('sup'));

    // Look for footnote-like superscripts (numbered)
    const footnoteSupElements = supElements.filter(sup => {
      const text = (sup.textContent ?? '').trim();
      return /^\d+$/.test(text);
    });

    if (footnoteSupElements.length > 0 || footnotesFile) {
      issues.push({
        id: 'NOTE-001-footnotes',
        ruleId: 'NOTE-001',
        title: 'Document may contain footnotes',
        severity: 'warning',
        sectionId: doc.sections[0]?.id ?? 'section-preamble',
        description: `This document appears to contain footnotes. The NOFO design system requires all notes to be endnotes, not footnotes. Footnotes must be converted to endnotes before design.`,
        suggestedFix: 'In Microsoft Word, go to References > Show Notes and convert all footnotes to endnotes using the Convert button.',
        instructionOnly: true,
      });
    }

    return issues;
  },
};

export default NOTE_001;
