import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from '../buildDocx';
import type { AcceptedFix, AutoAppliedChange } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal word/document.xml containing one <w:p> per given paragraph
 * text string.
 */
function makeDocumentXml(paragraphs: string[]): string {
  const wParagraphs = paragraphs
    .map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${wParagraphs}<w:sectPr/></w:body>
</w:document>`;
}

/**
 * Build a minimal JSZip archive containing word/document.xml with the given
 * body paragraph texts.
 */
async function makeZip(paragraphs: string[]): Promise<JSZip> {
  const zip = new JSZip();
  zip.file('word/document.xml', makeDocumentXml(paragraphs));
  return zip;
}

/**
 * Run buildDocx and return the word/document.xml text from the output blob.
 */
async function getOutputDocXml(
  zip: JSZip,
  acceptedFixes: AcceptedFix[] = [],
  autoAppliedChanges: AutoAppliedChange[] = []
): Promise<string> {
  const blob = await buildDocx(zip, acceptedFixes, autoAppliedChanges);
  // JSZip.loadAsync accepts a Blob directly, avoiding the need for blob.arrayBuffer()
  // which is not available in all jsdom environments.
  const outZip = await JSZip.loadAsync(blob);
  const docFile = outZip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml missing from output');
  return docFile.async('string');
}

/**
 * Build a minimal docProps/core.xml string.
 */
function makeCoreXml({
  creator = '',
  subject = '',
  keywords = '',
}: { creator?: string; subject?: string; keywords?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>${creator}</dc:creator>
  <dc:subject>${subject}</dc:subject>
  <cp:keywords>${keywords}</cp:keywords>
</cp:coreProperties>`;
}

/**
 * Parse the paragraph texts from a serialized word/document.xml string, in
 * document order.
 */
function extractParagraphTexts(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('w:p')).map(p =>
    Array.from(p.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('')
  );
}

// ─── applyMetadataFixes ───────────────────────────────────────────────────────

describe('buildDocx — metadata body paragraph fixes', () => {
  it('replaces the author paragraph text with the accepted value', async () => {
    const zip = await makeZip([
      'Metadata author: [Author Name]',
      'Metadata subject: [Subject]',
      'Metadata keywords: [Keywords]',
    ]);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Metadata author: Jane Smith');
    // Other paragraphs untouched
    expect(xml).toContain('Metadata subject: [Subject]');
    expect(xml).toContain('Metadata keywords: [Keywords]');
  });

  it('replaces the subject paragraph text with the accepted value', async () => {
    const zip = await makeZip([
      'Metadata author: [Author Name]',
      'Metadata subject: [Subject]',
      'Metadata keywords: [Keywords]',
    ]);

    const fix: AcceptedFix = {
      issueId: 'META-002-0',
      ruleId: 'META-002',
      targetField: 'metadata.subject',
      value: 'Community Health Grants',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Metadata subject: Community Health Grants');
    expect(xml).toContain('Metadata author: [Author Name]');
    expect(xml).toContain('Metadata keywords: [Keywords]');
  });

  it('replaces the keywords paragraph text with the accepted value', async () => {
    const zip = await makeZip([
      'Metadata author: [Author Name]',
      'Metadata subject: [Subject]',
      'Metadata keywords: [Keywords]',
    ]);

    const fix: AcceptedFix = {
      issueId: 'META-003-0',
      ruleId: 'META-003',
      targetField: 'metadata.keywords',
      value: 'health, grants, CDC',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Metadata keywords: health, grants, CDC');
    expect(xml).toContain('Metadata author: [Author Name]');
    expect(xml).toContain('Metadata subject: [Subject]');
  });

  it('applies all three metadata fixes in one pass', async () => {
    const zip = await makeZip([
      'Metadata author: [Author Name]',
      'Metadata subject: [Subject]',
      'Metadata keywords: [Keywords]',
    ]);

    const fixes: AcceptedFix[] = [
      { issueId: 'META-001-0', ruleId: 'META-001', targetField: 'metadata.author', value: 'Jane Smith' },
      { issueId: 'META-002-0', ruleId: 'META-002', targetField: 'metadata.subject', value: 'Community Health' },
      { issueId: 'META-003-0', ruleId: 'META-003', targetField: 'metadata.keywords', value: 'health, CDC' },
    ];

    const xml = await getOutputDocXml(zip, fixes);
    expect(xml).toContain('Metadata author: Jane Smith');
    expect(xml).toContain('Metadata subject: Community Health');
    expect(xml).toContain('Metadata keywords: health, CDC');
  });

  it('matches the paragraph prefix case-insensitively', async () => {
    const zip = await makeZip(['METADATA AUTHOR: [Author Name]']);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Jane Smith');
  });

  it('does nothing when no matching paragraph is found', async () => {
    const zip = await makeZip(['Some unrelated paragraph text']);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).not.toContain('Jane Smith');
    expect(xml).toContain('Some unrelated paragraph text');
  });

  it('does not write stale text when the paragraph spans multiple runs', async () => {
    // Simulate a paragraph split across runs (common when Word applies partial bold)
    const zip = new JSZip();
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">Metadata author: </w:t></w:r>
      <w:r><w:t>[Author Name]</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
    zip.file('word/document.xml', xml);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const outXml = await getOutputDocXml(zip, [fix]);
    // The new text should appear
    expect(outXml).toContain('Metadata author: Jane Smith');
    // The old placeholder should not appear
    expect(outXml).not.toContain('[Author Name]');
  });
});

// ─── applyMetadataFixes — no core.xml modification + variant field names ──────

describe('buildDocx — metadata fixes: variant field names and no core.xml modification', () => {
  it('does not modify docProps/core.xml when a metadata fix is accepted', async () => {
    // core.xml must be left exactly as it was — metadata fixes only touch the
    // visible body paragraph, not the Word document properties.
    const originalCoreXml = makeCoreXml({ creator: '[Author Name]' });
    const zip = await makeZip(['Metadata author: [Author Name]']);
    zip.file('docProps/core.xml', originalCoreXml);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const blob = await buildDocx(zip, [fix]);
    const outputZip = await JSZip.loadAsync(blob);

    // Body paragraph must be updated
    const docXml = await outputZip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('Metadata author: Jane Smith');

    // core.xml must be unchanged — accepted value must NOT appear in it
    const coreXml = await outputZip.file('docProps/core.xml')!.async('string');
    expect(coreXml).not.toContain('Jane Smith');
    expect(coreXml).toContain('[Author Name]');
  });

  it('matches the short "Author:" variant and updates the body paragraph', async () => {
    const zip = await makeZip(['Author: Leave blank. Coach will insert.']);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Author: Jane Smith');
  });

  it('matches the short "Keywords:" variant and updates the body paragraph', async () => {
    const zip = await makeZip(['Keywords: Leave blank. Coach will insert.']);

    const fix: AcceptedFix = {
      issueId: 'META-003-0',
      ruleId: 'META-003',
      targetField: 'metadata.keywords',
      value: 'health, grants, CDC',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Keywords: health, grants, CDC');
  });

  it('matches the short "Subject:" variant and updates the body paragraph', async () => {
    const zip = await makeZip(['Subject: Leave blank. Coach will insert.']);

    const fix: AcceptedFix = {
      issueId: 'META-002-0',
      ruleId: 'META-002',
      targetField: 'metadata.subject',
      value: 'Community Health Grants',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Subject: Community Health Grants');
  });

  it('preserves the original field name prefix format in the output', async () => {
    // "Author:" must stay "Author:" in output — must not be rewritten to "Metadata author:"
    const zip = await makeZip(['Author: placeholder']);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    expect(xml).toContain('Author: Jane Smith');
    expect(xml).not.toContain('Metadata author:');
  });

  it('does not throw when docProps/core.xml is absent', async () => {
    // No core.xml added — function must not throw and must still update body
    const zip = await makeZip(['Metadata author: [Author Name]']);

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const docXml = await getOutputDocXml(zip, [fix]);
    expect(docXml).toContain('Metadata author: Jane Smith');
  });
});

// ─── applyTaglineRelocation ───────────────────────────────────────────────────

const TAGLINE_AUTO_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-005',
  description: 'Tagline paragraph relocated to after metadata block.',
  targetField: 'struct.tagline.relocate',
};

describe('buildDocx — tagline relocation', () => {
  it('moves the tagline to immediately after the Metadata keywords paragraph', async () => {
    const zip = await makeZip([
      'Metadata author: Jane Smith',
      'Metadata subject: Community Health',
      'Metadata keywords: health, CDC',
      'Tagline: Improving health outcomes',
      'Step 1: Review the Opportunity',
      'Some body paragraph',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    const keywordsIdx = paragraphs.findIndex(t => t.startsWith('Metadata keywords:'));
    const taglineIdx = paragraphs.findIndex(t => /^tagline\s*:/i.test(t));

    expect(keywordsIdx).toBeGreaterThanOrEqual(0);
    expect(taglineIdx).toBe(keywordsIdx + 1);
  });

  it('moves the tagline when it appears before the metadata block', async () => {
    const zip = await makeZip([
      'Tagline: Improving health outcomes',
      'Metadata author: Jane Smith',
      'Metadata subject: Community Health',
      'Metadata keywords: health, CDC',
      'Step 1: Review the Opportunity',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    const keywordsIdx = paragraphs.findIndex(t => t.startsWith('Metadata keywords:'));
    const taglineIdx = paragraphs.findIndex(t => /^tagline\s*:/i.test(t));

    expect(keywordsIdx).toBeGreaterThanOrEqual(0);
    expect(taglineIdx).toBe(keywordsIdx + 1);
  });

  it('removes duplicate tagline paragraphs and keeps only one after keywords', async () => {
    const zip = await makeZip([
      'Metadata author: Jane Smith',
      'Metadata keywords: health, CDC',
      'Tagline: First tagline',
      'Some paragraph',
      'Tagline: Duplicate tagline',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    const taglineCount = paragraphs.filter(t => /^tagline\s*:/i.test(t)).length;
    expect(taglineCount).toBe(1);

    const keywordsIdx = paragraphs.findIndex(t => t.startsWith('Metadata keywords:'));
    const taglineIdx = paragraphs.findIndex(t => /^tagline\s*:/i.test(t));
    expect(taglineIdx).toBe(keywordsIdx + 1);
  });

  it('skips silently when no tagline paragraph is found', async () => {
    const zip = await makeZip([
      'Metadata author: Jane Smith',
      'Metadata keywords: health, CDC',
      'Step 1: Review the Opportunity',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    // Document order should be unchanged
    expect(paragraphs[0]).toContain('Metadata author:');
    expect(paragraphs[1]).toContain('Metadata keywords:');
    expect(paragraphs[2]).toContain('Step 1');
  });

  it('skips silently when no Metadata keywords paragraph is found', async () => {
    const zip = await makeZip([
      'Metadata author: Jane Smith',
      'Tagline: Improving health outcomes',
      'Step 1: Review the Opportunity',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    // When the keywords paragraph is absent the function returns early without
    // modifying the document, so the tagline remains in its original position.
    const taglineCount = paragraphs.filter(t => /^tagline\s*:/i.test(t)).length;
    expect(taglineCount).toBe(1);
  });

  it('relocates the tagline when the keywords paragraph uses the short "Keywords:" variant', async () => {
    // Regression: applyTaglineRelocation previously hardcoded "metadata keywords:"
    // and silently skipped documents that use the short "Keywords:" form instead.
    const zip = await makeZip([
      'Author: Jane Smith',
      'Subject: Community Health',
      'Keywords: health, CDC',
      'Step 1: Review the Opportunity',
      'Some body paragraph',
      'Tagline: Improving health outcomes',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);

    const keywordsIdx = paragraphs.findIndex(t => /^keywords\s*:/i.test(t));
    const taglineIdx = paragraphs.findIndex(t => /^tagline\s*:/i.test(t));

    expect(keywordsIdx).toBeGreaterThanOrEqual(0);
    expect(taglineIdx).toBe(keywordsIdx + 1);
  });
});

// ─── applyTaglineUnquote (CLEAN-014) ─────────────────────────────────────────

const TAGLINE_UNQUOTE_AUTO_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-014',
  description: 'Quotation marks removed from tagline.',
  targetField: 'text.tagline.unquote',
};

describe('buildDocx — tagline unquote', () => {
  it('removes straight double quotes wrapping the tagline value and preserves the "Tagline:" label', async () => {
    const zip = await makeZip([
      'Metadata keywords: health, CDC',
      'Tagline: "Improving health outcomes"',
      'Step 1: Review the Opportunity',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_UNQUOTE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);
    const taglinePara = paragraphs.find(t => /^tagline\s*:/i.test(t));

    expect(taglinePara).toBeDefined();
    expect(taglinePara).toContain('Tagline:');
    expect(taglinePara).toBe('Tagline: Improving health outcomes');
  });

  it('removes smart/curly double quotes wrapping the tagline value', async () => {
    const zip = await makeZip([
      'Metadata keywords: health, CDC',
      'Tagline: \u201CImproving health outcomes\u201D',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_UNQUOTE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);
    const taglinePara = paragraphs.find(t => /^tagline\s*:/i.test(t));

    expect(taglinePara).toBeDefined();
    expect(taglinePara).toContain('Tagline:');
    expect(taglinePara).toBe('Tagline: Improving health outcomes');
  });

  it('composes correctly with struct.tagline.relocate — relocates then strips quotes', async () => {
    const zip = await makeZip([
      'Tagline: "Improving health outcomes"',
      'Metadata author: Jane Smith',
      'Metadata keywords: health, CDC',
      'Step 1: Review the Opportunity',
    ]);

    const xml = await getOutputDocXml(zip, [], [
      TAGLINE_AUTO_CHANGE,
      TAGLINE_UNQUOTE_AUTO_CHANGE,
    ]);
    const paragraphs = extractParagraphTexts(xml);

    const keywordsIdx = paragraphs.findIndex(t => t.startsWith('Metadata keywords:'));
    const taglineIdx = paragraphs.findIndex(t => /^tagline\s*:/i.test(t));

    // Tagline was relocated to follow keywords
    expect(keywordsIdx).toBeGreaterThanOrEqual(0);
    expect(taglineIdx).toBe(keywordsIdx + 1);

    // Quotes were stripped and label preserved
    expect(paragraphs[taglineIdx]).toBe('Tagline: Improving health outcomes');
  });

  it('leaves the tagline unchanged when there are no wrapping quotes', async () => {
    const zip = await makeZip([
      'Metadata keywords: health, CDC',
      'Tagline: Improving health outcomes',
    ]);

    const xml = await getOutputDocXml(zip, [], [TAGLINE_UNQUOTE_AUTO_CHANGE]);
    const paragraphs = extractParagraphTexts(xml);
    const taglinePara = paragraphs.find(t => /^tagline\s*:/i.test(t));

    expect(taglinePara).toBe('Tagline: Improving health outcomes');
  });
});

// ─── applyHeadingLeadingSpaceFix (CLEAN-008) ─────────────────────────────────

const W_NS_HEADING = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Build a minimal word/document.xml containing a mix of heading and body
 * paragraphs for CLEAN-008 testing.
 *
 * headingParas: array of { level, runs } where runs is an array of text strings
 *   that become separate <w:r><w:t> nodes within a single paragraph.
 * bodyParas: array of plain text strings that become unstyled body paragraphs.
 *
 * Heading paragraphs get <w:pPr><w:pStyle w:val="HeadingN"/></w:pPr> so that
 * isHeadingParagraph() in buildDocx.ts recognises them.
 *
 * Text runs whose content starts with a space get xml:space="preserve" so that
 * the space is not collapsed by XML parsers before we even inspect it.
 */
function makeHeadingDocXml(opts: {
  headingParas?: Array<{ level: number; runs: string[] }>;
  bodyParas?: string[];
}): string {
  const headings = (opts.headingParas ?? []).map(({ level, runs }) => {
    const wRuns = runs
      .map(text => {
        const preserve = text !== text.trimStart() || text !== text.trimEnd()
          ? ' xml:space="preserve"'
          : '';
        return `<w:r><w:t${preserve}>${text}</w:t></w:r>`;
      })
      .join('');
    return (
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
      wRuns +
      `</w:p>`
    );
  });

  const bodies = (opts.bodyParas ?? []).map(text => {
    const preserve = text !== text.trimStart() || text !== text.trimEnd()
      ? ' xml:space="preserve"'
      : '';
    return `<w:p><w:r><w:t${preserve}>${text}</w:t></w:r></w:p>`;
  });

  const allParagraphs = [...headings, ...bodies].join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_HEADING}">` +
    `<w:body>${allParagraphs}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const HEADING_LEADING_SPACE_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-008',
  description: 'Leading spaces removed from 1 heading.',
  targetField: 'heading.leadingspace',
};

describe('buildDocx — CLEAN-008: heading leading-space removal', () => {
  it('removes a single leading space from a single-run heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 1, runs: [' Introduction'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Introduction');
  });

  it('removes multiple leading spaces from a single-run heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 2, runs: ['   Section Title'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Section Title');
  });

  it('handles the multi-run edge case: first run is entirely spaces, content in second run', async () => {
    // Word sometimes splits a heading into multiple runs — e.g. a leading-space
    // run followed by a run with the actual heading text.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 1, runs: ['   ', 'Introduction'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // The combined text of all <w:t> nodes in the paragraph must have no
    // leading spaces regardless of which run(s) originally contained them.
    expect(texts[0]).toBe('Introduction');
  });

  it('handles the multi-run edge case: leading spaces span across two runs', async () => {
    // Spaces split across run boundary: run 1 = "  ", run 2 = "  Title"
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 2, runs: ['  ', '  Title'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Title');
  });

  it('preserves internal and trailing spaces in a heading while removing only leading spaces', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 2, runs: ['   Section  Title  '] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Section  Title  ');
  });
  it('leaves a heading with no leading space unchanged', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 1, runs: ['Clean Heading'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Clean Heading');
  });

  it('does not modify body paragraphs that have leading spaces', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({
        headingParas: [{ level: 1, runs: ['Clean Heading'] }],
        bodyParas: [' Body paragraph with leading space'],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // Body paragraph (index 1) must retain its leading space
    expect(texts[1]).toBe(' Body paragraph with leading space');
  });

  it('applies fix to multiple headings in the same document', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({
        headingParas: [
          { level: 1, runs: [' First Heading'] },
          { level: 2, runs: ['Clean Heading'] },
          { level: 2, runs: [' Third Heading'] },
        ],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('First Heading');
    expect(texts[1]).toBe('Clean Heading');
    expect(texts[2]).toBe('Third Heading');
  });

  it('does not call the patch when targetField is absent from autoAppliedChanges', async () => {
    // If no CLEAN-008 change is in the list, the document must be unmodified.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingDocXml({ headingParas: [{ level: 1, runs: [' Leading Space'] }] })
    );

    const outXml = await getOutputDocXml(zip, [], []); // no changes
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe(' Leading Space');
  });

  // ── Anchor update when heading slug changes ────────────────────────────────

  /**
   * Build a minimal document.xml containing a heading paragraph with a leading
   * space and a w:hyperlink paragraph whose w:anchor is the given value.
   * Used to verify that CLEAN-008 updates the hyperlink anchor when the heading
   * slug changes.
   */
  function makeHeadingWithLinkDocXml(opts: {
    headingText: string;
    linkAnchor: string;
  }): string {
    const preserve = opts.headingText !== opts.headingText.trimStart()
      ? ' xml:space="preserve"'
      : '';
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_HEADING}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` +
      `<w:r><w:t${preserve}>${opts.headingText}</w:t></w:r>` +
      `</w:p>` +
      `<w:p>` +
      `<w:hyperlink w:anchor="${opts.linkAnchor}" w:history="1">` +
      `<w:r><w:t>link text</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );
  }

  it('updates a w:hyperlink anchor that targets the old (leading-underscore) slug when the heading is cleaned', async () => {
    // " Contacts and Support" has anchor slug "_Contacts_and_Support".
    // After CLEAN-008 the heading becomes "Contacts and Support" and the slug
    // becomes "Contacts_and_Support".  The hyperlink must be updated to match.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingWithLinkDocXml({
        headingText: ' Contacts and Support',
        linkAnchor: '_Contacts_and_Support',
      })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);

    // Raw serialized XML must carry the namespace-prefixed attribute with the new slug.
    expect(outXml).toMatch(/w:anchor="Contacts_and_Support"/);
    expect(outXml).not.toMatch(/w:anchor="_Contacts_and_Support"/);
    // The heading text itself must also be clean.
    expect(extractParagraphTexts(outXml)[0]).toBe('Contacts and Support');
  });

  it('does not modify a hyperlink that targets a different anchor when a heading is cleaned', async () => {
    // The hyperlink points at "Overview" — unrelated to the cleaned heading.
    // It must be left untouched.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingWithLinkDocXml({
        headingText: ' Contacts and Support',
        linkAnchor: 'Overview',
      })
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);

    expect(outXml).toMatch(/w:anchor="Overview"/);
    // Heading is still cleaned regardless.
    expect(extractParagraphTexts(outXml)[0]).toBe('Contacts and Support');
  });

  it('also updates the w:bookmarkStart name so the hyperlink target still resolves in Word', async () => {
    // Real OOXML documents have a <w:bookmarkStart w:name="..."/> inside the
    // heading paragraph.  Updating w:hyperlink w:anchor without also updating
    // the bookmark name leaves the link pointing at a non-existent target.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_HEADING}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` +
      `<w:bookmarkStart w:id="0" w:name="_Contacts_and_Support"/>` +
      `<w:r><w:t xml:space="preserve"> Contacts and Support</w:t></w:r>` +
      `<w:bookmarkEnd w:id="0"/>` +
      `</w:p>` +
      `<w:p>` +
      `<w:hyperlink w:anchor="_Contacts_and_Support" w:history="1">` +
      `<w:r><w:t>link text</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);

    // Bookmark name must be updated to the clean slug (no leading underscore).
    expect(outXml).toMatch(/w:name="Contacts_and_Support"/);
    expect(outXml).not.toMatch(/w:name="_Contacts_and_Support"/);
    // Hyperlink anchor must also be updated.
    expect(outXml).toMatch(/w:anchor="Contacts_and_Support"/);
    expect(outXml).not.toMatch(/w:anchor="_Contacts_and_Support"/);
    // Heading text must also be clean.
    expect(extractParagraphTexts(outXml)[0]).toBe('Contacts and Support');
  });

  it('still updates the hyperlink anchor when the w: prefix has been stripped from w:anchor (namespace fallback)', async () => {
    // Simulates the state after a prior XMLSerializer pass dropped the "w:"
    // prefix: the hyperlink carries anchor="_Contacts_and_Support" (no
    // namespace) rather than w:anchor="...".  getAttributeNS(W, 'anchor')
    // returns null in this case, so the function must fall back to
    // getAttribute('anchor').  Using a bare anchor= attribute here makes the
    // test deterministic: it fails if the fallback is removed.
    // After the fix the output must contain the namespaced w:anchor with the
    // clean slug and must not carry a stale unprefixed anchor= attribute.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_HEADING}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve"> Contacts and Support</w:t></w:r>` +
      `</w:p>` +
      `<w:p>` +
      `<w:hyperlink anchor="_Contacts_and_Support" w:history="1">` +
      `<w:r><w:t>link text</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [HEADING_LEADING_SPACE_CHANGE]);

    // Hyperlink must be updated to the clean namespaced slug.
    expect(outXml).toMatch(/w:anchor="Contacts_and_Support"/);
    expect(outXml).not.toMatch(/w:anchor="_Contacts_and_Support"/);
    // No stale unprefixed anchor= attribute must remain in the output.
    expect(outXml).not.toMatch(/(?<!:)anchor="_Contacts_and_Support"/);
    // Heading must be clean.
    expect(extractParagraphTexts(outXml)[0]).toBe('Contacts and Support');
  });
});

// ─── applyAcceptTrackedChangesAndRemoveComments (CLEAN-009) ──────────────────

const W_NS_TC = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELS_NS_TC = 'http://schemas.openxmlformats.org/package/2006/relationships';

function makeTrackedChangeDocXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_TC}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

function makeMinimalRelsXml(extra = ''): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${RELS_NS_TC}">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    extra +
    `</Relationships>`
  );
}

const ACCEPT_CHANGES: AutoAppliedChange = {
  ruleId: 'CLEAN-009',
  description: 'Tracked changes accepted and comments removed.',
  targetField: 'doc.acceptchanges',
};

describe('buildDocx — CLEAN-009: accept tracked changes and remove comments', () => {
  // ── Tracked insertions ────────────────────────────────────────────────────

  it('unwraps w:ins: keeps inner run text, removes the wrapper', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:r><w:t xml:space="preserve">before </w:t></w:r>' +
        '<w:ins w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:r><w:t>inserted</w:t></w:r>' +
        '</w:ins>' +
        '<w:r><w:t xml:space="preserve"> after</w:t></w:r>' +
        '</w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:ins');
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('before inserted after');
  });

  // ── Tracked deletions ─────────────────────────────────────────────────────

  it('removes w:del and its content entirely', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:r><w:t xml:space="preserve">kept </w:t></w:r>' +
        '<w:del w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:r><w:delText>deleted</w:delText></w:r>' +
        '</w:del>' +
        '<w:r><w:t> text</w:t></w:r>' +
        '</w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:del');
    expect(outXml).not.toContain('deleted');
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('kept  text');
  });

  // ── moveTo / moveFrom ─────────────────────────────────────────────────────

  it('unwraps w:moveTo and removes w:moveFrom', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:moveFrom w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:r><w:t>source</w:t></w:r>' +
        '</w:moveFrom>' +
        '</w:p>' +
        '<w:p>' +
        '<w:moveTo w:id="2" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:r><w:t>destination</w:t></w:r>' +
        '</w:moveTo>' +
        '</w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:moveFrom');
    expect(outXml).not.toContain('w:moveTo');
    expect(outXml).not.toContain('source');
    expect(outXml).toContain('destination');
  });

  // ── Formatting change records ─────────────────────────────────────────────

  it('removes w:rPrChange, keeping the surrounding run property elements', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p><w:r>' +
        '<w:rPr><w:b/>' +
        '<w:rPrChange w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z"><w:rPr/></w:rPrChange>' +
        '</w:rPr>' +
        '<w:t>bold text</w:t>' +
        '</w:r></w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:rPrChange');
    // The run and its bold formatting should still be present
    expect(outXml).toContain('bold text');
    expect(outXml).toContain('w:b');
  });

  it('removes w:pPrChange, keeping the surrounding paragraph property elements', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:pPr><w:jc w:val="center"/>' +
        '<w:pPrChange w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z"><w:pPr/></w:pPrChange>' +
        '</w:pPr>' +
        '<w:r><w:t>centred</w:t></w:r>' +
        '</w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:pPrChange');
    expect(outXml).toContain('centred');
    expect(outXml).toContain('w:jc');
  });

  // ── Nested tracked changes ────────────────────────────────────────────────

  it('handles nested tracked changes: w:ins containing w:del', async () => {
    // Insertion wrapper containing a deletion — accept ins (unwrap), then discard del
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:ins w:id="1" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:del w:id="2" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:r><w:delText>inner deleted</w:delText></w:r>' +
        '</w:del>' +
        '<w:r><w:t>inner inserted</w:t></w:r>' +
        '</w:ins>' +
        '</w:p>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('w:ins');
    expect(outXml).not.toContain('w:del');
    expect(outXml).not.toContain('inner deleted');
    expect(outXml).toContain('inner inserted');
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  it('removes comment range markers and comment reference runs from document.xml', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:p>' +
        '<w:commentRangeStart w:id="1"/>' +
        '<w:r><w:t>commented text</w:t></w:r>' +
        '<w:commentRangeEnd w:id="1"/>' +
        '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>' +
        '</w:p>'
      )
    );
    zip.file('word/comments.xml', '<w:comments xmlns:w="' + W_NS_TC + '"><w:comment w:id="1"><w:p><w:r><w:t>a comment</w:t></w:r></w:p></w:comment></w:comments>');

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('commentRangeStart');
    expect(outXml).not.toContain('commentRangeEnd');
    expect(outXml).not.toContain('commentReference');
    // The annotated text itself must remain
    expect(outXml).toContain('commented text');
  });

  it('removes word/comments.xml from the output ZIP', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrackedChangeDocXml('<w:p><w:r><w:t>text</w:t></w:r></w:p>'));
    zip.file('word/comments.xml', '<w:comments xmlns:w="' + W_NS_TC + '"/>');

    const blob = await buildDocx(zip, [], [ACCEPT_CHANGES]);
    const outZip = await JSZip.loadAsync(blob);
    expect(outZip.file('word/comments.xml')).toBeNull();
  });

  it('removes word/commentsExtended.xml from the output ZIP when present', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrackedChangeDocXml('<w:p><w:r><w:t>text</w:t></w:r></w:p>'));
    zip.file('word/commentsExtended.xml', '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>');

    const blob = await buildDocx(zip, [], [ACCEPT_CHANGES]);
    const outZip = await JSZip.loadAsync(blob);
    expect(outZip.file('word/commentsExtended.xml')).toBeNull();
  });

  it('removes the comments.xml relationship entry from document.xml.rels', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrackedChangeDocXml('<w:p><w:r><w:t>text</w:t></w:r></w:p>'));
    zip.file('word/comments.xml', '<w:comments xmlns:w="' + W_NS_TC + '"/>');
    zip.file(
      'word/_rels/document.xml.rels',
      makeMinimalRelsXml(
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`
      )
    );

    const blob = await buildDocx(zip, [], [ACCEPT_CHANGES]);
    const outZip = await JSZip.loadAsync(blob);
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relsXml).not.toContain('comments.xml');
    // The unrelated styles relationship must remain
    expect(relsXml).toContain('styles.xml');
  });

  // ── No-op: clean document ─────────────────────────────────────────────────

  it('leaves a clean document unchanged when targetField is absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrackedChangeDocXml('<w:p><w:r><w:t>clean</w:t></w:r></w:p>'));

    const outXml = await getOutputDocXml(zip, [], []); // no changes
    expect(outXml).toContain('clean');
    expect(outXml).not.toContain('w:ins');
    expect(outXml).not.toContain('w:del');
  });
});

// ─── applyListPeriodFix (CLEAN-010) ──────────────────────────────────────────

const W_NS_LIST = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeListDocXml(groups: Array<{ numId: string; items: string[] }>): string {
  const paras = groups
    .flatMap(({ numId, items }) =>
      items.map(
        text =>
          `<w:p>` +
          `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
          `<w:r><w:t>${text}</w:t></w:r>` +
          `</w:p>`
      )
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_LIST}">` +
    `<w:body>${paras}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const LIST_PERIOD_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-010',
  description: 'Missing periods added to 2 list items for consistency.',
  targetField: 'list.periodfix',
};

describe('buildDocx — CLEAN-010: list period normalization', () => {
  it('adds a period to items missing one when the list has at least one period', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1.', 'Item 2', 'Item 3.', 'Item 4'] }])
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2.');
    expect(texts[2]).toBe('Item 3.');
    expect(texts[3]).toBe('Item 4.');
  });

  it('leaves all items unchanged when every item already ends with a period', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1.', 'Item 2.', 'Item 3.'] }])
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2.');
    expect(texts[2]).toBe('Item 3.');
  });

  it('leaves all items unchanged when no items end with a period', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1', 'Item 2', 'Item 3'] }])
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1');
    expect(texts[1]).toBe('Item 2');
    expect(texts[2]).toBe('Item 3');
  });

  it('does not modify a list with fewer than 3 items', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1.', 'Item 2'] }])
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2'); // unchanged — list has only 2 items
  });

  it('only modifies the qualifying list when two lists are present', async () => {
    // List 1 (numId=1, 3 items, no periods) → should NOT be modified
    // List 2 (numId=2, 3 items, 1 has period) → items 2 and 3 should get periods
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      (() => {
        const list1Paras = ['Alpha', 'Beta', 'Gamma']
          .map(
            t =>
              `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
              `<w:r><w:t>${t}</w:t></w:r></w:p>`
          )
          .join('');
        const bodyPara = `<w:p><w:r><w:t>A paragraph between the lists.</w:t></w:r></w:p>`;
        const list2Paras = ['X.', 'Y', 'Z']
          .map(
            t =>
              `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>` +
              `<w:r><w:t>${t}</w:t></w:r></w:p>`
          )
          .join('');
        return (
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<w:document xmlns:w="${W_NS_LIST}">` +
          `<w:body>${list1Paras}${bodyPara}${list2Paras}<w:sectPr/></w:body>` +
          `</w:document>`
        );
      })()
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // List 1: no periods in any item → untouched
    expect(texts[0]).toBe('Alpha');
    expect(texts[1]).toBe('Beta');
    expect(texts[2]).toBe('Gamma');
    // Body paragraph: untouched
    expect(texts[3]).toBe('A paragraph between the lists.');
    // List 2: X. already has period; Y and Z get periods
    expect(texts[4]).toBe('X.');
    expect(texts[5]).toBe('Y.');
    expect(texts[6]).toBe('Z.');
  });

  it('appends period to the last non-empty run in a multi-run list item', async () => {
    // Item text split across two runs: "Item" + " 2" — period goes after "2"
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_LIST}">` +
      `<w:body>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
      `<w:r><w:t>Item 1.</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
      `<w:r><w:t xml:space="preserve">Item </w:t></w:r><w:r><w:t>2</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
      `<w:r><w:t>Item 3.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2.');  // period appended to the "2" run
    expect(texts[2]).toBe('Item 3.');
  });

  it('does not modify the document when targetField is absent', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1.', 'Item 2', 'Item 3'] }])
    );

    const outXml = await getOutputDocXml(zip, [], []); // no changes
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2');  // unchanged
    expect(texts[2]).toBe('Item 3');  // unchanged
  });
});

// ─── applyChecklistCheckboxFix (CLEAN-011) ───────────────────────────────────

const W_NS_CHECKLIST = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Build a minimal document.xml with an Application checklist heading followed
 * by a table. Each entry in `rows` specifies the first-column cell's glyph
 * (used as the leading character of the cell text) and optional paragraph style.
 */
function makeChecklistDocXml(
  rows: Array<{ glyph: string; style?: string }>,
  headingStyle = 'Heading2'
): string {
  const tableRows = rows
    .map(({ glyph, style = '' }) => {
      const pStyle = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
      return (
        `<w:tr>` +
        `<w:tc><w:p>${pStyle}<w:r><w:t>${glyph} Item text</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>Second column</w:t></w:r></w:p></w:tc>` +
        `</w:tr>`
      );
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_CHECKLIST}">` +
    `<w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>` +
    `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
    `<w:tbl>${tableRows}</w:tbl>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

/**
 * Extract info about the first-column cell of each table row that appears
 * under the Application checklist heading in the given document XML.
 * Returns `{ text, style }` per row, where `style` is the w:pStyle value
 * (empty string if none set).
 */
function extractChecklistFirstColInfo(
  xml: string
): Array<{ text: string; style: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return [];

  const results: Array<{ text: string; style: string }> = [];
  let inChecklist = false;
  let checklistLevel = 0;

  for (const child of Array.from(body.children)) {
    if (child.localName === 'p') {
      const pPr = Array.from(child.children).find(c => c.localName === 'pPr');
      const styleEl = pPr && Array.from(pPr.children).find(c => c.localName === 'pStyle');
      const styleVal = styleEl?.getAttribute('w:val') ?? '';
      const m = styleVal.match(/^Heading(\d)/);
      const level = m ? parseInt(m[1]!, 10) : null;
      if (level !== null) {
        if (inChecklist && level <= checklistLevel) inChecklist = false;
        const text = Array.from(child.getElementsByTagName('w:t'))
          .map(t => t.textContent ?? '')
          .join('');
        if ((level === 2 || level === 3) && /application\s+checklist/i.test(text)) {
          inChecklist = true;
          checklistLevel = level;
        }
      }
    } else if (child.localName === 'tbl' && inChecklist) {
      for (const row of Array.from(child.children).filter(c => c.localName === 'tr')) {
        const firstCell = Array.from(row.children).find(c => c.localName === 'tc');
        if (!firstCell) continue;
        const firstPara = Array.from(firstCell.children).find(c => c.localName === 'p');
        if (!firstPara) continue;

        const text = Array.from(firstPara.getElementsByTagName('w:t'))
          .map(t => t.textContent ?? '')
          .join('');
        const pPr = Array.from(firstPara.children).find(c => c.localName === 'pPr');
        const styleEl = pPr && Array.from(pPr.children).find(c => c.localName === 'pStyle');
        const style = styleEl?.getAttribute('w:val') ?? '';

        results.push({ text, style });
      }
    }
  }

  return results;
}

const CHECKLIST_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-011',
  description: 'Application checklist checkboxes normalized — 1 cell corrected.',
  targetField: 'checklist.checkbox',
};

describe('buildDocx — CLEAN-011: checklist checkbox normalization', () => {
  it('replaces U+2610 BALLOT BOX (☐) with ◻ in first-column cells', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistDocXml([{ glyph: '☐' }]));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe('◻ Item text');
  });

  it('replaces □ (U+25A1 WHITE SQUARE) with ◻', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistDocXml([{ glyph: '□' }]));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.text).toBe('◻ Item text');
  });

  it('replaces bullet (•) with ◻', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistDocXml([{ glyph: '•' }]));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.text).toBe('◻ Item text');
  });

  it('changes ListParagraph style to Normal', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeChecklistDocXml([{ glyph: '◻', style: 'ListParagraph' }])
    );

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.style).toBe('Normal');
    // Glyph must not have been altered
    expect(rows[0]!.text).toBe('◻ Item text');
  });

  it('applies both glyph fix and style fix in the same cell', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeChecklistDocXml([{ glyph: '☐', style: 'ListBullet' }])
    );

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.text).toBe('◻ Item text');
    expect(rows[0]!.style).toBe('Normal');
  });

  it('leaves a cell unchanged when glyph is already correct and style is not a list style', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistDocXml([{ glyph: '◻' }]));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.text).toBe('◻ Item text');
    expect(rows[0]!.style).toBe('');
  });

  it('does not touch a table that precedes the Application checklist heading', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_CHECKLIST}"><w:body>` +
      // Out-of-scope table BEFORE the heading
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>☐ Should not change</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>◻ Already correct</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;

    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    // The out-of-scope table cell must be untouched
    expect(outXml).toContain('☐ Should not change');
    // The in-scope cell is already correct and should remain
    expect(outXml).toContain('◻ Already correct');
  });

  it('does not modify the patch when targetField is absent (no-op guard)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistDocXml([{ glyph: '☐' }]));

    // Pass no autoAppliedChanges — patch must not run
    const outXml = await getOutputDocXml(zip, [], []);
    const rows = extractChecklistFirstColInfo(outXml);
    expect(rows[0]!.text).toBe('☐ Item text');
  });
});

// ─── LINK-006 link text fix: hyperlink attribute preservation ─────────────────

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Build a minimal word/document.xml containing one or two <w:hyperlink> elements.
 * The first hyperlink has the given anchor (and optional r:id).
 * If hasExternalLink is true, a second hyperlink with only r:id="rId99" is added.
 */
function makeHyperlinkDocXml(opts: {
  anchor?: string;
  rid?: string;
  linkText?: string;
  hasExternalLink?: boolean;
}): string {
  const internalAttrs = [
    opts.anchor ? `w:anchor="${opts.anchor}"` : '',
    opts.rid    ? `r:id="${opts.rid}"`        : '',
    'w:history="1"',
  ].filter(Boolean).join(' ');

  const externalPara = opts.hasExternalLink
    ? `<w:p><w:hyperlink r:id="rId99" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>External link</w:t></w:r></w:hyperlink></w:p>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body>` +
    `<w:p><w:hyperlink ${internalAttrs}><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${opts.linkText ?? 'Click here'}</w:t></w:r></w:hyperlink></w:p>` +
    externalPara +
    `<w:sectPr/></w:body></w:document>`
  );
}

describe('buildDocx — LINK-006 link text fix: hyperlink attribute preservation', () => {
  // NOTE: these tests check the RAW SERIALIZED XML string (not just the re-parsed
  // DOM) so they will catch XMLSerializer stripping the w: namespace prefix.
  // Checking only via getAttributeNS on a re-parsed document is insufficient:
  // DOMParser re-parses `anchor="Section_2"` (no prefix) as an unprefixed
  // attribute with no namespace (namespaceURI === null), so
  // getAttributeNS(W_NS, 'anchor') on that result returns null. Checking the
  // literal string is therefore the authoritative test because Word reads the
  // raw bytes and requires the namespace-qualified `w:anchor` in the XML.

  it('serialized XML contains w:anchor with the w: prefix after a link text update', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'Section_2', linkText: 'Click here' }));

    const fix: AcceptedFix = {
      issueId: 'LINK-006-ltext-0',
      ruleId: 'LINK-006',
      targetField: 'link.text.Section_2',
      value: 'Go to Section 2',
    };

    const outXml = await getOutputDocXml(zip, [fix]);

    // Link text must be updated
    expect(outXml).toContain('Go to Section 2');

    // The literal serialized string must contain the namespace-prefixed attribute.
    // Word's hyperlink resolver reads the raw XML bytes: a bare anchor="Section_2"
    // (without the w: prefix) is invisible to it and causes navigation to the top
    // of the document instead of the target heading.
    expect(outXml).toMatch(/w:anchor="Section_2"/);
  });

  it('serialized XML preserves both w:anchor and r:id when a hyperlink carries both attributes', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({
      anchor: 'Section_2',
      rid: 'rId5',
      linkText: 'Click here',
    }));

    const fix: AcceptedFix = {
      issueId: 'LINK-006-ltext-0',
      ruleId: 'LINK-006',
      targetField: 'link.text.Section_2',
      value: 'Updated text',
    };

    const outXml = await getOutputDocXml(zip, [fix]);
    expect(outXml).toContain('Updated text');

    // The serialized XML must keep the w:anchor attribute literally, and must
    // also keep the relationship id attribute in serialized form even if the
    // serializer chooses a different namespace prefix for the relationships ns.
    expect(outXml).toMatch(/w:anchor="Section_2"/);
    expect(outXml).toMatch(/\s[\w.-]+:id="rId5"/);

    // Also verify the namespace-correct attribute values via DOM.
    const parser = new DOMParser();
    const doc = parser.parseFromString(outXml, 'application/xml');
    const hl = doc.getElementsByTagName('w:hyperlink')[0]!;
    expect(hl.getAttributeNS(W_NS, 'anchor')).toBe('Section_2');
    expect(hl.getAttributeNS(R_NS, 'id')).toBe('rId5');
  });

  it('does not modify an external hyperlink (r:id only) when updating an internal anchor link', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({
      anchor: 'Section_2',
      linkText: 'Internal link',
      hasExternalLink: true,
    }));

    const fix: AcceptedFix = {
      issueId: 'LINK-006-ltext-0',
      ruleId: 'LINK-006',
      targetField: 'link.text.Section_2',
      value: 'Go to Section 2',
    };

    const outXml = await getOutputDocXml(zip, [fix]);

    // Internal link text updated; w:anchor preserved with prefix
    expect(outXml).toContain('Go to Section 2');
    expect(outXml).toMatch(/w:anchor="Section_2"/);

    // External link text unchanged; r:id verified via DOM (prefix may vary)
    expect(outXml).toContain('External link');
    const parser = new DOMParser();
    const doc = parser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(doc.getElementsByTagName('w:hyperlink'));
    const externalHl = hyperlinks.find(el => el.getAttributeNS(R_NS, 'id') === 'rId99');
    expect(externalHl).toBeDefined();
    expect(externalHl!.getAttributeNS(R_NS, 'id')).toBe('rId99');
  });
});

// ─── Helpers: output zip ─────────────────────────────────────────────────────

/**
 * Run buildDocx and return the output archive for multi-file inspection.
 */
async function getOutputZip(
  zip: JSZip,
  acceptedFixes: AcceptedFix[] = [],
  autoAppliedChanges: AutoAppliedChange[] = []
): Promise<JSZip> {
  const blob = await buildDocx(zip, acceptedFixes, autoAppliedChanges);
  return JSZip.loadAsync(blob);
}

// ─── LINK-007: [PDF] label OOXML patch ────────────────────────────────────────

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HYPERLINK_TYPE_URI =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

/**
 * Minimal word/document.xml with one external hyperlink carrying the given
 * relationship ID and link text.
 */
function makePdfHyperlinkDocXml(rId: string, linkText: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body>` +
    `<w:p><w:hyperlink r:id="${rId}" w:history="1">` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${linkText}</w:t></w:r>` +
    `</w:hyperlink></w:p>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

/**
 * Minimal word/_rels/document.xml.rels with one hyperlink relationship.
 */
function makePdfRelsXml(
  rId: string,
  target: string,
  targetMode = 'External',
  type = HYPERLINK_TYPE_URI
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${RELS_NS}">` +
    `<Relationship Id="${rId}" Type="${type}" Target="${target}" TargetMode="${targetMode}"/>` +
    `</Relationships>`
  );
}

/**
 * Return the concatenated text of all <w:t> elements within the first
 * <w:hyperlink> with the given r:id in a serialized document.xml string.
 */
function getHyperlinkText(xml: string, rId: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const hyperlinks = Array.from(doc.getElementsByTagName('w:hyperlink'));
  const hl = hyperlinks.find(el => el.getAttributeNS(R_NS, 'id') === rId);
  if (!hl) return null;
  return Array.from(hl.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
}

const PDF_LABEL_CHANGE: AutoAppliedChange = {
  ruleId: 'LINK-007',
  description: '[PDF] label added.',
  targetField: 'link.pdf.label',
  value: '1',
};

describe('buildDocx — LINK-007: [PDF] label OOXML patch', () => {
  it('appends " [PDF]" to a PDF hyperlink whose text does not end with [PDF]', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Annual Report'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/annual-report.pdf'));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Annual Report [PDF]');
  });

  it('does not append [PDF] when link text already ends with [PDF]', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Annual Report [PDF]'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/annual-report.pdf'));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Annual Report [PDF]');
  });

  it('does not modify a non-PDF hyperlink', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Visit our website'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/page.html'));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Visit our website');
  });

  it('does not label a relationship missing TargetMode="External"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Internal PDF'));
    zip.file('word/_rels/document.xml.rels',
      // TargetMode defaults to empty string → not "External"
      makePdfRelsXml('rId1', 'https://example.com/internal.pdf', ''));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Internal PDF');
  });

  it('does not label a relationship whose Target is not an http(s) URL', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'File PDF'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'mailto:user@example.pdf'));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('File PDF');
  });

  it('does not label a relationship with a non-hyperlink Type', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Image PDF'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml(
        'rId1',
        'https://example.com/image.pdf',
        'External',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
      ));

    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Image PDF');
  });
});

// ─── CLEAN-012: asterisked bold OOXML patch ───────────────────────────────────

/**
 * Minimal word/document.xml with a heading paragraph (Heading2 by default)
 * followed by a body paragraph containing the given text.
 */
function makeAsteriskedDocXml(bodyText: string, headingStyle = 'Heading2'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>` +
    `<w:r><w:t>Approach</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

/**
 * Return the text of all runs that have w:b in their w:rPr.
 */
function getBoldRunTexts(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const runs = Array.from(doc.getElementsByTagName('w:r'));
  const bold: string[] = [];
  for (const run of runs) {
    const rPr = Array.from(run.children).find(c => c.localName === 'rPr');
    if (!rPr) continue;
    if (!Array.from(rPr.children).some(c => c.localName === 'b')) continue;
    const text = Array.from(run.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '').join('');
    if (text) bold.push(text);
  }
  return bold;
}

const ASTERISKED_BOLD_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-012',
  description: '"asterisked ( * )" bolded.',
  targetField: 'text.asterisked.bold',
  value: '1',
};

describe('buildDocx — CLEAN-012: asterisked bold OOXML patch', () => {
  it('bolds the phrase "asterisked ( * )" inside a run under the Approach heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeAsteriskedDocXml('Items marked asterisked ( * ) are required.')
    );

    const outXml = await getOutputDocXml(zip, [], [ASTERISKED_BOLD_CHANGE]);
    const boldTexts = getBoldRunTexts(outXml);
    expect(boldTexts).toContain('asterisked ( * )');
  });

  it('does not bold surrounding text — only the exact phrase', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeAsteriskedDocXml('Items marked asterisked ( * ) are required.')
    );

    const outXml = await getOutputDocXml(zip, [], [ASTERISKED_BOLD_CHANGE]);
    const boldTexts = getBoldRunTexts(outXml);
    // Surrounding text should not be bold
    for (const t of boldTexts) {
      expect(t).toBe('asterisked ( * )');
    }
  });

  it('does not bold a paragraph outside the scoped section', async () => {
    const zip = new JSZip();
    // "Eligibility" is not a scoped heading → phrase should NOT be bolded
    zip.file(
      'word/document.xml',
      (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W_NS}">` +
        `<w:body>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Eligibility</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Items marked asterisked ( * ) here.</w:t></w:r></w:p>` +
        `<w:sectPr/></w:body></w:document>`
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ASTERISKED_BOLD_CHANGE]);
    expect(getBoldRunTexts(outXml)).toHaveLength(0);
  });

  it('bolds the phrase under "Program logic model" heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W_NS}">` +
        `<w:body>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
        `<w:r><w:t>Program logic model</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Fields asterisked ( * ) are required.</w:t></w:r></w:p>` +
        `<w:sectPr/></w:body></w:document>`
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ASTERISKED_BOLD_CHANGE]);
    expect(getBoldRunTexts(outXml)).toContain('asterisked ( * )');
  });
});

// ─── applyH2TitleCaseFix ─────────────────────────────────────────────────────

/**
 * Build a document.xml that may contain Heading 2 paragraphs alongside
 * plain body paragraphs. Each item specifies its text and whether it should
 * carry a Heading 2 paragraph style.
 */
function makeH2DocumentXml(paragraphs: { text: string; isH2?: boolean }[]): string {
  const wParagraphs = paragraphs
    .map(({ text, isH2 }) => {
      const pPr = isH2
        ? '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>'
        : '';
      return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${wParagraphs}<w:sectPr/></w:body>
</w:document>`;
}

describe('buildDocx — applyH2TitleCaseFix', () => {
  it('corrects a single H2 heading from sentence case to title case', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeH2DocumentXml([
      { text: 'Program description information', isH2: true },
    ]));

    const change: AutoAppliedChange = {
      ruleId: 'HEAD-001',
      description: '1 H2 heading corrected to title case',
      targetField: 'heading.h2.titlecase',
      value: JSON.stringify([
        { old: 'Program description information', new: 'Program Description Information' },
      ]),
    };

    const outXml = await getOutputDocXml(zip, [], [change]);
    expect(outXml).toContain('Program Description Information');
    expect(outXml).not.toContain('Program description information');
  });

  it('corrects multiple H2 headings in a single pass', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeH2DocumentXml([
      { text: 'Program description information', isH2: true },
      { text: 'Types of awards and review criteria', isH2: true },
    ]));

    const change: AutoAppliedChange = {
      ruleId: 'HEAD-001',
      description: '2 H2 headings corrected to title case',
      targetField: 'heading.h2.titlecase',
      value: JSON.stringify([
        { old: 'Program description information', new: 'Program Description Information' },
        { old: 'Types of awards and review criteria', new: 'Types of Awards and Review Criteria' },
      ]),
    };

    const outXml = await getOutputDocXml(zip, [], [change]);
    expect(outXml).toContain('Program Description Information');
    expect(outXml).toContain('Types of Awards and Review Criteria');
  });

  it('leaves an H2 heading unchanged when it is already in title case', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeH2DocumentXml([
      { text: 'Program Description Information', isH2: true },
    ]));

    // No AutoAppliedChange passed — the download must not modify the heading
    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('Program Description Information');
  });

  it('does not modify a non-H2 paragraph whose text matches the correction key', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeH2DocumentXml([
      { text: 'Program description information', isH2: false }, // plain body paragraph
    ]));

    const change: AutoAppliedChange = {
      ruleId: 'HEAD-001',
      description: '1 H2 heading corrected to title case',
      targetField: 'heading.h2.titlecase',
      value: JSON.stringify([
        { old: 'Program description information', new: 'Program Description Information' },
      ]),
    };

    const outXml = await getOutputDocXml(zip, [], [change]);
    // Body paragraph must not be patched — only Heading 2 paragraphs qualify
    expect(outXml).toContain('Program description information');
    expect(outXml).not.toContain('Program Description Information');
  });
});

// ─── applyRemoveContentControls ──────────────────────────────────────────────

const SDT_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Build a document.xml string that wraps `innerXml` in a single <w:sdt>. */
function makeSdtDocumentXml(innerXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${SDT_NS}">` +
    `<w:body>` +
    `<w:sdt>` +
    `<w:sdtPr><w:tag w:val="testControl"/></w:sdtPr>` +
    `<w:sdtContent>${innerXml}</w:sdtContent>` +
    `</w:sdt>` +
    `<w:sectPr/>` +
    `</w:body>` +
    `</w:document>`
  );
}

/** Run buildDocx and return the text of any named part from the output blob. */
async function readOutputPart(zip: JSZip, path: string): Promise<string | null> {
  const blob = await buildDocx(zip, [], []);
  const outZip = await JSZip.loadAsync(blob);
  const file = outZip.file(path);
  if (!file) return null;
  return file.async('string');
}

describe('buildDocx — content control removal', () => {
  it('removes the <w:sdt> wrapper and its <w:sdtPr> / <w:sdtContent> elements', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSdtDocumentXml('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>'));

    const outXml = await getOutputDocXml(zip);

    expect(outXml).not.toContain('w:sdt');
    expect(outXml).not.toContain('w:sdtPr');
    expect(outXml).not.toContain('w:sdtContent');
  });

  it('preserves the visible text content from inside the content control', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeSdtDocumentXml('<w:p><w:r><w:t>Preserved text</w:t></w:r></w:p>')
    );

    const outXml = await getOutputDocXml(zip);

    const paragraphs = extractParagraphTexts(outXml);
    expect(paragraphs).toContain('Preserved text');
  });

  it('leaves a document with no content controls unchanged', async () => {
    const zip = await makeZip(['First paragraph', 'Second paragraph']);

    const outXml = await getOutputDocXml(zip);

    expect(outXml).not.toContain('w:sdt');
    const paragraphs = extractParagraphTexts(outXml);
    expect(paragraphs).toContain('First paragraph');
    expect(paragraphs).toContain('Second paragraph');
  });

  it('unwraps nested content controls, preserving the innermost text', async () => {
    // An outer <w:sdt> wraps an inner <w:sdt>. Reverse-order processing removes
    // the inner control first; the outer pass then correctly hoists the already-
    // extracted content. No <w:sdt> should survive.
    const nestedXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${SDT_NS}">` +
      `<w:body>` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent>` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent><w:p><w:r><w:t>Inner text</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:sdtContent>` +
      `</w:sdt>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', nestedXml);

    const outXml = await getOutputDocXml(zip);

    expect(outXml).not.toContain('w:sdt');
    expect(extractParagraphTexts(outXml)).toContain('Inner text');
  });

  it('strips content controls from a header part (word/header1.xml)', async () => {
    // Content controls in headers live in a separate ZIP entry — they must be
    // stripped even though they are not in word/document.xml.
    const headerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="${SDT_NS}">` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent><w:p><w:r><w:t>Header text</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:hdr>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['Body text']));
    zip.file('word/header1.xml', headerXml);

    const outHeaderXml = await readOutputPart(zip, 'word/header1.xml');

    expect(outHeaderXml).not.toBeNull();
    expect(outHeaderXml).not.toContain('w:sdt');
    expect(outHeaderXml).toContain('Header text');
  });

  it('strips content controls from footnotes (word/footnotes.xml)', async () => {
    // Content controls in footnotes are in word/footnotes.xml — they must also
    // be stripped from the output.
    const footnotesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:footnotes xmlns:w="${SDT_NS}">` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent><w:p><w:r><w:t>Footnote text</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:footnotes>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['Body text']));
    zip.file('word/footnotes.xml', footnotesXml);

    const outFootnotesXml = await readOutputPart(zip, 'word/footnotes.xml');

    expect(outFootnotesXml).not.toBeNull();
    expect(outFootnotesXml).not.toContain('w:sdt');
    expect(outFootnotesXml).toContain('Footnote text');
  });

});

// ─── applyHeadingLevelCorrections (HEAD-003) ─────────────────────────────────

/**
 * Build a <w:p> XML string styled as a heading.
 * Uses "Heading{level}" (no space) which is the standard Word format.
 */
function headingPara(level: number, text: string): string {
  return (
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

/**
 * Build a word/document.xml string from an array of already-serialized <w:p>
 * strings (heading or body).
 */
function makeDocXmlFromParas(paraStrings: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paraStrings.join('')}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

/**
 * Parse heading styles from a serialized word/document.xml string.
 * Returns [{style, text}] for every paragraph that has a pStyle matching /Heading/i.
 */
function extractHeadingStyles(xml: string): Array<{ style: string; text: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const result: Array<{ style: string; text: string }> = [];
  for (const wP of Array.from(doc.getElementsByTagName('w:p'))) {
    const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
    if (!pPr) continue;
    const pStyle = Array.from(pPr.children).find(c => c.localName === 'pStyle');
    if (!pStyle) continue;
    const style = pStyle.getAttribute('w:val') ?? '';
    if (!/heading/i.test(style)) continue;
    const text = Array.from(wP.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    result.push({ style, text });
  }
  return result;
}

describe('buildDocx — applyHeadingLevelCorrections (HEAD-003)', () => {
  it('changes the pStyle of the targeted heading to the accepted level', async () => {
    // Headings: H1(index 0), H3(index 1) — user accepts H3→H2
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'NOFO Title'),
      headingPara(3, 'Skipped Heading'),
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-003-1',
      ruleId: 'HEAD-003',
      targetField: 'heading.level.H3.1::Skipped Heading',
      value: '2',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    expect(styles).toHaveLength(2);
    expect(styles[0]).toMatchObject({ style: 'Heading1', text: 'NOFO Title' });
    expect(styles[1]).toMatchObject({ style: 'Heading2', text: 'Skipped Heading' });
  });

  it('preserves "Heading 2" (space) format when present in the original', async () => {
    const zip = new JSZip();
    // Use "Heading 4" (with space) as the source format
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading 1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading 4"/></w:pPr><w:r><w:t>Deep</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const fix: AcceptedFix = {
      issueId: 'HEAD-003-1',
      ruleId: 'HEAD-003',
      targetField: 'heading.level.H4.1::Deep',
      value: '2',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    expect(styles[1]).toMatchObject({ style: 'Heading 2', text: 'Deep' });
  });

  it('does not change a heading at a different ordinal position with the same text', async () => {
    // Two H3 headings with identical text — fix targets index 1, not index 3
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),          // index 0
      headingPara(2, 'Section A'),       // index 1
      headingPara(3, 'Introduction'),    // index 2 — same text, NOT targeted
      headingPara(2, 'Section B'),       // index 3
      headingPara(3, 'Introduction'),    // index 4 — targeted (H3 at position 4)
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-003-4',
      ruleId: 'HEAD-003',
      targetField: 'heading.level.H3.4::Introduction',
      value: '2',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // index 2: H3 'Introduction' — must stay H3
    expect(styles[2]).toMatchObject({ style: 'Heading3', text: 'Introduction' });
    // index 4: H3 'Introduction' — must become H2
    expect(styles[4]).toMatchObject({ style: 'Heading2', text: 'Introduction' });
  });

  it('does not change any heading when the from-level does not match', async () => {
    // Fix says H4 at index 1, but that position is actually H3 — no change
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, 'Section'),
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-003-1',
      ruleId: 'HEAD-003',
      targetField: 'heading.level.H4.1::Section',
      value: '2',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // H3 must be unchanged because fix.from (4) !== actual level (3)
    expect(styles[1]).toMatchObject({ style: 'Heading3', text: 'Section' });
  });

  it('applies multiple independent level corrections in one pass', async () => {
    // H1(0), H3(1), H5(2) — fix both skipped headings
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, 'First Skip'),
      headingPara(5, 'Second Skip'),
    ]));

    const fixes: AcceptedFix[] = [
      { issueId: 'HEAD-003-1', ruleId: 'HEAD-003', targetField: 'heading.level.H3.1::First Skip', value: '2' },
      { issueId: 'HEAD-003-2', ruleId: 'HEAD-003', targetField: 'heading.level.H5.2::Second Skip', value: '3' },
    ];

    const xml = await getOutputDocXml(zip, fixes);
    const styles = extractHeadingStyles(xml);
    expect(styles[0]).toMatchObject({ style: 'Heading1', text: 'Title' });
    expect(styles[1]).toMatchObject({ style: 'Heading2', text: 'First Skip' });
    expect(styles[2]).toMatchObject({ style: 'Heading3', text: 'Second Skip' });
  });

  it('skips the fix when ordinal index matches but heading text does not', async () => {
    // Simulates index drift: a preceding heading was removed by an earlier
    // transform, so a different heading now sits at the targeted index.
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, 'Different Text'),  // index 1 — text does not match fix
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-003-1',
      ruleId: 'HEAD-003',
      // from-level and index match, but headingText is stale
      targetField: 'heading.level.H3.1::Skipped Heading',
      value: '2',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // H3 must stay H3 because the text guard rejected the fix
    expect(styles[1]).toMatchObject({ style: 'Heading3', text: 'Different Text' });
  });

  it('leaves the document unchanged when no heading-level fixes are present', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, 'Skipped'),
    ]));

    const xml = await getOutputDocXml(zip, []);
    const styles = extractHeadingStyles(xml);
    expect(styles[0]).toMatchObject({ style: 'Heading1' });
    expect(styles[1]).toMatchObject({ style: 'Heading3' });
  });
});

// ─── applyHeadingTextCorrections (HEAD-004) ──────────────────────────────────

describe('buildDocx — applyHeadingTextCorrections (HEAD-004)', () => {
  it('replaces the heading text and preserves the heading style', async () => {
    // H1(0), H3(1) — user shortens the H3
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'NOFO Title'),
      headingPara(3, 'This heading has eleven words so it should be flagged here'),
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-1',
      ruleId: 'HEAD-004',
      targetField: 'heading.text.H3.1::This heading has eleven words so it should be flagged here',
      value: 'Flagged heading',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    expect(styles).toHaveLength(2);
    // Style unchanged
    expect(styles[1]).toMatchObject({ style: 'Heading3', text: 'Flagged heading' });
    // H1 untouched
    expect(styles[0]).toMatchObject({ style: 'Heading1', text: 'NOFO Title' });
  });

  it('does not apply the fix when value is identical to the original text', async () => {
    const originalText = 'This heading has eleven words so it should be flagged here';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, originalText),
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-1',
      ruleId: 'HEAD-004',
      targetField: `heading.text.H3.1::${originalText}`,
      value: originalText,
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // Text unchanged — fix was a no-op
    expect(styles[1]).toMatchObject({ style: 'Heading3', text: originalText });
  });

  it('targets by ordinal index — does not affect a heading at a different position', async () => {
    const longText = 'This heading has eleven words so it should be flagged here';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),           // index 0
      headingPara(3, longText),          // index 1 — NOT targeted
      headingPara(2, 'Section'),         // index 2
      headingPara(3, longText),          // index 3 — targeted
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-3',
      ruleId: 'HEAD-004',
      targetField: `heading.text.H3.3::${longText}`,
      value: 'Short heading',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // Index 1 (second element in styles) unchanged
    expect(styles[1]).toMatchObject({ style: 'Heading3', text: longText });
    // Index 3 (fourth element in styles) updated
    expect(styles[3]).toMatchObject({ style: 'Heading3', text: 'Short heading' });
  });

  it('applies text fix even when HEAD-003 already changed the heading level in the same buildDocx run', async () => {
    // H1(0), H4(1) — the H4 skips from H1 (HEAD-003 fires) AND its text is too
    // long (HEAD-004 fires). The level fix runs first and changes H4→H2. The text
    // fix must still apply even though the heading is now H2, not H4.
    const longText = 'This heading has eleven words so it should be flagged here';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'NOFO Title'),    // index 0
      headingPara(4, longText),        // index 1 — skips H1→H4, and is too long
    ]));

    const levelFix: AcceptedFix = {
      issueId: 'HEAD-003-1',
      ruleId: 'HEAD-003',
      targetField: 'heading.level.H4.1::' + longText,
      value: '2',
    };
    const textFix: AcceptedFix = {
      issueId: 'HEAD-004-1',
      ruleId: 'HEAD-004',
      targetField: 'heading.text.H4.1::' + longText,
      value: 'Short heading',
    };

    const xml = await getOutputDocXml(zip, [levelFix, textFix]);
    const styles = extractHeadingStyles(xml);
    // Level corrected H4→H2
    expect(styles[1]).toMatchObject({ style: 'Heading2' });
    // Text corrected despite level having changed before this patch ran
    expect(styles[1]).toMatchObject({ text: 'Short heading' });
  });
});

// ─── LINK-006 auto-applied bookmark retargets ─────────────────────────────────

function makeSimpleHyperlinkDocXml(anchor: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:hyperlink w:anchor="${anchor}">
        <w:r><w:t>Link text</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
}

describe('buildDocx — LINK-006 auto-applied bookmark retargets', () => {
  it('retargets w:anchor from old to new value when acceptedFixes is empty', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSimpleHyperlinkDocXml('_Eligibility'));

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Eligibility" → "#Eligibility"',
      targetField: 'link.bookmark._Eligibility',
      value: 'Eligibility',
    };

    const xml = await getOutputDocXml(zip, [], [change]);
    expect(xml).toContain('w:anchor="Eligibility"');
    expect(xml).not.toContain('w:anchor="_Eligibility"');
  });

  it('does not require any acceptedFixes to trigger the bookmark patch', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSimpleHyperlinkDocXml('_Grants_management'));

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Grants_management" → "#Grants_management"',
      targetField: 'link.bookmark._Grants_management',
      value: 'Grants_management',
    };

    const xml = await getOutputDocXml(zip, [], [change]);
    expect(xml).toContain('w:anchor="Grants_management"');
  });

  it('leaves a non-matching anchor untouched', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSimpleHyperlinkDocXml('_Eligibility'));

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Other" → "#Other"',
      targetField: 'link.bookmark._Other',
      value: 'Other',
    };

    const xml = await getOutputDocXml(zip, [], [change]);
    expect(xml).toContain('w:anchor="_Eligibility"');
    expect(xml).not.toContain('w:anchor="Other"');
  });

  it('does not modify w:bookmarkStart w:name when only the hyperlink anchor changes', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:bookmarkStart w:id="1" w:name="_Contacts_and_Support"/>
      <w:r><w:t>Contacts and Support</w:t></w:r>
      <w:bookmarkEnd w:id="1"/>
    </w:p>
    <w:p>
      <w:hyperlink w:anchor="_Contacts_and_support">
        <w:r><w:t>Link</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted "#_Contacts_and_support" → "#_Contacts_and_Support"',
      targetField: 'link.bookmark._Contacts_and_support',
      value: '_Contacts_and_Support',
    };

    const xml = await getOutputDocXml(zip, [], [change]);
    // Hyperlink anchor updated
    expect(xml).toContain('w:anchor="_Contacts_and_Support"');
    expect(xml).not.toContain('w:anchor="_Contacts_and_support"');
    // Bookmark name must be unchanged — LINK-006 only touches the hyperlink
    expect(xml).toContain('w:name="_Contacts_and_Support"');
    expect(xml).not.toContain('w:name="_Contacts_and_support"');
  });

  it('applies multiple bookmark retargets in one pass', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:hyperlink w:anchor="_Eligibility"><w:r><w:t>A</w:t></w:r></w:hyperlink>
    </w:p>
    <w:p>
      <w:hyperlink w:anchor="_Program-specific_limitations_1"><w:r><w:t>B</w:t></w:r></w:hyperlink>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
    );

    const changes: AutoAppliedChange[] = [
      {
        ruleId: 'LINK-006',
        description: 'Retargeted "#_Eligibility" → "#Eligibility"',
        targetField: 'link.bookmark._Eligibility',
        value: 'Eligibility',
      },
      {
        ruleId: 'LINK-006',
        description: 'Retargeted "#_Program-specific_limitations_1" → "#_Program-specific_limitations"',
        targetField: 'link.bookmark._Program-specific_limitations_1',
        value: '_Program-specific_limitations',
      },
    ];

    const xml = await getOutputDocXml(zip, [], changes);
    expect(xml).toContain('w:anchor="Eligibility"');
    expect(xml).toContain('w:anchor="_Program-specific_limitations"');
    expect(xml).not.toContain('w:anchor="_Eligibility"');
    expect(xml).not.toContain('w:anchor="_Program-specific_limitations_1"');
  });
});

// ─── LINK-006 + CLEAN-008 interaction ────────────────────────────────────────
//
// These tests cover the two real-world failing cases the user reported:
//   1. "#_Responsiveness_criteria_1" → "#_Responsiveness_criteria" (suffix stripped)
//   2. "#_Contacts_and_support" → "#_Contacts_and_Support" (capitalisation fix)
//
// Both involve a heading with a leading space, so CLEAN-008 also runs and
// renames the w:bookmarkStart w:name from _Foo → Foo (leading underscore removed).
// The hyperlink must stay in sync: the final anchor and bookmark name must match.

function makeHeadingBookmarkDocXml({
  headingText,
  bookmarkName,
  hyperlinkAnchor,
}: {
  headingText: string;
  bookmarkName: string;
  hyperlinkAnchor: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:bookmarkStart w:id="1" w:name="${bookmarkName}"/>
      <w:r><w:t xml:space="preserve">${headingText}</w:t></w:r>
      <w:bookmarkEnd w:id="1"/>
    </w:p>
    <w:p>
      <w:hyperlink w:anchor="${hyperlinkAnchor}">
        <w:r><w:t>See section</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
}

describe('buildDocx — LINK-006 bookmark retarget + CLEAN-008 heading leading-space interaction', () => {
  it('Case 2: capitalisation fix — final anchor and bookmark both become "Contacts_and_Support"', async () => {
    // Heading " Contacts and Support" (leading space) → CLEAN-008 strips space and
    // renames bookmark _Contacts_and_Support → Contacts_and_Support.
    // LINK-006 first fixes the wrong-case anchor _Contacts_and_support →
    // _Contacts_and_Support, then CLEAN-008 updates that anchor → Contacts_and_Support.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingBookmarkDocXml({
        headingText: ' Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        hyperlinkAnchor: '_Contacts_and_support',
      })
    );

    const changes: AutoAppliedChange[] = [
      {
        ruleId: 'LINK-006',
        description: 'Retargeted "#_Contacts_and_support" → "#_Contacts_and_Support"',
        targetField: 'link.bookmark._Contacts_and_support',
        value: '_Contacts_and_Support',
      },
      {
        ruleId: 'CLEAN-008',
        description: 'Removed leading spaces from headings',
        targetField: 'heading.leadingspace',
      },
    ];

    const xml = await getOutputDocXml(zip, [], changes);

    // After LINK-006 then CLEAN-008, both should end up as "Contacts_and_Support"
    expect(xml).toContain('w:anchor="Contacts_and_Support"');
    expect(xml).toContain('w:name="Contacts_and_Support"');
    // Neither should retain the leading-underscore form
    expect(xml).not.toContain('w:anchor="_Contacts_and_Support"');
    expect(xml).not.toContain('w:anchor="_Contacts_and_support"');
    expect(xml).not.toContain('w:name="_Contacts_and_Support"');
  });

  it('Case 1: suffix-stripped fix — final anchor and bookmark both become "Responsiveness_criteria"', async () => {
    // LINK-006 fixes _Responsiveness_criteria_1 → _Responsiveness_criteria (Pass 2).
    // CLEAN-008 then renames the bookmark and updates the hyperlink so both become
    // Responsiveness_criteria (leading underscore removed by space-strip).
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingBookmarkDocXml({
        headingText: ' Responsiveness criteria',
        bookmarkName: '_Responsiveness_criteria',
        hyperlinkAnchor: '_Responsiveness_criteria_1',
      })
    );

    const changes: AutoAppliedChange[] = [
      {
        ruleId: 'LINK-006',
        description: 'Retargeted "#_Responsiveness_criteria_1" → "#_Responsiveness_criteria"',
        targetField: 'link.bookmark._Responsiveness_criteria_1',
        value: '_Responsiveness_criteria',
      },
      {
        ruleId: 'CLEAN-008',
        description: 'Removed leading spaces from headings',
        targetField: 'heading.leadingspace',
      },
    ];

    const xml = await getOutputDocXml(zip, [], changes);

    expect(xml).toContain('w:anchor="Responsiveness_criteria"');
    expect(xml).toContain('w:name="Responsiveness_criteria"');
    expect(xml).not.toContain('w:anchor="_Responsiveness_criteria"');
    expect(xml).not.toContain('w:anchor="_Responsiveness_criteria_1"');
    expect(xml).not.toContain('w:name="_Responsiveness_criteria"');
  });

  it('LINK-006 without CLEAN-008 — anchor and bookmark both retain leading underscore', async () => {
    // When CLEAN-008 is not active (heading has no leading space), the bookmark
    // keeps its leading underscore and the LINK-006-fixed anchor must match it.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeHeadingBookmarkDocXml({
        headingText: 'Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        hyperlinkAnchor: '_Contacts_and_support',
      })
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted "#_Contacts_and_support" → "#_Contacts_and_Support"',
      targetField: 'link.bookmark._Contacts_and_support',
      value: '_Contacts_and_Support',
    };

    const xml = await getOutputDocXml(zip, [], [change]);

    // Anchor correctly updated to match the existing bookmark
    expect(xml).toContain('w:anchor="_Contacts_and_Support"');
    expect(xml).toContain('w:name="_Contacts_and_Support"');
    expect(xml).not.toContain('w:anchor="_Contacts_and_support"');
  });
});

// ─── applyRemoveDghtScaffolding (CLEAN-007) ──────────────────────────────────

const W_NS_PREAMBLE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Build a paragraph with an optional heading style and text. */
function makeParaXml(text: string, headingStyle?: string): string {
  const pPr = headingStyle
    ? `<w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>`
    : '';
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

/** Build a minimal table with one cell containing the given text. */
function makeTableXml(text: string): string {
  return (
    `<w:tbl>` +
    `<w:tr><w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc></w:tr>` +
    `</w:tbl>`
  );
}

/**
 * Build a document.xml with optional preamble elements, the Step 1 anchor
 * heading, and optional following content.
 */
function makePreambleDocXml(parts: {
  preamble?: string[];
  preambleTables?: string[];
  step1Style?: string;
  after?: string[];
}): string {
  const { preamble = [], preambleTables = [], step1Style = 'Heading2', after = [] } = parts;
  const preParas = preamble.map(t => makeParaXml(t)).join('');
  const preTables = preambleTables.map(t => makeTableXml(t)).join('');
  const step1 = makeParaXml('Step 1: Review the Opportunity', step1Style);
  const afterParas = after.map(t => makeParaXml(t)).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_PREAMBLE}">` +
    `<w:body>${preParas}${preTables}${step1}${afterParas}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const PREAMBLE_REMOVAL_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-007',
  description: 'CDC preamble removed from beginning of document.',
  targetField: 'struct.dght.removescaffolding',
};

describe('buildDocx — CLEAN-007: CDC preamble removal', () => {
  it('removes paragraphs before the Step 1 heading and preserves the heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePreambleDocXml({
        preamble: ['Here is the color coding for the doc: green = required', 'Editorial notes'],
        after: ['NOFO content paragraph'],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('color coding');
    expect(outXml).not.toContain('Editorial notes');
    expect(outXml).toContain('Step 1: Review the Opportunity');
    expect(outXml).toContain('NOFO content paragraph');
  });

  it('removes a table that precedes the Step 1 heading', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePreambleDocXml({
        preambleTables: ['CDC/DGHT Content Guide reference table'],
        after: ['Body content'],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('reference table');
    expect(outXml).toContain('Step 1: Review the Opportunity');
  });

  it('removes mixed paragraphs and tables before Step 1', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePreambleDocXml({
        preamble: ['Preamble paragraph'],
        preambleTables: ['Preamble table'],
        after: ['Post-Step1 content'],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('Preamble paragraph');
    expect(outXml).not.toContain('Preamble table');
    expect(outXml).toContain('Step 1: Review the Opportunity');
    expect(outXml).toContain('Post-Step1 content');
  });

  it('Step 1 heading is the first body paragraph in the output', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePreambleDocXml({
        preamble: ['Preamble A', 'Preamble B'],
        after: ['Body content'],
      })
    );

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');
    const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p')).filter(
      p => Array.from(p.getElementsByTagName('w:t')).some(t => (t.textContent ?? '').trim())
    );
    expect(paragraphs[0]?.textContent?.trim()).toBe('Step 1: Review the Opportunity');
  });

  it('detection is case-insensitive — removes preamble when Step 1 heading text is upper-cased', async () => {
    const zip = new JSZip();
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_PREAMBLE}"><w:body>` +
      makeParaXml('Preamble content') +
      makeParaXml('STEP 1: REVIEW THE OPPORTUNITY', 'Heading2') +
      makeParaXml('Body content') +
      `<w:sectPr/></w:body></w:document>`;
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('Preamble content');
    expect(outXml).toContain('STEP 1: REVIEW THE OPPORTUNITY');
  });

  it('preserves all content when Step 1 heading is not present (safety guard)', async () => {
    const zip = new JSZip();
    // Deliberately no Step 1 heading — use raw XML to avoid the helper auto-inserting it
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_PREAMBLE}"><w:body>` +
      makeParaXml('Content without any Step 1 heading') +
      `<w:sectPr/></w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [PREAMBLE_REMOVAL_CHANGE]);
    expect(outXml).toContain('Content without any Step 1 heading');
  });

  it('does not modify the document when targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePreambleDocXml({ preamble: ['Should survive'], after: ['Body'] })
    );

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('Should survive');
  });
});

// ─── applyTrailingPeriodBoldFix (CLEAN-016) ──────────────────────────────────

const W_NS_PERIOD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeTrailingPeriodDocXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_PERIOD}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const TRAILING_PERIOD_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-016',
  description: 'Bold removed from 1 trailing period.',
  targetField: 'text.trailing.period.unbold',
};

describe('buildDocx — CLEAN-016: trailing period bold removal', () => {
  it('removes w:b from the period run when the period is in its own run', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Hello world</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>.</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrailingPeriodDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [TRAILING_PERIOD_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    expect(runs).toHaveLength(2);

    const periodRun = runs[1]!;
    const rPr = Array.from(periodRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(periodRun.getElementsByTagName('w:t')[0]?.textContent).toBe('.');
  });

  it('removes w:b and w:bCs together when both are present on the period run', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Hello</w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>.</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrailingPeriodDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [TRAILING_PERIOD_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    const periodRun = runs[1]!;
    const rPr = Array.from(periodRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(rPr?.getElementsByTagName('w:bCs').length ?? 0).toBe(0);
  });

  it('splits the run when the period is attached to other bold text', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Normal</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>end.</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrailingPeriodDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [TRAILING_PERIOD_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    // Original two-run paragraph becomes three runs: "Normal", "end" (bold), "." (not bold)
    expect(runs).toHaveLength(3);

    const boldPrefixRun = runs[1]!;
    const periodRun = runs[2]!;

    const boldRpr = Array.from(boldPrefixRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(boldRpr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
    expect(boldPrefixRun.getElementsByTagName('w:t')[0]?.textContent).toBe('end');

    const periodRpr = Array.from(periodRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(periodRpr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(periodRun.getElementsByTagName('w:t')[0]?.textContent).toBe('.');
  });

  it('does not modify the document when the preceding run is also bold', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>.</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeTrailingPeriodDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [TRAILING_PERIOD_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    expect(runs).toHaveLength(2);
    const periodRun = runs[1]!;
    const rPr = Array.from(periodRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });
});

// ─── applyBoldBulletFix (CLEAN-015) ──────────────────────────────────────────

const W_NS_BULLET = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Build a minimal document.xml containing a list paragraph whose paragraph-level
 * w:pPr/w:rPr has the given bold elements, plus an optional text-run w:rPr with
 * its own bold element (to verify run-level bold is never touched).
 */
function makeBoldBulletDocXml({
  paraRprContent = '',
  runRprContent = '',
  numId = '1',
  nonListPara = '',
}: {
  paraRprContent?: string;
  runRprContent?: string;
  numId?: string;
  nonListPara?: string;
}): string {
  const paraRpr = paraRprContent ? `<w:rPr>${paraRprContent}</w:rPr>` : '';
  const runRpr = runRprContent ? `<w:rPr>${runRprContent}</w:rPr>` : '';
  const listPara =
    `<w:p>` +
    `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>${paraRpr}</w:pPr>` +
    `<w:r>${runRpr}<w:t>List item text</w:t></w:r>` +
    `</w:p>`;
  const extra = nonListPara
    ? `<w:p><w:r><w:rPr>${nonListPara}</w:rPr><w:t>Body text</w:t></w:r></w:p>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_BULLET}">` +
    `<w:body>${listPara}${extra}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const BOLD_BULLET_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-015',
  description: 'Bold removed from 1 list item bullet.',
  targetField: 'list.bullet.unbold',
};

describe('buildDocx — CLEAN-015: bold bullet removal', () => {
  it('removes w:b from paragraph-level w:pPr/w:rPr of a list paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBoldBulletDocXml({ paraRprContent: '<w:b/>' }));

    const outXml = await getOutputDocXml(zip, [], [BOLD_BULLET_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const pPr = Array.from(wP!.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:pPr'
    ) as Element | undefined;
    const pRpr = pPr
      ? (Array.from(pPr.childNodes).find(
          n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
        ) as Element | undefined)
      : undefined;

    expect(pRpr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
  });

  it('removes w:bCs from paragraph-level w:pPr/w:rPr of a list paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBoldBulletDocXml({ paraRprContent: '<w:bCs/>' }));

    const outXml = await getOutputDocXml(zip, [], [BOLD_BULLET_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const pPr = Array.from(wP!.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:pPr'
    ) as Element | undefined;
    const pRpr = pPr
      ? (Array.from(pPr.childNodes).find(
          n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
        ) as Element | undefined)
      : undefined;

    expect(pRpr?.getElementsByTagName('w:bCs').length ?? 0).toBe(0);
  });

  it('removes both w:b and w:bCs together when both are present', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeBoldBulletDocXml({ paraRprContent: '<w:b/><w:bCs/>' })
    );

    const outXml = await getOutputDocXml(zip, [], [BOLD_BULLET_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const pPr = Array.from(wP!.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:pPr'
    ) as Element | undefined;
    const pRpr = pPr
      ? (Array.from(pPr.childNodes).find(
          n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
        ) as Element | undefined)
      : undefined;

    expect(pRpr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(pRpr?.getElementsByTagName('w:bCs').length ?? 0).toBe(0);
  });

  it('preserves w:b on the text run w:rPr when paragraph-level bold is removed', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeBoldBulletDocXml({ paraRprContent: '<w:b/>', runRprContent: '<w:b/>' })
    );

    const outXml = await getOutputDocXml(zip, [], [BOLD_BULLET_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const wR = Array.from(wP!.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element | undefined;
    const runRpr = wR
      ? (Array.from(wR.childNodes).find(
          n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
        ) as Element | undefined)
      : undefined;

    expect(runRpr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });

  it('does not modify a non-list paragraph with bold text when the change is present', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeBoldBulletDocXml({ paraRprContent: '', nonListPara: '<w:b/>' })
    );

    const outXml = await getOutputDocXml(zip, [], [BOLD_BULLET_CHANGE]);
    expect(outXml).toContain('<w:b/>');
  });

  it('does not modify document.xml when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    const originalXml = makeBoldBulletDocXml({ paraRprContent: '<w:b/><w:bCs/>' });
    zip.file('word/document.xml', originalXml);

    const outXml = await getOutputDocXml(zip, [], []);
    // Bold elements survive because the fix was not triggered
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');
    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const pPr = Array.from(wP!.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:pPr'
    ) as Element | undefined;
    const pRpr = pPr
      ? (Array.from(pPr.childNodes).find(
          n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
        ) as Element | undefined)
      : undefined;

    expect(pRpr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });
});

// ─── applyPartialHyperlinkFix (LINK-009) ────────────────────────────────────

const PARTIAL_HYPERLINK_CHANGE: AutoAppliedChange = {
  ruleId: 'LINK-009',
  description: 'Partial hyperlink text corrected for 1 link.',
  targetField: 'link.partial.fix',
  value: '1',
};

const HL_INNER_RUN =
  `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>link text</w:t></w:r>`;

function makePartialHlDocXml(before: string, after: string, inner: string = HL_INNER_RUN): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body><w:p>` +
    before +
    `<w:hyperlink r:id="rId1" w:history="1">${inner}</w:hyperlink>` +
    after +
    `</w:p><w:sectPr/></w:body></w:document>`
  );
}

function directParaRuns(xml: string): Element[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');
  const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
  return Array.from(wP!.childNodes).filter(
    n => n.nodeType === 1 && (n as Element).localName === 'r'
  ) as Element[];
}

describe('buildDocx — LINK-009: partial hyperlink fix', () => {
  it('moves trailing non-ws char from preceding run into hyperlink and removes emptied run', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>(</w:t></w:r>`, ``));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('(link text');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('moves leading non-ws char from following run into hyperlink and removes emptied run', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(``, `<w:r><w:t>)</w:t></w:r>`));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text)');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('handles both leading and trailing moves on the same hyperlink', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(`<w:r><w:t>(</w:t></w:r>`, `<w:r><w:t>)</w:t></w:r>`)
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('(link text)');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('trims only trailing non-ws from preceding run, preserving whitespace remainder', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(`<w:r><w:t xml:space="preserve">Hello (</w:t></w:r>`, ``)
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('(link text');
    const remaining = directParaRuns(outXml);
    expect(remaining).toHaveLength(1);
    const text = Array.from((remaining[0] as Element).getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    expect(text).toBe('Hello ');
  });

  it('skips bookmark elements between preceding run and hyperlink and still applies fix', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(
        `<w:r><w:t>(</w:t></w:r><w:bookmarkEnd w:id="0"/>`,
        ``
      )
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('(link text');
  });

  it('does not apply fix when a non-bookmark element blocks adjacency', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(
        `<w:r><w:t>(</w:t></w:r><w:proofErr w:type="spellStart"/>`,
        ``
      )
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
  });

  it('inserts the moved run with w:rStyle w:val="Hyperlink" for correct rendering', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>(</w:t></w:r>`, ``));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    const hl = hyperlinks.find(el => el.getAttributeNS(R_NS, 'id') === 'rId1')!;
    const runs = Array.from(hl.children).filter(c => c.localName === 'r');
    const insertedRun = runs[0]!;
    const rPr = Array.from(insertedRun.children).find(c => c.localName === 'rPr');
    const rStyle = rPr ? Array.from(rPr.children).find(c => c.localName === 'rStyle') : undefined;
    expect(rStyle?.getAttributeNS(W_NS, 'val')).toBe('Hyperlink');
  });

  it('does not modify the document when autoAppliedChanges does not include LINK-009', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>(</w:t></w:r>`, ``));

    const outXml = await getOutputDocXml(zip, [], []);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
    expect(directParaRuns(outXml)).toHaveLength(1);
  });
});

// ─── applyEmailMailtoFixes (LINK-008) ────────────────────────────────────────

function makeEmailDocXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

function makeEmptyRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${RELS_NS}"></Relationships>`
  );
}

function makeEmailChange(email: string): AutoAppliedChange {
  return {
    ruleId: 'LINK-008',
    description: `Email address converted to a mailto: link — ${email}`,
    targetField: 'email.mailto',
    value: email,
  };
}

describe('buildDocx — LINK-008: email mailto conversion', () => {
  it('wraps a plain-text email run in a w:hyperlink element', async () => {
    const email = 'user@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(1);

    const hlText = Array.from(hyperlinks[0]!.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    expect(hlText).toBe(email);

    // No direct w:r children on the paragraph — run was moved inside hyperlink
    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const directRuns = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).localName === 'r'
    );
    expect(directRuns).toHaveLength(0);
  });

  it('adds a Relationship entry with correct Type, Target, and TargetMode to rels', async () => {
    const email = 'contact@example.org';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
    const rels = Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'));

    expect(rels).toHaveLength(1);
    expect(rels[0]!.getAttribute('Type')).toBe(HYPERLINK_TYPE_URI);
    expect(rels[0]!.getAttribute('Target')).toBe(`mailto:${email}`);
    expect(rels[0]!.getAttribute('TargetMode')).toBe('External');
  });

  it('r:id on the new hyperlink element matches the Relationship Id in rels', async () => {
    const email = 'match@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');

    const hl = xmlDoc.getElementsByTagName('w:hyperlink')[0]!;
    const relId = hl.getAttributeNS(R_NS, 'id');
    expect(relId).toBeTruthy();

    const rels = Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'));
    const matchingRel = rels.find(r => r.getAttribute('Id') === relId);
    expect(matchingRel).toBeDefined();
    expect(matchingRel!.getAttribute('Target')).toBe(`mailto:${email}`);
  });

  it('adds w:rStyle w:val="Hyperlink" to the run inside the new hyperlink', async () => {
    const email = 'style@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const hl = xmlDoc.getElementsByTagName('w:hyperlink')[0]!;
    const run = Array.from(hl.children).find(c => c.localName === 'r')!;
    const rPr = Array.from(run.children).find(c => c.localName === 'rPr');
    const rStyle = rPr ? Array.from(rPr.children).find(c => c.localName === 'rStyle') : undefined;
    expect(rStyle?.getAttributeNS(W_NS, 'val')).toBe('Hyperlink');
  });

  it('does not double-wrap a run already inside a w:hyperlink', async () => {
    const email = 'already@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p>` +
      `<w:hyperlink r:id="rId1" w:history="1">` +
      `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${email}</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makePdfRelsXml(
      'rId1', `mailto:${email}`, 'External', HYPERLINK_TYPE_URI
    ));

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    // Still exactly one hyperlink — no double-wrapping
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(1);

    // The hyperlink's parent is the paragraph, not another hyperlink
    expect(hyperlinks[0]!.parentElement?.localName).not.toBe('hyperlink');
  });

  it('allocates a new rId that does not collide with existing relationships', async () => {
    const email = 'new@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    // Pre-existing relationships occupy rId1 and rId2
    zip.file('word/_rels/document.xml.rels', (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${RELS_NS}">` +
      `<Relationship Id="rId1" Type="${HYPERLINK_TYPE_URI}" Target="https://example.com" TargetMode="External"/>` +
      `<Relationship Id="rId2" Type="${HYPERLINK_TYPE_URI}" Target="https://other.com" TargetMode="External"/>` +
      `</Relationships>`
    ));

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');

    // The new email hyperlink is the last one in document order
    const emailHl = Array.from(xmlDoc.getElementsByTagName('w:hyperlink')).find(
      h => Array.from(h.getElementsByTagName('w:t')).some(t => t.textContent === email)
    )!;
    const newRelId = emailHl.getAttributeNS(R_NS, 'id')!;

    // Must not be rId1 or rId2
    expect(newRelId).not.toBe('rId1');
    expect(newRelId).not.toBe('rId2');

    // The rels file must contain a matching entry
    const rels = Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'));
    const newRel = rels.find(r => r.getAttribute('Id') === newRelId);
    expect(newRel?.getAttribute('Target')).toBe(`mailto:${email}`);
  });

  it('converts an email embedded in a longer text run by splitting the run at the email boundary', async () => {
    const email = 'embedded@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t xml:space="preserve">Contact ${email} for help</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [makeEmailChange(email)]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    // Email must now be inside a w:hyperlink
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(1);
    const hlText = Array.from(hyperlinks[0]!.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    expect(hlText).toBe(email);

    // The paragraph should have three children: before run, hyperlink, after run
    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const children = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1
    ) as Element[];
    expect(children).toHaveLength(3);
    expect(children[0]!.localName).toBe('r');
    expect(children[1]!.localName).toBe('hyperlink');
    expect(children[2]!.localName).toBe('r');

    const beforeText = Array.from((children[0] as Element).getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '').join('');
    const afterText = Array.from((children[2] as Element).getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '').join('');
    expect(beforeText).toBe('Contact ');
    expect(afterText).toBe(' for help');
  });

  it('does not modify the document when autoAppliedChanges does not include LINK-008', async () => {
    const email = 'noop@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], []);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    expect(parser.parseFromString(docXml, 'application/xml').getElementsByTagName('w:hyperlink'))
      .toHaveLength(0);
    expect(parser.parseFromString(relsXml, 'application/xml')
      .getElementsByTagNameNS(RELS_NS, 'Relationship'))
      .toHaveLength(0);
  });

  it('converts two different email addresses in separate runs — both get hyperlinked with distinct rels entries', async () => {
    const email1 = 'alice@example.com';
    const email2 = 'bob@example.org';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email1}</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>${email2}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [
      makeEmailChange(email1),
      makeEmailChange(email2),
    ]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');

    // Both paragraphs should have a hyperlink
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(2);

    const hlTexts = hyperlinks.map(hl =>
      Array.from(hl.getElementsByTagName('w:t')).map(t => t.textContent ?? '').join('')
    );
    expect(hlTexts).toContain(email1);
    expect(hlTexts).toContain(email2);

    // Two separate rels entries, one per email
    const rels = Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'));
    expect(rels).toHaveLength(2);
    const targets = rels.map(r => r.getAttribute('Target') ?? '');
    expect(targets).toContain(`mailto:${email1}`);
    expect(targets).toContain(`mailto:${email2}`);
  });

  it('converts both occurrences of the same email address appearing in different paragraphs', async () => {
    const email = 'repeat@example.com';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>${email}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    // Rule emits one change per occurrence — two changes for two occurrences
    const outZip = await getOutputZip(zip, [], [
      makeEmailChange(email),
      makeEmailChange(email),
    ]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');

    // Both runs should be wrapped — two hyperlinks in the document
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(2);

    // Both hyperlinks should carry the same email text
    for (const hl of hyperlinks) {
      const text = Array.from(hl.getElementsByTagName('w:t'))
        .map(t => t.textContent ?? '').join('');
      expect(text).toBe(email);
    }

    // Only ONE relationship entry is needed for the same email
    const rels = Array.from(relsDoc.getElementsByTagNameNS(RELS_NS, 'Relationship'));
    expect(rels).toHaveLength(1);
    expect(rels[0]!.getAttribute('Target')).toBe(`mailto:${email}`);

    // Both hyperlinks reference the same rId
    const relId = rels[0]!.getAttribute('Id');
    for (const hl of hyperlinks) {
      expect(hl.getAttributeNS(R_NS, 'id')).toBe(relId);
    }
  });

  it('converts two different emails embedded in the same text run — both get hyperlinked', async () => {
    const email1 = 'first@example.com';
    const email2 = 'second@example.org';
    const zip = new JSZip();
    zip.file('word/document.xml', makeEmailDocXml(
      `<w:p><w:r><w:t xml:space="preserve">${email1} or ${email2}</w:t></w:r></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', makeEmptyRelsXml());

    const outZip = await getOutputZip(zip, [], [
      makeEmailChange(email1),
      makeEmailChange(email2),
    ]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(2);

    const hlTexts = hyperlinks.map(hl =>
      Array.from(hl.getElementsByTagName('w:t')).map(t => t.textContent ?? '').join('')
    );
    expect(hlTexts).toContain(email1);
    expect(hlTexts).toContain(email2);
  });
});

// ─── TABLE-004: applyImportantPublicHeadingFix ────────────────────────────────

const W_NS_T4 = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TABLE_004_CHANGE: AutoAppliedChange = {
  ruleId: 'TABLE-004',
  description: 'Heading style applied to "Important: public information" in 1 table.',
  targetField: 'table.importantpublic.heading',
  value: '1',
};

function makeT4DocXml(bodyInner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_T4}">` +
    `<w:body>${bodyInner}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

function t4HeadingPara(level: number): string {
  return (
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
    `<w:r><w:t>Section heading</w:t></w:r>` +
    `</w:p>`
  );
}

function t4SingleCellTable(firstParaText: string, extraParas = 1): string {
  const extras = Array.from({ length: extraParas }, () =>
    `<w:p><w:r><w:t>Body text.</w:t></w:r></w:p>`
  ).join('');
  return (
    `<w:tbl><w:tr><w:tc>` +
    `<w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p>` +
    extras +
    `</w:tc></w:tr></w:tbl>`
  );
}

function t4MultiCellTable(firstParaText: string): string {
  return (
    `<w:tbl><w:tr>` +
    `<w:tc><w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t>Cell 2</w:t></w:r></w:p></w:tc>` +
    `</w:tr></w:tbl>`
  );
}

async function t4GetFirstParaStyle(docXml: string): Promise<string | null> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, 'application/xml');
  const tbl = xmlDoc.getElementsByTagName('w:tbl')[0];
  if (!tbl) return null;
  const tc = tbl.getElementsByTagName('w:tc')[0];
  if (!tc) return null;
  const firstPara = Array.from(tc.childNodes).find(
    n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'p'
  ) as Element | undefined;
  if (!firstPara) return null;
  const pStyle = firstPara.getElementsByTagName('w:pStyle')[0];
  return pStyle ? pStyle.getAttribute('w:val') : null;
}

describe('buildDocx — TABLE-004: important public information heading fix', () => {
  it('applies heading style matching nearest preceding heading level', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      t4SingleCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading3');
  });

  it('defaults to Heading5 when no preceding heading exists', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4SingleCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading5');
  });

  it('picks the nearest preceding heading when multiple precede the table', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(2) +
      `<w:p><w:r><w:t>Intro paragraph.</w:t></w:r></w:p>` +
      t4HeadingPara(4) +
      t4SingleCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading4');
  });

  it('is case-insensitive — applies style for "IMPORTANT: PUBLIC INFORMATION"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(2) +
      t4SingleCellTable('IMPORTANT: PUBLIC INFORMATION')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading2');
  });

  it('does not modify a table whose first paragraph has no body content', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      t4SingleCellTable('Important: public information', 0)
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBeNull();
  });

  it('does not modify a multi-cell table even if first cell text matches', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      t4MultiCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const firstPara = Array.from(
      xmlDoc.getElementsByTagName('w:tc')[0]!.childNodes
    ).find(
      n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'p'
    ) as Element | undefined;
    const pStyle = firstPara?.getElementsByTagName('w:pStyle')[0];
    expect(pStyle).toBeUndefined();
  });

  it('does not modify a table with non-matching first paragraph text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      t4SingleCellTable('Note: This is informational only')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBeNull();
  });

  it('does not modify anything when TABLE-004 change is absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      t4SingleCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], []);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBeNull();
  });

  it('preserves existing w:pPr children when adding w:pStyle', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(3) +
      `<w:tbl><w:tr><w:tc>` +
      `<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t>Important: public information</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Body text.</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');
    const tc = xmlDoc.getElementsByTagName('w:tc')[0]!;
    const firstPara = Array.from(tc.childNodes).find(
      n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'p'
    ) as Element;
    const pPr = Array.from(firstPara.childNodes).find(
      n => n.nodeType === Node.ELEMENT_NODE && (n as Element).localName === 'pPr'
    ) as Element;
    expect(pPr.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val')).toBe('Heading3');
    expect(pPr.getElementsByTagName('w:ind')[0]).toBeTruthy();
  });

  it('preserves spaced style ID format "Heading 3" from preceding heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      `<w:p><w:pPr><w:pStyle w:val="Heading 3"/></w:pPr><w:r><w:t>Section</w:t></w:r></w:p>` +
      t4SingleCellTable('Important: public information')
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading 3');
  });

  it('applies fix to outer single-cell table even when the cell contains a nested table', async () => {
    const nestedTable =
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeT4DocXml(
      t4HeadingPara(2) +
      `<w:tbl><w:tr><w:tc>` +
      `<w:p><w:r><w:t>Important: public information</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Body text.</w:t></w:r></w:p>` +
      nestedTable +
      `</w:tc></w:tr></w:tbl>`
    ));
    const docXml = await getOutputDocXml(zip, [], [TABLE_004_CHANGE]);
    const style = await t4GetFirstParaStyle(docXml);
    expect(style).toBe('Heading2');
  });
});

// ─── ZIP compression (iOS compatibility) ─────────────────────────────────────

/**
 * Walk the ZIP central directory and return a map of filename → compression
 * method code (0 = STORE, 8 = DEFLATE).  We read the central directory rather
 * than local file headers so we get the correct sizes even when JSZip uses
 * data descriptors (flag bit 3 set) for on-the-fly DEFLATE streams.
 */
function parseZipCompressions(buffer: ArrayBuffer): Map<string, number> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const result = new Map<string, number>();

  // Locate EOCD: scan backwards for signature 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (
      bytes[i]     === 0x50 && bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return result;

  const cdTotalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset       = view.getUint32(eocdOffset + 16, true);

  let i = cdOffset;
  for (let e = 0; e < cdTotalEntries; e++) {
    if (i + 46 > bytes.length) break;
    // Central directory file header signature 0x02014b50
    if (!(bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x01 && bytes[i+3] === 0x02)) break;

    const compressionMethod = view.getUint16(i + 10, true);
    const fileNameLength    = view.getUint16(i + 28, true);
    const extraFieldLength  = view.getUint16(i + 30, true);
    const fileCommentLength = view.getUint16(i + 32, true);

    const fileName = new TextDecoder('utf-8').decode(bytes.slice(i + 46, i + 46 + fileNameLength));
    result.set(fileName, compressionMethod);

    i += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }
  return result;
}

describe('buildDocx — ZIP compression settings (iOS compatibility)', () => {
  it('stores [Content_Types].xml and word/_rels/document.xml.rels with STORE, document.xml with DEFLATE', async () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const zip = new JSZip();

    // document.xml with a content control so applyRemoveContentControls rewrites it.
    // Repeated padding ensures DEFLATE can actually compress the content.
    const padding = `<w:p><w:r><w:t>padding paragraph</w:t></w:r></w:p>`.repeat(40);
    zip.file('word/document.xml', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<w:document xmlns:w="${W}"><w:body>`,
      `<w:sdt><w:sdtContent><w:p><w:r><w:t>sdt content</w:t></w:r></w:p></w:sdtContent></w:sdt>`,
      padding,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));

    // [Content_Types].xml with a /word/comments.xml override so
    // applyAcceptTrackedChangesAndRemoveComments removes it and rewrites the file.
    zip.file('[Content_Types].xml', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`,
      `</Types>`,
    ].join(''));

    // word/_rels/document.xml.rels — applyEmailMailtoFixes always rewrites this
    // when given an email address, even when the rels file has no prior mailto entries.
    zip.file('word/_rels/document.xml.rels', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    ].join(''));

    // word/comments.xml must exist so the accept-changes cleanup can remove it
    zip.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}"/>`);

    const autoAppliedChanges: AutoAppliedChange[] = [
      // Triggers applyEmailMailtoFixes → always rewrites word/_rels/document.xml.rels
      { ruleId: 'LINK-008', description: 'email fix', targetField: 'email.mailto', value: 'contact@example.com' },
      // Triggers applyAcceptTrackedChangesAndRemoveComments → rewrites [Content_Types].xml
      { ruleId: 'CLEAN-008', description: 'accept changes', targetField: 'doc.acceptchanges' },
    ];

    const blob = await buildDocx(zip, [], autoAppliedChanges);
    const buffer = await blob.arrayBuffer();
    const compressions = parseZipCompressions(buffer);

    // Infrastructure files must use STORE (method 0) for Word for iOS compatibility
    expect(compressions.get('[Content_Types].xml'),         '[Content_Types].xml must be STORE').toBe(0);
    expect(compressions.get('word/_rels/document.xml.rels'), 'rels must be STORE').toBe(0);

    // Content XML parts must use DEFLATE (method 8)
    expect(compressions.get('word/document.xml'), 'document.xml must be DEFLATE').toBe(8);
  });

  it('keeps [Content_Types].xml and .rels as STORE even when no fix path rewrites them', async () => {
    // This test covers the regression identified in review: the global DEFLATE
    // in generateAsync would re-compress infrastructure files that were loaded
    // from the original archive but never touched by any conditional fix path.
    // The unconditional enforcement loop before generateAsync prevents that.
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const zip = new JSZip();

    // Minimal document — no content controls, so applyRemoveContentControls is a no-op.
    zip.file('word/document.xml', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<w:document xmlns:w="${W}"><w:body>`,
      `${'<w:p><w:r><w:t>plain paragraph</w:t></w:r></w:p>'.repeat(40)}`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));

    // Infrastructure files — no auto-applied change will touch them.
    zip.file('[Content_Types].xml', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
      `</Types>`,
    ].join(''));
    zip.file('_rels/.rels', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`,
      `</Relationships>`,
    ].join(''));
    zip.file('word/_rels/document.xml.rels', [
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    ].join(''));

    // No accepted fixes, no auto-applied changes — none of the conditional
    // code paths that previously wrote these files with { compression: 'STORE' }
    // will run.
    const blob = await buildDocx(zip, [], []);
    const buffer = await blob.arrayBuffer();
    const compressions = parseZipCompressions(buffer);

    expect(compressions.get('[Content_Types].xml'),          '[Content_Types].xml must be STORE').toBe(0);
    expect(compressions.get('_rels/.rels'),                   '_rels/.rels must be STORE').toBe(0);
    expect(compressions.get('word/_rels/document.xml.rels'),  'word/_rels/document.xml.rels must be STORE').toBe(0);
  });
});

// ─── ZIP round-trip integrity ─────────────────────────────────────────────────
//
// These tests cover the investigations requested in the iOS Word compatibility
// report: zero-change round-trip file preservation, binary file integrity,
// word/settings.xml passthrough, and XML namespace validity after LINK-006.

const W_OOXML = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_OOXML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Minimal but structurally complete docx-like ZIP fixture. */
async function makeFullDocxZip(opts: {
  documentXml?: string;
  includeImage?: boolean;
} = {}): Promise<JSZip> {
  const zip = new JSZip();

  const documentXml = opts.documentXml ?? [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<w:document`,
    ` xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"`,
    ` xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"`,
    ` xmlns:r="${R_OOXML}"`,
    ` xmlns:w="${W_OOXML}"`,
    ` xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"`,
    ` xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"`,
    ` mc:Ignorable="w14 w15"`,
    `>`,
    `<w:body>`,
    `<w:p>`,
    `<w:hyperlink w:anchor="_bookmark1" r:id="" w:history="1">`,
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>See section</w:t></w:r>`,
    `</w:hyperlink>`,
    `</w:p>`,
    `<w:p><w:r><w:t>Body paragraph text.</w:t></w:r></w:p>`,
    `<w:sectPr/>`,
    `</w:body></w:document>`,
  ].join('');

  zip.file('word/document.xml', documentXml);

  zip.file('[Content_Types].xml', [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`,
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`,
    `</Types>`,
  ].join(''));

  zip.file('_rels/.rels', [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`,
    `</Relationships>`,
  ].join(''));

  zip.file('word/_rels/document.xml.rels', [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    `</Relationships>`,
  ].join(''));

  // Realistic word/settings.xml with compatibilityMode (the element Word checks
  // to determine whether a document is from a pre-release version).
  zip.file('word/settings.xml', [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<w:settings xmlns:w="${W_OOXML}">`,
    `<w:compat>`,
    `<w:compatibilityMode w:val="15"/>`,
    `</w:compat>`,
    `</w:settings>`,
  ].join(''));

  zip.file('word/styles.xml', [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<w:styles xmlns:w="${W_OOXML}">`,
    `<w:style w:type="character" w:styleId="Hyperlink">`,
    `<w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>`,
    `</w:style>`,
    `</w:styles>`,
  ].join(''));

  if (opts.includeImage) {
    // Fake PNG — 1×1 pixel minimal valid PNG (89 bytes), stored as binary.
    const pngBytes = new Uint8Array([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, // PNG signature
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52, // IHDR length + type
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // width=1, height=1
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53, // bitDepth=8,colorType=2,crc...
      0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41, // IDAT length + type
      0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00, // compressed pixel
      0x00,0x00,0x02,0x00,0x01,0xe2,0x21,0xbc, // crc
      0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4e, // IEND length + type
      0x44,0xae,0x42,0x60,0x82,               // IEND crc
    ]);
    zip.file('word/media/image1.png', pngBytes.buffer);
  }

  return zip;
}

describe('buildDocx — ZIP round-trip integrity', () => {
  // ── 1. Zero-change round-trip: all files preserved ─────────────────────────

  it('zero-change round-trip: all input files are present in the output', async () => {
    const zip = await makeFullDocxZip({ includeImage: true });
    const inputFiles = new Set(Object.keys(zip.files).filter(k => !zip.files[k]!.dir));

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputFiles = new Set(Object.keys(outZip.files).filter(k => !outZip.files[k]!.dir));

    for (const path of inputFiles) {
      expect(outputFiles.has(path), `Missing from output: ${path}`).toBe(true);
    }
  });

  it('zero-change round-trip: no extra files are added to the output', async () => {
    const zip = await makeFullDocxZip({ includeImage: true });
    const inputFiles = new Set(Object.keys(zip.files).filter(k => !zip.files[k]!.dir));

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputFiles = new Set(Object.keys(outZip.files).filter(k => !outZip.files[k]!.dir));

    for (const path of outputFiles) {
      expect(inputFiles.has(path), `Unexpected file added to output: ${path}`).toBe(true);
    }
  });

  // ── 2. word/settings.xml passes through unmodified ─────────────────────────

  it('word/settings.xml content is identical before and after buildDocx', async () => {
    const zip = await makeFullDocxZip();
    const originalSettings = await zip.file('word/settings.xml')!.async('string');

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);

    const outputSettingsFile = outZip.file('word/settings.xml');
    expect(outputSettingsFile, 'word/settings.xml must be present in output').not.toBeNull();

    const outputSettings = await outputSettingsFile!.async('string');
    expect(outputSettings).toBe(originalSettings);
  });

  it('word/settings.xml contains compatibilityMode w:val="15" after round-trip', async () => {
    const zip = await makeFullDocxZip();
    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const settings = await outZip.file('word/settings.xml')!.async('string');

    // Verify the compatibilityMode value survives unchanged — if this is
    // modified or stripped, Word reports "pre-release version of Word 2007".
    expect(settings).toContain('w:compatibilityMode');
    expect(settings).toContain('w:val="15"');
    expect(settings).not.toContain('w:val="11"');
    expect(settings).not.toContain('w:val="12"');
  });

  // ── 3. Binary file integrity ───────────────────────────────────────────────

  it('binary image file bytes are identical before and after buildDocx', async () => {
    const zip = await makeFullDocxZip({ includeImage: true });
    const originalBytes = new Uint8Array(await zip.file('word/media/image1.png')!.async('arraybuffer'));

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);

    const outImageFile = outZip.file('word/media/image1.png');
    expect(outImageFile, 'word/media/image1.png must be present in output').not.toBeNull();

    const outputBytes = new Uint8Array(await outImageFile!.async('arraybuffer'));
    expect(outputBytes.length).toBe(originalBytes.length);
    for (let i = 0; i < originalBytes.length; i++) {
      expect(outputBytes[i], `Byte mismatch at index ${i}`).toBe(originalBytes[i]);
    }
  });

  // ── 4. word/document.xml is well-formed XML after LINK-006 ─────────────────

  it('LINK-006 bookmark retarget produces well-formed XML (no DOMParser error)', async () => {
    const zip = await makeFullDocxZip();

    const fix: AcceptedFix = {
      issueId: 'LINK-006-0',
      ruleId: 'LINK-006',
      targetField: 'link.bookmark._bookmark1',
      value: '_corrected_bookmark',
    };

    const blob = await buildDocx(zip, [fix], []);
    const outZip = await JSZip.loadAsync(blob);
    const xml = await outZip.file('word/document.xml')!.async('string');

    // DOMParser signals a parse error by returning a document whose root
    // element is <parsererror> — not <w:document>.
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const rootTag = doc.documentElement.tagName;
    expect(rootTag, `DOMParser returned ${rootTag} — XML is malformed`).not.toBe('parsererror');
    expect(rootTag).toBe('w:document');
  });

  it('LINK-006 bookmark retarget produces no xmlns:w="" namespace undeclaration', async () => {
    const zip = await makeFullDocxZip();

    const fix: AcceptedFix = {
      issueId: 'LINK-006-0',
      ruleId: 'LINK-006',
      targetField: 'link.bookmark._bookmark1',
      value: '_corrected_bookmark',
    };

    const blob = await buildDocx(zip, [fix], []);
    const outZip = await JSZip.loadAsync(blob);
    const xml = await outZip.file('word/document.xml')!.async('string');

    // xmlns:w="" on any element would undeclare the w: prefix for that subtree,
    // making every w:* child element unrecognized — causing Word for iOS to
    // report "unreadable content" / "pre-release Word 2007".
    expect(xml).not.toContain('xmlns:w=""');
    expect(xml).not.toContain("xmlns:w=''");
  });

  it('LINK-006 bookmark retarget updates the w:anchor value correctly', async () => {
    const zip = await makeFullDocxZip();

    const fix: AcceptedFix = {
      issueId: 'LINK-006-0',
      ruleId: 'LINK-006',
      targetField: 'link.bookmark._bookmark1',
      value: '_corrected_bookmark',
    };

    const blob = await buildDocx(zip, [fix], []);
    const outZip = await JSZip.loadAsync(blob);
    const xml = await outZip.file('word/document.xml')!.async('string');

    expect(xml).toContain('w:anchor="_corrected_bookmark"');
    expect(xml).not.toContain('w:anchor="_bookmark1"');
  });

  it('LINK-006 link-text update produces no xmlns:w="" namespace undeclaration', async () => {
    const zip = await makeFullDocxZip();

    const fix: AcceptedFix = {
      issueId: 'LINK-006-1',
      ruleId: 'LINK-006',
      targetField: 'link.text._bookmark1',
      value: 'Updated link text',
    };

    const blob = await buildDocx(zip, [fix], []);
    const outZip = await JSZip.loadAsync(blob);
    const xml = await outZip.file('word/document.xml')!.async('string');

    expect(xml).not.toContain('xmlns:w=""');
    expect(xml).not.toContain("xmlns:w=''");
  });

  // ── 5. Namespace declarations in document root are preserved ────────────────

  it('all namespace declarations on the document root are present after round-trip', async () => {
    // A realistic OOXML document declares many namespaces on the root element.
    // If the serializer drops any that are referenced in attributes or elements
    // deeper in the document, Word will report unresolvable prefixes.
    const zip = await makeFullDocxZip();
    const originalXml = await zip.file('word/document.xml')!.async('string');

    // Extract all xmlns:* declarations from the original root open tag.
    const rootTag = originalXml.match(/<w:document[^>]*>/)?.[0] ?? '';
    const nsDeclPattern = /xmlns:[a-zA-Z0-9]+=["'][^"']*["']/g;
    const originalDecls = rootTag.match(nsDeclPattern) ?? [];

    // Apply a fix that rewrites document.xml so the serializer runs.
    const fix: AcceptedFix = {
      issueId: 'LINK-006-0',
      ruleId: 'LINK-006',
      targetField: 'link.bookmark._bookmark1',
      value: '_corrected_bookmark',
    };
    const blob = await buildDocx(zip, [fix], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputXml = await outZip.file('word/document.xml')!.async('string');

    for (const decl of originalDecls) {
      // Extract just the prefix name (e.g. "xmlns:w") for the error message.
      const prefix = decl.split('=')[0]!;
      expect(outputXml, `${prefix} declaration missing from output`).toContain(decl);
    }
  });

  // ── 6. [Content_Types].xml has correct entries after round-trip ─────────────

  it('[Content_Types].xml preserves all Override entries after zero-change round-trip', async () => {
    const zip = await makeFullDocxZip();
    const originalCT = await zip.file('[Content_Types].xml')!.async('string');

    // Extract all PartName values from the original.
    const partNames = [...originalCT.matchAll(/PartName="([^"]+)"/g)].map(m => m[1]!);
    expect(partNames.length).toBeGreaterThan(0);

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputCT = await outZip.file('[Content_Types].xml')!.async('string');

    for (const part of partNames) {
      expect(outputCT, `PartName "${part}" missing from [Content_Types].xml`).toContain(part);
    }
  });

  // ── 7. word/_rels/document.xml.rels has correct entries ─────────────────────

  it('word/_rels/document.xml.rels preserves all relationships after zero-change round-trip', async () => {
    const zip = await makeFullDocxZip();
    const originalRels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    const relIds = [...originalRels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]!);

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputRels = await outZip.file('word/_rels/document.xml.rels')!.async('string');

    for (const id of relIds) {
      expect(outputRels, `Relationship Id="${id}" missing from document.xml.rels`).toContain(`Id="${id}"`);
    }
  });
});
