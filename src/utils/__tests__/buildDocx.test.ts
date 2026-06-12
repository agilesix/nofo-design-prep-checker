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

  it('updates Target="#old_name" in _rels/document.xml.rels for r:id-based internal links', async () => {
    // Real Word documents often store internal hyperlinks as r:id relationships
    // (Target="#bookmark_name") rather than w:anchor attributes.  When CLEAN-008
    // renames a bookmark, the .rels Target must also be updated or those links
    // silently break in the downloaded file.
    const RELS_NS_CLEAN008 = 'http://schemas.openxmlformats.org/package/2006/relationships';
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
      // r:id-based hyperlink (no w:anchor attribute)
      `<w:p><w:hyperlink r:id="rId5" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>link text</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${RELS_NS_CLEAN008}">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      // Internal anchor relationship — target must be updated from _Contacts_and_Support → Contacts_and_Support
      `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#_Contacts_and_Support"/>` +
      `</Relationships>`
    );

    const blob = await buildDocx(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const outZip = await JSZip.loadAsync(blob);

    // Verify .rels Target was updated
    const relsFile = outZip.file('word/_rels/document.xml.rels');
    expect(relsFile).not.toBeNull();
    const relsXml = await relsFile!.async('string');
    expect(relsXml).toContain('Target="#Contacts_and_Support"');
    expect(relsXml).not.toContain('Target="#_Contacts_and_Support"');
    // Unrelated relationship must be preserved
    expect(relsXml).toContain('Target="styles.xml"');
  });

  it('does not modify .rels entries that do not match the renamed bookmark', async () => {
    // Other .rels entries (external links, non-anchor targets) must be untouched.
    const RELS_NS_CLEAN008 = 'http://schemas.openxmlformats.org/package/2006/relationships';
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
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${RELS_NS_CLEAN008}">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#Overview"/>` +
      `</Relationships>`
    );

    const blob = await buildDocx(zip, [], [HEADING_LEADING_SPACE_CHANGE]);
    const outZip = await JSZip.loadAsync(blob);

    const relsFile = outZip.file('word/_rels/document.xml.rels');
    expect(relsFile).not.toBeNull();
    const relsXml = await relsFile!.async('string');
    // External link is untouched
    expect(relsXml).toContain('Target="https://example.com"');
    // Unrelated internal link is also untouched
    expect(relsXml).toContain('Target="#Overview"');
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

  // ── Table-level tracked change records (newly added) ─────────────────────

  it('removes w:tblGridChange and preserves surrounding tblGrid content', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:tbl>' +
        '<w:tblPr/>' +
        '<w:tblGrid>' +
        '<w:gridCol w:w="3000"/>' +
        '<w:tblGridChange w:id="5">' +
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
        '</w:tblGridChange>' +
        '</w:tblGrid>' +
        '<w:tr><w:tc><w:p><w:r><w:t>cell text</w:t></w:r></w:p></w:tc></w:tr>' +
        '</w:tbl>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    // The tracked-change record must be gone
    expect(outXml).not.toContain('tblGridChange');
    // The current grid column and cell content must remain
    expect(outXml).toContain('w:gridCol');
    expect(outXml).toContain('cell text');
  });

  it('removes w:tcPrChange and preserves remaining cell properties', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:tbl><w:tblPr/><w:tr>' +
        '<w:tc>' +
        '<w:tcPr>' +
        '<w:tcW w:w="2000" w:type="dxa"/>' +
        '<w:tcPrChange w:id="6" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr>' +
        '</w:tcPrChange>' +
        '</w:tcPr>' +
        '<w:p><w:r><w:t>cell</w:t></w:r></w:p>' +
        '</w:tc>' +
        '</w:tr></w:tbl>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('tcPrChange');
    // Current cell width (2000) must remain; old width (1800) is inside the removed element
    expect(outXml).toContain('w:w="2000"');
    expect(outXml).not.toContain('w:w="1800"');
    expect(outXml).toContain('cell');
  });

  it('removes w:trPrChange and preserves remaining row properties', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeTrackedChangeDocXml(
        '<w:tbl><w:tblPr/><w:tr>' +
        '<w:trPr>' +
        '<w:trHeight w:val="400"/>' +
        '<w:trPrChange w:id="7" w:author="User" w:date="2024-01-01T00:00:00Z">' +
        '<w:trPr><w:trHeight w:val="300"/></w:trPr>' +
        '</w:trPrChange>' +
        '</w:trPr>' +
        '<w:tc><w:p><w:r><w:t>row cell</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>'
      )
    );

    const outXml = await getOutputDocXml(zip, [], [ACCEPT_CHANGES]);
    expect(outXml).not.toContain('trPrChange');
    // Current row height (400) must remain; old height (300) is inside the removed element
    expect(outXml).toContain('w:val="400"');
    expect(outXml).not.toContain('w:val="300"');
    expect(outXml).toContain('row cell');
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

// ─── applyFootnoteToEndnoteFix (NOTE-001) ────────────────────────────────────

const W_NS_NOTE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELS_NS_NOTE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES_NS_NOTE = 'http://schemas.openxmlformats.org/package/2006/content-types';
const ENDNOTES_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes';
const ENDNOTES_CT =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml';

/** Minimal document.xml whose body contains footnote and/or endnote references. */
function makeNoteDocXml(refs: Array<{ kind: 'footnote' | 'endnote'; id: number }>): string {
  const runs = refs
    .map(({ kind, id }) => {
      const tag = kind === 'footnote' ? 'w:footnoteReference' : 'w:endnoteReference';
      return `<w:r><${tag} w:id="${id}"/></w:r>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_NOTE}">` +
    `<w:body><w:p><w:r><w:t>Body.</w:t></w:r>${runs}</w:p><w:sectPr/></w:body>` +
    `</w:document>`
  );
}

/** Minimal footnotes.xml with separator entries and optional user-authored notes. */
function makeFootnotesXml(notes: Array<{ id: number; text: string }> = []): string {
  const seps =
    `<w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p/></w:footnote>`;
  const userNotes = notes
    .map(({ id, text }) => `<w:footnote w:id="${id}"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:footnote>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:footnotes xmlns:w="${W_NS_NOTE}">${seps}${userNotes}</w:footnotes>`
  );
}

/** Minimal endnotes.xml with separator entries and optional user-authored notes. */
function makeEndnotesXml(notes: Array<{ id: number; text: string }> = []): string {
  const seps =
    `<w:endnote w:type="separator" w:id="-1"><w:p/></w:endnote>` +
    `<w:endnote w:type="continuationSeparator" w:id="0"><w:p/></w:endnote>`;
  const userNotes = notes
    .map(({ id, text }) => `<w:endnote w:id="${id}"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:endnote>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:endnotes xmlns:w="${W_NS_NOTE}">${seps}${userNotes}</w:endnotes>`
  );
}

/** Minimal word/_rels/document.xml.rels with a footnotes relationship. */
function makeDocRels(extraEntries: string[] = []): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${RELS_NS_NOTE}">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` +
    extraEntries.join('') +
    `</Relationships>`
  );
}

/** Minimal [Content_Types].xml with a document and footnotes override. */
function makeContentTypes(extraOverrides: string[] = []): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${TYPES_NS_NOTE}">` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` +
    extraOverrides.join('') +
    `</Types>`
  );
}

const NOTE_001_CHANGE: AutoAppliedChange = {
  ruleId: 'NOTE-001',
  description: '1 footnote converted to 1 endnote and renumbered sequentially.',
  targetField: 'note.footnote-to-endnote',
  value: '1',
};

describe('buildDocx — NOTE-001: footnote-to-endnote conversion', () => {
  it('replaces w:footnoteReference with w:endnoteReference in the body', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Footnote one.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    expect(docXml).not.toContain('w:footnoteReference');
    expect(docXml).toContain('w:endnoteReference');
    expect(docXml).toContain('w:id="1"');
  });

  it('assigns sequential IDs to multiple footnotes in body reading order', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([
      { kind: 'footnote', id: 3 },
      { kind: 'footnote', id: 1 },
      { kind: 'footnote', id: 2 },
    ]));
    zip.file('word/footnotes.xml', makeFootnotesXml([
      { id: 1, text: 'FN1' },
      { id: 2, text: 'FN2' },
      { id: 3, text: 'FN3' },
    ]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    // Body reading order: fn3 → fn1 → fn2, so new IDs should be 1, 2, 3 respectively.
    const refIds = [...docXml.matchAll(/w:endnoteReference[^>]*w:id="(\d+)"/g)].map(m => m[1]);
    expect(refIds).toEqual(['1', '2', '3']);

    // Endnotes.xml should contain the three notes with the new IDs.
    const enXml = await outZip.file('word/endnotes.xml')!.async('string');
    expect(enXml).toContain('FN3'); // was footnote 3, now endnote 1
    expect(enXml).toContain('FN1'); // was footnote 1, now endnote 2
    expect(enXml).toContain('FN2'); // was footnote 2, now endnote 3
  });

  it('merges footnotes and existing endnotes in body reading order', async () => {
    // Body order: endnote(id=1), footnote(id=1), endnote(id=2)
    // Expected new IDs: 1, 2, 3 in that order
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([
      { kind: 'endnote', id: 1 },
      { kind: 'footnote', id: 1 },
      { kind: 'endnote', id: 2 },
    ]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'FN-A' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml([
      { id: 1, text: 'EN-1' },
      { id: 2, text: 'EN-2' },
    ]));
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const docXml = await outZip.file('word/document.xml')!.async('string');
    const refIds = [...docXml.matchAll(/w:endnoteReference[^>]*w:id="(\d+)"/g)].map(m => m[1]);
    expect(refIds).toEqual(['1', '2', '3']);

    const enXml = await outZip.file('word/endnotes.xml')!.async('string');
    // EN-1 was first in reading order → new ID 1
    // FN-A was second → new ID 2
    // EN-2 was third → new ID 3
    const noteOrder = [...enXml.matchAll(/w:endnote\b[^>]*w:id="(\d+)"[^>]*>/g)].map(m => m[1] ?? '');
    // IDs -1 and 0 are the separators; user notes should be 1, 2, 3
    const userNoteIds = noteOrder.filter(id => parseInt(id) >= 1);
    expect(userNoteIds).toEqual(['1', '2', '3']);
  });

  it('preserves separator entries in endnotes.xml', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Note.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const enXml = await outZip.file('word/endnotes.xml')!.async('string');
    expect(enXml).toContain('w:type="separator"');
    expect(enXml).toContain('w:type="continuationSeparator"');
  });

  it('preserves separator entries in footnotes.xml and removes user-authored notes', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Remove me.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const fnXml = await outZip.file('word/footnotes.xml')!.async('string');
    expect(fnXml).toContain('w:type="separator"');
    expect(fnXml).toContain('w:type="continuationSeparator"');
    expect(fnXml).not.toContain('Remove me.');
  });

  it('adds the endnotes relationship and content-type Override when endnotes.xml was absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Note.' }]));
    // No word/endnotes.xml in the archive
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);

    // endnotes.xml must now exist
    expect(outZip.file('word/endnotes.xml')).not.toBeNull();

    // Relationship entry must be present
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relsXml).toContain(ENDNOTES_REL_TYPE);

    // Content type Override must be present
    const ctXml = await outZip.file('[Content_Types].xml')!.async('string');
    expect(ctXml).toContain('/word/endnotes.xml');
    expect(ctXml).toContain(ENDNOTES_CT);
  });

  it('does not duplicate the endnotes relationship when endnotes.xml already existed', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Note.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file(
      'word/_rels/document.xml.rels',
      makeDocRels([
        `<Relationship Id="rId2" Type="${ENDNOTES_REL_TYPE}" Target="endnotes.xml"/>`,
      ])
    );
    zip.file('[Content_Types].xml', makeContentTypes([
      `<Override PartName="/word/endnotes.xml" ContentType="${ENDNOTES_CT}"/>`,
    ]));

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');
    const endnotesRelCount = (relsXml.match(new RegExp(ENDNOTES_REL_TYPE, 'g')) ?? []).length;
    expect(endnotesRelCount).toBe(1);
  });

  it('does not inject xmlns:w="" on converted elements', async () => {
    // setAttributeNS(null, 'w:prefixedAttr', ...) causes XMLSerializer to emit
    // xmlns:w="" on the element, overriding the root-level namespace declaration
    // and making Word reject the document as unreadable. A valid re-declaration
    // (xmlns:w="http://...") is legal XML and not checked here.
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Note.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const docXml = await outZip.file('word/document.xml')!.async('string');

    // The empty binding xmlns:w="" is the corruption: it unbinds the w: prefix
    // for all descendants, invalidating every w:-namespaced element and attribute.
    expect(docXml).not.toContain('xmlns:w=""');
  });

  it('rewrites w:footnoteReference elements in header/footer parts', async () => {
    // Header contains a footnote reference to id=1; body also references id=1.
    // After conversion both should be w:endnoteReference with id=1.
    const headerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="${W_NS_NOTE}">` +
      `<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>` +
      `</w:hdr>`;

    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Note.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/header1.xml', headerXml);
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);

    // Body: no footnoteReference remaining
    const docXml = await outZip.file('word/document.xml')!.async('string');
    expect(docXml).not.toContain('w:footnoteReference');
    expect(docXml).toContain('w:endnoteReference');

    // Header: footnoteReference replaced with endnoteReference
    const hdrXml = await outZip.file('word/header1.xml')!.async('string');
    expect(hdrXml).not.toContain('w:footnoteReference');
    expect(hdrXml).toContain('w:endnoteReference');
    expect(hdrXml).toContain('w:id="1"');
  });

  it('word/endnotes.xml is well-formed and retains namespace declarations after conversion', async () => {
    // Regression: when endnotesDom was mutated in-place, XMLSerializer could
    // inject xmlns:w="" on programmatically-created elements, or drop the root
    // namespace declaration entirely — both cause Word to reject the document.
    const zip = new JSZip();
    zip.file('word/document.xml', makeNoteDocXml([{ kind: 'footnote', id: 1 }]));
    zip.file('word/footnotes.xml', makeFootnotesXml([{ id: 1, text: 'Converted note.' }]));
    zip.file('word/endnotes.xml', makeEndnotesXml());
    zip.file('word/_rels/document.xml.rels', makeDocRels());
    zip.file('[Content_Types].xml', makeContentTypes());

    const outZip = await getOutputZip(zip, [], [NOTE_001_CHANGE]);
    const enXml = await outZip.file('word/endnotes.xml')!.async('string');

    // Must parse as valid XML (no <parsererror> element)
    const domParser = new DOMParser();
    const enDoc = domParser.parseFromString(enXml, 'application/xml');
    expect(enDoc.getElementsByTagName('parsererror')).toHaveLength(0);

    // Root element must carry the WordprocessingML namespace declaration
    expect(enDoc.documentElement.getAttribute('xmlns:w')).toBe(W_NS_NOTE);

    // The empty-binding corruption must not appear in endnotes.xml either
    expect(enXml).not.toContain('xmlns:w=""');
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

  it('does not append a period to items ending with ?, !, or ,', async () => {
    // List qualifies (has a period). Items ending with ?, !, , are already
    // punctuated and must be left unchanged; only the bare item gets a period.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeListDocXml([{ numId: '1', items: ['Item 1.', 'Item 2?', 'Item 3!', 'Item 4,', 'Item 5'] }])
    );

    const outXml = await getOutputDocXml(zip, [], [LIST_PERIOD_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Item 1.');
    expect(texts[1]).toBe('Item 2?'); // already punctuated → unchanged
    expect(texts[2]).toBe('Item 3!'); // already punctuated → unchanged
    expect(texts[3]).toBe('Item 4,'); // already punctuated → unchanged
    expect(texts[4]).toBe('Item 5.'); // plain text → gets period
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

/**
 * Build a minimal document.xml where the first checklist table cell starts with
 * a single <w:hyperlink> whose text is `linkText` (may begin with a glyph).
 */
function makeChecklistHyperlinkCellDocXml(linkText: string): string {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_CHECKLIST}" xmlns:r="${R}">` +
    `<w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
    `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
    `<w:tbl><w:tr>` +
    `<w:tc><w:p>` +
    `<w:hyperlink r:id="rId1" w:history="1">` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>` +
    `<w:t xml:space="preserve">${linkText}</w:t>` +
    `</w:r></w:hyperlink>` +
    `</w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t>Second column</w:t></w:r></w:p></w:tc>` +
    `</w:tr></w:tbl>` +
    `<w:sectPr/></w:body></w:document>`
  );
}

/**
 * Return the direct Element children of the first-column paragraph in the
 * first row of the first checklist table. Used to assert glyph/hyperlink structure.
 */
function extractChecklistCellParaChildren(xml: string): Element[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) return [];

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
      const firstRow = Array.from(child.children).find(c => c.localName === 'tr');
      if (!firstRow) return [];
      const firstCell = Array.from(firstRow.children).find(c => c.localName === 'tc');
      if (!firstCell) return [];
      const firstPara = Array.from(firstCell.children).find(c => c.localName === 'p');
      if (!firstPara) return [];
      return Array.from(firstPara.children);
    }
  }
  return [];
}

/** Extract all w:t text from an element's descendants. */
function getWtText(el: Element | undefined): string {
  if (!el) return '';
  return Array.from(el.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('');
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

  it('leaves a single-cell callout table untouched while fixing the multi-cell checklist table', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_CHECKLIST}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t>Application checklist</w:t></w:r></w:p>` +
      // Single-cell callout box — must not be touched
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>Important: public information</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>More callout content.</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      // Two-column checklist table — wrong glyph should be fixed
      `<w:tbl><w:tr>` +
      `<w:tc><w:p><w:r><w:t>☐ Checklist item</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc>` +
      `</w:tr></w:tbl>` +
      `<w:sectPr/></w:body></w:document>`;

    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);

    // Callout table: text must be preserved verbatim — no ◻ prepended
    expect(outXml).toContain('Important: public information');
    expect(outXml).not.toContain('◻ Important:');

    // Checklist table: wrong glyph must have been corrected
    expect(outXml).toContain('◻ Checklist item');
    expect(outXml).not.toContain('☐ Checklist item');
  });

  it('Fix 1: wrong glyph (☐) inside <w:hyperlink> is replaced and extracted into a run before the link', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistHyperlinkCellDocXml('☐ Item text'));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const paraChildren = extractChecklistCellParaChildren(outXml);

    // First direct child of the paragraph: a plain w:r containing ◻ (outside the hyperlink)
    expect(paraChildren[0]?.localName).toBe('r');
    expect(getWtText(paraChildren[0])).toBe('◻ ');

    // Second direct child: the w:hyperlink, now without the glyph
    expect(paraChildren[1]?.localName).toBe('hyperlink');
    expect(getWtText(paraChildren[1])).toBe('Item text');
  });

  it('Fix 1b: correct ◻ inside <w:hyperlink> is extracted into a run before the link', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistHyperlinkCellDocXml('◻ Item text'));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const paraChildren = extractChecklistCellParaChildren(outXml);

    // First direct child: a plain w:r containing ◻ (outside the hyperlink)
    expect(paraChildren[0]?.localName).toBe('r');
    expect(getWtText(paraChildren[0])).toBe('◻ ');

    // Second direct child: the w:hyperlink, now without the glyph
    expect(paraChildren[1]?.localName).toBe('hyperlink');
    expect(getWtText(paraChildren[1])).toBe('Item text');
  });

  it('Fix 3: ◻ is prepended as a plain run before a <w:hyperlink> when no glyph is present', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeChecklistHyperlinkCellDocXml('Item text'));

    const outXml = await getOutputDocXml(zip, [], [CHECKLIST_CHANGE]);
    const paraChildren = extractChecklistCellParaChildren(outXml);

    // First direct child: a plain w:r containing ◻ (outside the hyperlink)
    expect(paraChildren[0]?.localName).toBe('r');
    expect(getWtText(paraChildren[0])).toBe('◻ ');

    // Second direct child: the w:hyperlink with its original text unchanged
    expect(paraChildren[1]?.localName).toBe('hyperlink');
    expect(getWtText(paraChildren[1])).toBe('Item text');
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

  // ── ::originalLinkText scoping ────────────────────────────────────────────

  it('scopes patch to the exact hyperlink whose original text matches the :: suffix', async () => {
    // Two hyperlinks share the same anchor ("Section_2") but have different text.
    // Accepting the fix for "Click here" must update only that link; "See section 2"
    // must remain unchanged.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
      `<w:body>` +
      `<w:p><w:hyperlink w:anchor="Section_2"><w:r><w:t>Click here</w:t></w:r></w:hyperlink></w:p>` +
      `<w:p><w:hyperlink w:anchor="Section_2"><w:r><w:t>See section 2</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const fix: AcceptedFix = {
      issueId: 'LINK-006-ltext-0',
      ruleId: 'LINK-006',
      targetField: 'link.text.Section_2::Click here',
      value: 'Go to Section 2 (see Section 2)',
    };

    const outXml = await getOutputDocXml(zip, [fix]);

    // The targeted hyperlink must have the new text
    expect(outXml).toContain('Go to Section 2 (see Section 2)');
    // The other hyperlink with the same anchor must be untouched
    expect(outXml).toContain('See section 2');
    // Original text must be gone (replaced)
    expect(outXml).not.toContain('>Click here<');
    // Both links must still point to Section_2
    expect(outXml.match(/w:anchor="Section_2"/g)?.length).toBe(2);
  });

  it('leaves original content untouched when the issue is dismissed (no AcceptedFix)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'Section_2', linkText: 'Original text' }));

    // Dismiss = no fix submitted; buildDocx is called with empty acceptedFixes
    const outXml = await getOutputDocXml(zip, []);
    expect(outXml).toContain('Original text');
    expect(outXml).not.toContain('Go to Section 2');
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

  it('does not append [PDF] when link text contains a size-annotated "[PDF - 312KB]"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Annual Report [PDF - 312KB]'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/annual-report.pdf'));
    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Annual Report [PDF - 312KB]');
  });

  it('does not append [PDF] when link text contains a size-annotated "[PDF - 1.2MB]"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', 'Annual Report [PDF - 1.2MB]'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/annual-report.pdf'));
    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Annual Report [PDF - 1.2MB]');
  });

  it('does not append [PDF] when "[PDF]" appears at the start of the link text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePdfHyperlinkDocXml('rId1', '[PDF] Annual Report'));
    zip.file('word/_rels/document.xml.rels',
      makePdfRelsXml('rId1', 'https://example.com/annual-report.pdf'));
    const outXml = await getOutputDocXml(zip, [], [PDF_LABEL_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('[PDF] Annual Report');
  });
});

// ─── CLEAN-017: Grants.gov capitalization OOXML patch ────────────────────────

const CAPITALIZE_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-017',
  description: 'Grants.gov capitalization corrected in 1 location.',
  targetField: 'text.grantsgov.capitalize',
  value: '1',
};

describe('buildDocx — CLEAN-017: Grants.gov capitalization OOXML patch', () => {
  it('corrects "grants.gov" in a plain body paragraph w:t run', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>Visit grants.gov today.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], [CAPITALIZE_CHANGE]);
    expect(xml).toContain('>Visit Grants.gov today.</w:t>');
    expect(xml).not.toContain('>Visit grants.gov');
  });

  it('corrects "grants.gov" in a hyperlink run w:t element', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
      `<w:body><w:p><w:hyperlink r:id="rId1" w:history="1">` +
      `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>grants.gov</w:t></w:r>` +
      `</w:hyperlink></w:p><w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], [CAPITALIZE_CHANGE]);
    expect(xml).toContain('>Grants.gov</w:t>');
    expect(xml).not.toContain('>grants.gov</w:t>');
  });

  it('leaves already-correct "Grants.gov" unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>Visit Grants.gov today.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], [CAPITALIZE_CHANGE]);
    expect(xml).toContain('>Visit Grants.gov today.</w:t>');
  });

  it('makes no changes when the autoAppliedChange flag is absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>grants.gov</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], []);
    expect(xml).toContain('>grants.gov</w:t>');
    expect(xml).not.toContain('>Grants.gov</w:t>');
  });

  it('does not modify "notgrants.gov" (word char immediately before)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>notgrants.gov</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], [CAPITALIZE_CHANGE]);
    expect(xml).toContain('>notgrants.gov</w:t>');
    expect(xml).not.toContain('notGrants.gov');
  });

  it('does not modify "grants.gov.uk" (dot + alpha TLD extension after)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>grants.gov.uk</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const xml = await getOutputDocXml(zip, [], [CAPITALIZE_CHANGE]);
    expect(xml).toContain('>grants.gov.uk</w:t>');
    expect(xml).not.toContain('Grants.gov.uk');
  });
});

// ─── CLEAN-017: Grants.gov capitalization OOXML patch (story parts) ──────────

function makeGrantsGovRelsXml(rId: string, target: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${RELS_NS}">` +
    `<Relationship Id="${rId}" Type="${HYPERLINK_TYPE_URI}" Target="${target}" TargetMode="External"/>` +
    `</Relationships>`
  );
}

function getRelTarget(relsXml: string, rId: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, 'application/xml');
  const rels = Array.from(doc.getElementsByTagNameNS(RELS_NS, 'Relationship'));
  const rel = rels.find(r => r.getAttribute('Id') === rId);
  return rel?.getAttribute('Target') ?? null;
}

const CLEAN_017_CAP_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-017',
  description: 'Grants.gov capitalization corrected in 1 location.',
  targetField: 'text.grantsgov.capitalize',
  value: '1',
};

function makeGrantsGovDocXml(text: string, inHyperlink = false, rId = 'rId1'): string {
  const run = `<w:r><w:t>${text}</w:t></w:r>`;
  const para = inHyperlink
    ? `<w:p><w:hyperlink r:id="${rId}">${run}</w:hyperlink></w:p>`
    : `<w:p>${run}</w:p>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body>${para}<w:sectPr/></w:body></w:document>`
  );
}

describe('buildDocx — CLEAN-017: Grants.gov capitalization OOXML patch (story parts)', () => {
  it('corrects "grants.gov" as full hyperlink text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('grants.gov', true));
    const outXml = await getOutputDocXml(zip, [], [CLEAN_017_CAP_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('Grants.gov');
  });

  it('corrects only the substring when "grants.gov" is embedded in longer hyperlink text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('visit grants.gov for more details', true));
    const outXml = await getOutputDocXml(zip, [], [CLEAN_017_CAP_CHANGE]);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('visit Grants.gov for more details');
  });

  it('corrects "grants.gov" in plain body text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('Submit at grants.gov today.'));
    const outXml = await getOutputDocXml(zip, [], [CLEAN_017_CAP_CHANGE]);
    expect(outXml).toContain('Submit at Grants.gov today.');
    expect(outXml).not.toContain('grants.gov');
  });

  it('leaves already-correct "Grants.gov" unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('Visit Grants.gov for details.'));
    const outXml = await getOutputDocXml(zip, [], [CLEAN_017_CAP_CHANGE]);
    expect(outXml).toContain('Visit Grants.gov for details.');
  });

  it('does not touch the hyperlink URL (relationship target)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('grants.gov', true));
    zip.file('word/_rels/document.xml.rels', makeGrantsGovRelsXml('rId1', 'http://grants.gov'));
    const blob = await buildDocx(zip, [], [CLEAN_017_CAP_CHANGE]);
    const outZip = await JSZip.loadAsync(blob);
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');
    expect(getRelTarget(relsXml, 'rId1')).toBe('http://grants.gov');
  });

  it('corrects "grants.gov" in word/footnotes.xml', async () => {
    const footnotesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:footnotes xmlns:w="${W_NS}">` +
      `<w:footnote w:id="1"><w:p><w:r><w:t>See grants.gov for more.</w:t></w:r></w:p></w:footnote>` +
      `</w:footnotes>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('Body text.'));
    zip.file('word/footnotes.xml', footnotesXml);
    const blob = await buildDocx(zip, [], [CLEAN_017_CAP_CHANGE]);
    const outZip = await JSZip.loadAsync(blob);
    const outFootnotes = await outZip.file('word/footnotes.xml')!.async('string');
    expect(outFootnotes).toContain('Grants.gov');
    expect(outFootnotes).not.toContain('grants.gov');
  });

  it('corrects "grants.gov" in word/endnotes.xml', async () => {
    const endnotesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:endnotes xmlns:w="${W_NS}">` +
      `<w:endnote w:id="1"><w:p><w:r><w:t>Source: GRANTS.GOV.</w:t></w:r></w:p></w:endnote>` +
      `</w:endnotes>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('Body text.'));
    zip.file('word/endnotes.xml', endnotesXml);
    const blob = await buildDocx(zip, [], [CLEAN_017_CAP_CHANGE]);
    const outZip = await JSZip.loadAsync(blob);
    const outEndnotes = await outZip.file('word/endnotes.xml')!.async('string');
    expect(outEndnotes).toContain('Grants.gov');
    expect(outEndnotes).not.toContain('GRANTS.GOV');
  });

  it('does not correct "grants.gov" split across adjacent w:t nodes (known limitation)', async () => {
    // Word can split a word across runs when inline formatting changes mid-word.
    // The fix only operates within individual w:t nodes; split occurrences are unchanged.
    const splitRunDocXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:p><w:r><w:t>grants</w:t></w:r><w:r><w:t>.gov</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', splitRunDocXml);
    const outXml = await getOutputDocXml(zip, [], [CLEAN_017_CAP_CHANGE]);
    expect(outXml).toContain('<w:t>grants</w:t>');
    expect(outXml).toContain('<w:t>.gov</w:t>');
  });

  it('makes no changes when the autoAppliedChange flag is absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeGrantsGovDocXml('grants.gov', true));
    const outXml = await getOutputDocXml(zip, [], []);
    expect(getHyperlinkText(outXml, 'rId1')).toBe('grants.gov');
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

  it('applies fix when fix.originalText uses regular space but OOXML heading has NBSP (mammoth normalisation)', async () => {
    // Simulates the real-world case: OOXML stores \u00a0 between words but mammoth
    // renders it as a regular space in HTML, so fix.originalText has a regular space.
    const ooXmlText = 'Long heading\u00a0with eleven words so it exceeds the limit here';
    const mammothText = 'Long heading with eleven words so it exceeds the limit here';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(3, ooXmlText),  // OOXML has NBSP
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-0',
      ruleId: 'HEAD-004',
      targetField: `heading.text.H3.0::${mammothText}`,  // originalText has regular space
      value: 'Short heading',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    expect(styles[0]).toMatchObject({ style: 'Heading3', text: 'Short heading' });
  });

  it('replaces text in a multi-run heading and clears subsequent runs', async () => {
    // Heading split across two runs (e.g. different run-level formatting)
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const multiRunPara =
      `<w:p xmlns:w="${W_NS}">` +
      `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">First half </w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>second half that is long</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([multiRunPara]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-0',
      ruleId: 'HEAD-004',
      targetField: 'heading.text.H3.0::First half second half that is long',
      value: 'Short heading',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const styles = extractHeadingStyles(xml);
    // All runs' text concatenated should equal just the new text (second run cleared)
    expect(styles[0]).toMatchObject({ style: 'Heading3', text: 'Short heading' });
  });

  it('rewrites w:bookmarkStart w:name and w:hyperlink w:anchor to the new slug', async () => {
    // "Eligibility Requirements" has bookmark "Eligibility_Requirements".
    // A hyperlink in a later paragraph targets the same anchor.
    // After HEAD-004 renames the heading to "Eligibility Criteria", both the
    // bookmark name and the hyperlink anchor must be rewritten to the new slug.
    const headingWithBookmark =
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:bookmarkStart w:id="1" w:name="Eligibility_Requirements"/>` +
      `<w:r><w:t>Eligibility Requirements</w:t></w:r>` +
      `<w:bookmarkEnd w:id="1"/>` +
      `</w:p>`;
    const linkPara =
      `<w:p>` +
      `<w:hyperlink w:anchor="Eligibility_Requirements">` +
      `<w:r><w:t>see eligibility</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([headingWithBookmark, linkPara]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-004-0',
      ruleId: 'HEAD-004',
      targetField: 'heading.text.H2.0::Eligibility Requirements',
      value: 'Eligibility Criteria',
    };

    const xml = await getOutputDocXml(zip, [fix]);

    // Heading text updated
    expect(xml).toContain('Eligibility Criteria');
    expect(xml).not.toContain('Eligibility Requirements');
    // Bookmark name rewritten to new slug
    expect(xml).toContain('w:name="Eligibility_Criteria"');
    expect(xml).not.toContain('w:name="Eligibility_Requirements"');
    // Hyperlink anchor rewritten to new slug
    expect(xml).toContain('w:anchor="Eligibility_Criteria"');
    expect(xml).not.toContain('w:anchor="Eligibility_Requirements"');
  });
});

// ─── applyHeadingStyleToNormal (HEAD-005) ────────────────────────────────────

/**
 * Parse all paragraphs from a serialized word/document.xml, returning their
 * pStyle value (or '' if absent) and their concatenated w:t text content.
 */
function extractAllParaStyles(xml: string): Array<{ style: string; text: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const result: Array<{ style: string; text: string }> = [];
  for (const wP of Array.from(doc.getElementsByTagName('w:p'))) {
    const pPr = Array.from(wP.children).find(c => c.localName === 'pPr');
    const pStyle = pPr
      ? Array.from(pPr.children).find(c => c.localName === 'pStyle')
      : undefined;
    const style = pStyle?.getAttribute('w:val') ?? '';
    const text = Array.from(wP.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    result.push({ style, text });
  }
  return result;
}

describe('buildDocx — applyHeadingStyleToNormal (HEAD-005)', () => {
  it('changes the targeted heading pStyle to Normal while preserving text', async () => {
    // H1(0), H3(1) with a very long body-like heading — user accepts HEAD-005
    const longText =
      'This paragraph was accidentally styled as a heading and should be converted to normal text in the output document';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'NOFO Title'),
      headingPara(3, longText),
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-005-1',
      ruleId: 'HEAD-005',
      targetField: `heading.style.H3.1::${longText}`,
      value: 'apply',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const paras = extractAllParaStyles(xml);
    // H1 stays H1
    expect(paras[0]).toMatchObject({ style: 'Heading1', text: 'NOFO Title' });
    // H3 → Normal; text unchanged
    expect(paras[1]).toMatchObject({ style: 'Normal', text: longText });
  });

  it('does not change a heading at a different ordinal position', async () => {
    const longText =
      'This paragraph was accidentally styled as a heading and should be converted to normal text in the output document';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),       // index 0
      headingPara(3, longText),      // index 1 — NOT targeted
      headingPara(2, 'Section'),     // index 2
      headingPara(3, longText),      // index 3 — targeted
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-005-3',
      ruleId: 'HEAD-005',
      targetField: `heading.style.H3.3::${longText}`,
      value: 'apply',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const paras = extractAllParaStyles(xml);
    // Index 1 must still be Heading3 (not targeted)
    expect(paras[1]).toMatchObject({ style: 'Heading3', text: longText });
    // Index 3 → Normal
    expect(paras[3]).toMatchObject({ style: 'Normal', text: longText });
  });

  it('preserves run-level formatting (bold w:b) when converting to Normal', async () => {
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const longText =
      'This paragraph was accidentally styled as a heading and should be converted to normal text in the output document';
    // Heading paragraph with a bold run — simulates real-world heading formatting
    const boldRunPara =
      `<w:p xmlns:w="${W_NS}">` +
      `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>${longText}</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([boldRunPara]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-005-0',
      ruleId: 'HEAD-005',
      targetField: `heading.style.H3.0::${longText}`,
      value: 'apply',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    // pStyle changed to Normal
    expect(xml).toContain('w:val="Normal"');
    expect(xml).not.toContain('w:val="Heading3"');
    // w:b run property still present — run formatting untouched
    expect(xml).toContain('<w:b/>');
    // Text unchanged
    expect(xml).toContain(longText);
  });

  it('leaves the document unchanged when no heading-style fixes are present', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(1, 'Title'),
      headingPara(3, 'Long heading that was not accepted'),
    ]));

    const xml = await getOutputDocXml(zip, []);
    const paras = extractAllParaStyles(xml);
    expect(paras[0]).toMatchObject({ style: 'Heading1' });
    expect(paras[1]).toMatchObject({ style: 'Heading3' });
  });

  it('applies fix when fix.originalText uses regular space but OOXML heading has NBSP (HEAD-005 NBSP guard)', async () => {
    // Simulates the same mammoth normalisation case as HEAD-004: OOXML stores
    // between words but mammoth renders it as a regular space in HTML, so the
    // targetField :: suffix has a regular space while the OOXML text has NBSP.
    const longText = 'This paragraph was accidentally styled as a heading and should be converted to normal text';
    const mammothText = 'This paragraph was accidentally styled as a heading and should be converted to normal text';
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocXmlFromParas([
      headingPara(3, longText),  // OOXML has NBSP at position 71
    ]));

    const fix: AcceptedFix = {
      issueId: 'HEAD-005-0',
      ruleId: 'HEAD-005',
      targetField: `heading.style.H3.0::${mammothText}`,  // originalText has regular space
      value: 'apply',
    };

    const xml = await getOutputDocXml(zip, [fix]);
    const paras = extractAllParaStyles(xml);
    // Despite the NBSP mismatch, the text guard should normalise both sides and match
    expect(paras[0]).toMatchObject({ style: 'Normal' });
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

  it('retargets a hyperlink whose w: prefix was stripped to a bare anchor= attribute', async () => {
    // After a prior XMLSerializer pass the attribute may appear as anchor="_Eligibility"
    // (no namespace prefix) rather than w:anchor="...".  getAttribute('w:anchor') and
    // getAttributeNS(W, 'anchor') both return null in that state, so the third fallback
    // getAttribute('anchor') is needed to match and retarget the link.
    const W_NS_L6 = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_L6}">` +
      `<w:body>` +
      `<w:p>` +
      // Bare anchor= attribute — no namespace prefix
      `<w:hyperlink anchor="_Eligibility" w:history="1">` +
      `<w:r><w:t>See eligibility</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Eligibility" → "#Eligibility"',
      targetField: 'link.bookmark._Eligibility',
      value: 'Eligibility',
    };

    const xml = await getOutputDocXml(zip, [], [change]);
    // Retarget must succeed despite the missing namespace prefix
    expect(xml).toContain('w:anchor="Eligibility"');
    expect(xml).not.toContain('w:anchor="_Eligibility"');
    // No stale bare anchor= attribute should remain
    expect(xml).not.toMatch(/(?<![:\w])anchor="_Eligibility"/);
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

  it('rewrites Target="#old" in .rels for an r:id-based hyperlink when LINK-006 retargets', async () => {
    // Word's "Insert → Link → This Document" creates <w:hyperlink r:id="rIdN"> with a
    // corresponding <Relationship Target="#bookmark_name"/> in .rels rather than an
    // inline w:anchor attribute.  When LINK-006 retargets the link, the .rels Target
    // must also be updated or Word can no longer resolve the bookmark.
    const RELS_NS_L6 = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
      ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>` +
      // r:id-based hyperlink — no w:anchor attribute
      `<w:p><w:hyperlink r:id="rId10"><w:r><w:t>See eligibility</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${RELS_NS_L6}">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      // Internal anchor relationship — LINK-006 must update this Target
      `<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#_Eligibility"/>` +
      `</Relationships>`
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Eligibility" → "#Eligibility"',
      targetField: 'link.bookmark._Eligibility',
      value: 'Eligibility',
    };

    const blob = await buildDocx(zip, [], [change]);
    const outZip = await JSZip.loadAsync(blob);

    // .rels Target must be updated
    const relsFile = outZip.file('word/_rels/document.xml.rels');
    expect(relsFile).not.toBeNull();
    const relsXml = await relsFile!.async('string');
    expect(relsXml).toContain('Target="#Eligibility"');
    expect(relsXml).not.toContain('Target="#_Eligibility"');
    // Unrelated entry is preserved
    expect(relsXml).toContain('Target="styles.xml"');

    // The hyperlink element itself is untouched — r:id-based links have no w:anchor
    const docXml = await outZip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('r:id="rId10"');
    expect(docXml).not.toContain('w:anchor=');
  });

  it('does not rewrite .rels when there is no matching r:id-based Target for the retarget', async () => {
    // If the .rels file only has an external link (no Target="#..."), nothing should change.
    const RELS_NS_L6 = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const zip = new JSZip();
    zip.file('word/document.xml', makeSimpleHyperlinkDocXml('_Eligibility'));
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${RELS_NS_L6}">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>` +
      `</Relationships>`
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Eligibility" → "#Eligibility"',
      targetField: 'link.bookmark._Eligibility',
      value: 'Eligibility',
    };

    const blob = await buildDocx(zip, [], [change]);
    const outZip = await JSZip.loadAsync(blob);

    // w:anchor still updated in document.xml
    const docXml = await outZip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('w:anchor="Eligibility"');

    // .rels is unchanged — external link untouched
    const relsXml = await outZip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relsXml).toContain('Target="https://example.com"');
    expect(relsXml).not.toContain('Target="#');
  });
});

// ─── LINK-006 bookmark creation via "anchor::headingText" encoding ────────────

describe('buildDocx — LINK-006 needsBookmarkCreation: inserts w:bookmarkStart on heading', () => {
  const W_NS_L6C = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function makeDocWithHeadingAndBrokenLink(): string {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_L6C}">` +
      `<w:body>` +
      // Heading paragraph — NO bookmark yet
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading5"/></w:pPr>` +
      `<w:r><w:t>Resumes and job descriptions</w:t></w:r>` +
      `</w:p>` +
      // Body paragraph with the broken hyperlink
      `<w:p>` +
      `<w:hyperlink w:anchor="_Resumes_and_job_1">` +
      `<w:r><w:t>See resume section</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`
    );
  }

  it('inserts w:bookmarkStart and w:bookmarkEnd on the heading paragraph when the value encodes "anchor::headingText"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocWithHeadingAndBrokenLink());

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Resumes_and_job_1" → "#Resumes_and_job_descriptions"',
      targetField: 'link.bookmark._Resumes_and_job_1',
      // "anchor::headingText" encoding signals buildDocx to create the bookmark
      value: 'Resumes_and_job_descriptions::Resumes and job descriptions',
    };

    const xml = await getOutputDocXml(zip, [], [change]);

    // Hyperlink must be retargeted
    expect(xml).toContain('w:anchor="Resumes_and_job_descriptions"');
    expect(xml).not.toContain('w:anchor="_Resumes_and_job_1"');

    // A new w:bookmarkStart with the correct name must appear
    expect(xml).toContain('w:name="Resumes_and_job_descriptions"');

    // The bookmarkStart and bookmarkEnd must share the same w:id
    const startMatch = xml.match(/w:bookmarkStart[^>]*w:name="Resumes_and_job_descriptions"[^>]*w:id="(\d+)"|w:bookmarkStart[^>]*w:id="(\d+)"[^>]*w:name="Resumes_and_job_descriptions"/);
    expect(startMatch).not.toBeNull();
    const bmId = startMatch![1] ?? startMatch![2];
    expect(xml).toContain(`w:bookmarkEnd w:id="${bmId}"`);
  });

  it('does not insert a duplicate bookmark when one with the same name already exists', async () => {
    const zip = new JSZip();
    // Document already has a bookmark named "Resumes_and_job_descriptions"
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_L6C}"><w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading5"/></w:pPr>` +
      `<w:bookmarkStart w:id="5" w:name="Resumes_and_job_descriptions"/>` +
      `<w:r><w:t>Resumes and job descriptions</w:t></w:r>` +
      `<w:bookmarkEnd w:id="5"/>` +
      `</w:p>` +
      `<w:p><w:hyperlink w:anchor="_Resumes_and_job_1"><w:r><w:t>See section</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const change: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'Retargeted internal link "#_Resumes_and_job_1" → "#Resumes_and_job_descriptions"',
      targetField: 'link.bookmark._Resumes_and_job_1',
      value: 'Resumes_and_job_descriptions::Resumes and job descriptions',
    };

    const xml = await getOutputDocXml(zip, [], [change]);

    // Exactly one bookmarkStart with this name — no duplicate inserted
    const occurrences = (xml.match(/w:name="Resumes_and_job_descriptions"/g) ?? []).length;
    expect(occurrences).toBe(1);
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

// ─── applyRemoveBeforeYouBeginHeading (CLEAN-006) ────────────────────────────

const W_NS_BYB = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeBybDocXml(parts: { beforeBybParas?: string[]; afterBybParas?: string[]; bybLevel?: number }): string {
  const { beforeBybParas = [], afterBybParas = [], bybLevel = 2 } = parts;
  const before = beforeBybParas
    .map(t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`)
    .join('');
  const bybHeading =
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${bybLevel}"/></w:pPr>` +
    `<w:r><w:t>Before You Begin</w:t></w:r>` +
    `</w:p>`;
  const after = afterBybParas
    .map(t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_BYB}"><w:body>` +
    before + bybHeading + after +
    `<w:sectPr/></w:body></w:document>`
  );
}

const BYB_REMOVAL_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-006',
  description: 'Before You Begin heading removed — content preserved.',
  targetField: 'struct.byb.removeheading',
};

describe('buildDocx — CLEAN-006: Before You Begin heading removal', () => {
  it('removes the Before You Begin heading paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBybDocXml({
      beforeBybParas: ['Intro paragraph'],
      afterBybParas: ['Content after BYB'],
    }));

    const outXml = await getOutputDocXml(zip, [], [BYB_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('Before You Begin');
    expect(outXml).toContain('Intro paragraph');
    expect(outXml).toContain('Content after BYB');
  });

  it('removes the heading regardless of level (H2 or H3)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBybDocXml({ bybLevel: 3, afterBybParas: ['body'] }));

    const outXml = await getOutputDocXml(zip, [], [BYB_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('Before You Begin');
    expect(outXml).toContain('body');
  });

  it('removal is case-insensitive', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_BYB}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>BEFORE YOU BEGIN</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>body content</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [BYB_REMOVAL_CHANGE]);
    expect(outXml).not.toContain('BEFORE YOU BEGIN');
    expect(outXml).toContain('body content');
  });

  it('leaves content after the heading intact — no orphaned paragraphs', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBybDocXml({
      afterBybParas: ['First body para', 'Second body para'],
    }));

    const outXml = await getOutputDocXml(zip, [], [BYB_REMOVAL_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');
    const texts = Array.from(xmlDoc.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .filter(Boolean);
    expect(texts).toContain('First body para');
    expect(texts).toContain('Second body para');
    // No Before You Begin text present at all
    expect(texts.join(' ')).not.toMatch(/before you begin/i);
  });

  it('does not remove a body paragraph that happens to read "Before You Begin"', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_BYB}"><w:body>` +
      // Normal paragraph (no pStyle) — must NOT be removed
      `<w:p><w:r><w:t>Before You Begin</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>body</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [BYB_REMOVAL_CHANGE]);
    expect(outXml).toContain('Before You Begin');
    expect(outXml).toContain('body');
  });

  it('leaves the document unchanged when targetField is absent', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeBybDocXml({ afterBybParas: ['body'] }));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('Before You Begin');
    expect(outXml).toContain('body');
  });
});

// ─── applyRemoveDghtInstructionBoxes (CLEAN-007) ─────────────────────────────

const W_NS_IB = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeInstructionBoxDocXmlBD(opts: {
  fill?: string;
  prefix?: string;
  extraCells?: number;
  extraParaAfter?: string;
}): string {
  const { fill = 'BCD6F4', prefix = 'DGHT-SPECIFIC INSTRUCTIONS', extraCells = 0, extraParaAfter } = opts;
  const extra = Array.from({ length: extraCells })
    .map(() => `<w:tc><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>`)
    .join('');
  const afterPara = extraParaAfter
    ? `<w:p><w:r><w:t>${extraParaAfter}</w:t></w:r></w:p>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_IB}"><w:body>` +
    `<w:tbl>` +
    `<w:tr>` +
    `<w:tc>` +
    `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` +
    `<w:p><w:r><w:t>${prefix} Do not include this in the output.</w:t></w:r></w:p>` +
    `</w:tc>` +
    extra +
    `</w:tr>` +
    `</w:tbl>` +
    afterPara +
    `<w:sectPr/></w:body></w:document>`
  );
}

const INSTRUCTION_BOX_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-007',
  description: 'Removed 1 DGHT/DGHP instruction box.',
  targetField: 'struct.dght.removeinstructionboxes',
  value: '1',
};

describe('buildDocx — CLEAN-007: DGHT/DGHP instruction box removal', () => {
  it('removes a single-cell BCD6F4-shaded table starting with "DGHT-SPECIFIC INSTRUCTIONS"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeInstructionBoxDocXmlBD({}));

    const outXml = await getOutputDocXml(zip, [], [INSTRUCTION_BOX_CHANGE]);

    expect(outXml).not.toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).not.toContain('w:tbl');
  });

  it('removes a DGHP variant instruction box', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeInstructionBoxDocXmlBD({ prefix: 'DGHP-SPECIFIC INSTRUCTIONS' }));

    const outXml = await getOutputDocXml(zip, [], [INSTRUCTION_BOX_CHANGE]);

    expect(outXml).not.toContain('DGHP-SPECIFIC INSTRUCTIONS');
    expect(outXml).not.toContain('w:tbl');
  });

  it('preserves surrounding content when removing the instruction box', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeInstructionBoxDocXmlBD({ extraParaAfter: 'Keep this paragraph.' })
    );

    const outXml = await getOutputDocXml(zip, [], [INSTRUCTION_BOX_CHANGE]);

    expect(outXml).not.toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('Keep this paragraph.');
  });

  it('does not remove a table without BCD6F4 shading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeInstructionBoxDocXmlBD({ fill: 'FFFFFF' }));

    const outXml = await getOutputDocXml(zip, [], [INSTRUCTION_BOX_CHANGE]);

    expect(outXml).toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('w:tbl');
  });

  it('does not remove a multi-cell table even with matching shading and prefix', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeInstructionBoxDocXmlBD({ extraCells: 1 }));

    const outXml = await getOutputDocXml(zip, [], [INSTRUCTION_BOX_CHANGE]);

    expect(outXml).toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('w:tbl');
  });

  it('removes all matching instruction boxes when multiple are present', async () => {
    const tblXml =
      `<w:tbl><w:tr><w:tc>` +
      `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="BCD6F4"/></w:tcPr>` +
      `<w:p><w:r><w:t>DGHT-SPECIFIC INSTRUCTIONS Box content.</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>`;
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_IB}"><w:body>` +
      tblXml + tblXml +
      `<w:p><w:r><w:t>Preserve this.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', docXml);

    const outXml = await getOutputDocXml(zip, [], [{
      ruleId: 'CLEAN-007',
      description: 'Removed 2 DGHT/DGHP instruction boxes.',
      targetField: 'struct.dght.removeinstructionboxes',
      value: '2',
    }]);

    expect(outXml).not.toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('Preserve this.');
  });

  it('does not modify the document when targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeInstructionBoxDocXmlBD({}));

    const outXml = await getOutputDocXml(zip, [], []);

    expect(outXml).toContain('DGHT-SPECIFIC INSTRUCTIONS');
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
  it('moves trailing alphanumeric char from preceding run into hyperlink and removes emptied run', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>G</w:t></w:r>`, ``));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('Glink text');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('moves leading alphanumeric char from following run into hyperlink and removes emptied run', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(``, `<w:r><w:t>s</w:t></w:r>`));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link texts');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('handles both leading and trailing moves on the same hyperlink', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(`<w:r><w:t>G</w:t></w:r>`, `<w:r><w:t>s</w:t></w:r>`)
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('Glink texts');
    expect(directParaRuns(outXml)).toHaveLength(0);
  });

  it('trims only trailing alphanumeric from preceding run, preserving whitespace remainder', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(`<w:r><w:t xml:space="preserve">Hello G</w:t></w:r>`, ``)
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('Glink text');
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
        `<w:r><w:t>G</w:t></w:r><w:bookmarkEnd w:id="0"/>`,
        ``
      )
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('Glink text');
  });

  it('does not apply fix when a non-bookmark element blocks adjacency', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(
        `<w:r><w:t>G</w:t></w:r><w:proofErr w:type="spellStart"/>`,
        ``
      )
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
  });

  it('does not move a period immediately following the hyperlink', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(``, `<w:r><w:t>.</w:t></w:r>`));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
    expect(directParaRuns(outXml)).toHaveLength(1);
  });

  it('does not move a comma immediately following the hyperlink', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(``, `<w:r><w:t>,</w:t></w:r>`));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
    expect(directParaRuns(outXml)).toHaveLength(1);
  });

  it('does not move a period+space suffix — sentence punctuation stays outside', async () => {
    // e.g. "Visit [link text]. Next sentence." — period must not be incorporated
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makePartialHlDocXml(``, `<w:r><w:t xml:space="preserve">. Next sentence.</w:t></w:r>`)
    );

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
    const runs = directParaRuns(outXml);
    expect(runs).toHaveLength(1);
    const text = Array.from((runs[0] as Element).getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    expect(text).toBe('. Next sentence.');
  });

  it('does not move an opening paren immediately preceding the hyperlink', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>(</w:t></w:r>`, ``));

    const outXml = await getOutputDocXml(zip, [], [PARTIAL_HYPERLINK_CHANGE]);

    expect(getHyperlinkText(outXml, 'rId1')).toBe('link text');
    expect(directParaRuns(outXml)).toHaveLength(1);
  });

  it('inserts the moved run with w:rStyle w:val="Hyperlink" for correct rendering', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>G</w:t></w:r>`, ``));

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
    zip.file('word/document.xml', makePartialHlDocXml(`<w:r><w:t>G</w:t></w:r>`, ``));

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
  description: 'Heading style applied to "Important: public information" in 1 callout box.',
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
function makeFullDocxZip(opts: {
  documentXml?: string;
  includeImage?: boolean;
} = {}): JSZip {
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
    const zip = makeFullDocxZip({ includeImage: true });
    const inputFiles = new Set(Object.keys(zip.files).filter(k => !zip.files[k]!.dir));

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);
    const outputFiles = new Set(Object.keys(outZip.files).filter(k => !outZip.files[k]!.dir));

    for (const path of inputFiles) {
      expect(outputFiles.has(path), `Missing from output: ${path}`).toBe(true);
    }
  });

  it('zero-change round-trip: no extra files are added to the output', async () => {
    const zip = makeFullDocxZip({ includeImage: true });
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
    const zip = makeFullDocxZip();
    const originalSettings = await zip.file('word/settings.xml')!.async('string');

    const blob = await buildDocx(zip, [], []);
    const outZip = await JSZip.loadAsync(blob);

    const outputSettingsFile = outZip.file('word/settings.xml');
    expect(outputSettingsFile, 'word/settings.xml must be present in output').not.toBeNull();

    const outputSettings = await outputSettingsFile!.async('string');
    expect(outputSettings).toBe(originalSettings);
  });

  it('word/settings.xml contains compatibilityMode w:val="15" after round-trip', async () => {
    const zip = makeFullDocxZip();
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
    const zip = makeFullDocxZip({ includeImage: true });
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
    const zip = makeFullDocxZip();

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
    const zip = makeFullDocxZip();

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
    const zip = makeFullDocxZip();

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
    const zip = makeFullDocxZip();

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
    const zip = makeFullDocxZip();
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
    const zip = makeFullDocxZip();
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
    const zip = makeFullDocxZip();
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

// ─── XML declaration preservation (iOS compatibility) ─────────────────────────
//
// XMLSerializer.serializeToString() silently drops the
// <?xml version="1.0" encoding="UTF-8" standalone="yes"?> processing
// instruction.  Desktop Word auto-repairs missing declarations and opens the
// file anyway.  Word for iOS is strict: a missing declaration causes
// OfficeImportErrorDomain error 912 ("file is structurally corrupt").
//
// The serializeXml() helper in buildDocx.ts restores the declaration whenever
// the serializer omits it.  The tests below lock in that behaviour by
// triggering a real parse→modify→serialize cycle for each category of XML
// part that buildDocx can rewrite, then asserting the expected declaration is
// present in the output.  If serializeXml() is ever replaced with a bare
// XMLSerializer.serializeToString() call, every test in this suite will fail.

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Return the text content of a named file from a buildDocx output Blob. */
async function getPartText(blob: Blob, path: string): Promise<string> {
  const outZip = await JSZip.loadAsync(blob);
  const file = outZip.file(path);
  if (!file) throw new Error(`${path} missing from output ZIP`);
  return file.async('string');
}

describe('buildDocx — XML declaration preservation (iOS Word compatibility)', () => {
  // ── word/document.xml ────────────────────────────────────────────────────────

  it('document.xml retains the XML declaration after applyRemoveContentControls rewrites it', async () => {
    // applyRemoveContentControls runs unconditionally and rewrites document.xml
    // whenever the file contains <w:sdt> elements.
    const zip = new JSZip();
    zip.file('word/document.xml', [
      XML_DECL,
      `<w:document xmlns:w="${W_OOXML}"><w:body>`,
      `<w:sdt><w:sdtContent>`,
      `<w:p><w:r><w:t>inner text</w:t></w:r></w:p>`,
      `</w:sdtContent></w:sdt>`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));

    const blob = await buildDocx(zip, [], []);
    const xml = await getPartText(blob, 'word/document.xml');
    expect(xml.startsWith(XML_DECL), 'XML declaration must be present after content-control removal').toBe(true);
  });

  it('document.xml retains the XML declaration after applyDoublespaceFix rewrites it', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', [
      XML_DECL,
      `<w:document xmlns:w="${W_OOXML}"><w:body>`,
      `<w:p><w:r><w:t>two  spaces here</w:t></w:r></w:p>`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));

    const change: AutoAppliedChange = {
      ruleId: 'CLEAN-004',
      description: 'Double spaces removed.',
      targetField: 'text.doublespace',
    };

    const blob = await buildDocx(zip, [], [change]);
    const xml = await getPartText(blob, 'word/document.xml');
    expect(xml.startsWith(XML_DECL), 'XML declaration must be present after double-space fix').toBe(true);
  });

  it('document.xml retains the XML declaration after applyHeadingLeadingSpaceFix rewrites it', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', [
      XML_DECL,
      `<w:document xmlns:w="${W_OOXML}"><w:body>`,
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>`,
      `<w:r><w:t xml:space="preserve"> Leading space heading</w:t></w:r></w:p>`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));

    const change: AutoAppliedChange = {
      ruleId: 'CLEAN-008',
      description: 'Leading spaces removed.',
      targetField: 'heading.leadingspace',
    };

    const blob = await buildDocx(zip, [], [change]);
    const xml = await getPartText(blob, 'word/document.xml');
    expect(xml.startsWith(XML_DECL), 'XML declaration must be present after heading leading-space fix').toBe(true);
  });

  // ── [Content_Types].xml ───────────────────────────────────────────────────────

  it('[Content_Types].xml retains the XML declaration after applyAcceptTrackedChanges rewrites it', async () => {
    // applyAcceptTrackedChangesAndRemoveComments removes the /word/comments.xml
    // Override entry and rewrites [Content_Types].xml when a comments file exists.
    const zip = new JSZip();
    zip.file('word/document.xml', [
      XML_DECL,
      `<w:document xmlns:w="${W_OOXML}"><w:body>`,
      `<w:p><w:r><w:t>text</w:t></w:r></w:p>`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));
    zip.file('[Content_Types].xml', [
      XML_DECL,
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`,
      `</Types>`,
    ].join(''));
    zip.file('word/comments.xml', [
      XML_DECL,
      `<w:comments xmlns:w="${W_OOXML}"/>`,
    ].join(''));

    const change: AutoAppliedChange = {
      ruleId: 'CLEAN-008',
      description: 'Accept tracked changes.',
      targetField: 'doc.acceptchanges',
    };

    const blob = await buildDocx(zip, [], [change]);
    const xml = await getPartText(blob, '[Content_Types].xml');
    expect(xml.startsWith(XML_DECL), 'XML declaration must be present in [Content_Types].xml after rewrite').toBe(true);
  });

  // ── word/_rels/document.xml.rels ─────────────────────────────────────────────

  it('word/_rels/document.xml.rels retains the XML declaration after applyEmailMailtoFixes rewrites it', async () => {
    // applyEmailMailtoFixes appends mailto Relationship entries and always
    // rewrites word/_rels/document.xml.rels when an email change is present.
    const zip = new JSZip();
    zip.file('word/document.xml', [
      XML_DECL,
      `<w:document xmlns:w="${W_OOXML}"><w:body>`,
      `<w:p><w:r><w:t>contact@example.gov for info</w:t></w:r></w:p>`,
      `<w:sectPr/></w:body></w:document>`,
    ].join(''));
    zip.file('word/_rels/document.xml.rels', [
      XML_DECL,
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    ].join(''));

    const change: AutoAppliedChange = {
      ruleId: 'LINK-008',
      description: 'Email converted to mailto hyperlink.',
      targetField: 'email.mailto',
      value: 'contact@example.gov',
    };

    const blob = await buildDocx(zip, [], [change]);
    const xml = await getPartText(blob, 'word/_rels/document.xml.rels');
    expect(xml.startsWith(XML_DECL), 'XML declaration must be present in document.xml.rels after rewrite').toBe(true);
  });
});

// ─── applyUniversalInstructionBoxRemoval (CLEAN-018) ─────────────────────────

const W_NS_C18 = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeUniversalInstructionBoxDocXml(opts: {
  firstParaText?: string;
  cellCount?: number;
  extraParaAfter?: string;
}): string {
  const {
    firstParaText = 'DGHT-SPECIFIC INSTRUCTIONS: Review before submission.',
    cellCount = 1,
    extraParaAfter,
  } = opts;
  const extraCells = Array.from({ length: cellCount - 1 })
    .map(() => `<w:tc><w:p><w:r><w:t>extra</w:t></w:r></w:p></w:tc>`)
    .join('');
  const afterPara = extraParaAfter
    ? `<w:p><w:r><w:t>${extraParaAfter}</w:t></w:r></w:p>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_C18}"><w:body>` +
    `<w:tbl><w:tr>` +
    `<w:tc><w:p><w:r><w:t>${firstParaText}</w:t></w:r></w:p></w:tc>` +
    extraCells +
    `</w:tr></w:tbl>` +
    afterPara +
    `<w:sectPr/></w:body></w:document>`
  );
}

const UNIVERSAL_IB_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-018',
  description: '1 instruction box removed.',
  targetField: 'struct.universal.removeinstructionboxes',
  value: '1',
};

describe('buildDocx — CLEAN-018: universal instruction box removal', () => {
  it('removes a single-cell table whose first paragraph contains "DGHT-SPECIFIC INSTRUCTIONS"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeUniversalInstructionBoxDocXml({}));

    const outXml = await getOutputDocXml(zip, [], [UNIVERSAL_IB_CHANGE]);

    expect(outXml).not.toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).not.toContain('w:tbl');
  });

  it('removes a single-cell table whose first paragraph contains "instructions" (generic)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeUniversalInstructionBoxDocXml({
      firstParaText: 'Instructions: Read carefully before proceeding.',
    }));

    const outXml = await getOutputDocXml(zip, [], [UNIVERSAL_IB_CHANGE]);

    expect(outXml).not.toContain('Instructions:');
    expect(outXml).not.toContain('w:tbl');
  });

  it('preserves surrounding paragraphs when removing the instruction box', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeUniversalInstructionBoxDocXml({ extraParaAfter: 'Keep this paragraph.' })
    );

    const outXml = await getOutputDocXml(zip, [], [UNIVERSAL_IB_CHANGE]);

    expect(outXml).not.toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('Keep this paragraph.');
  });

  it('does not remove a multi-cell table even when first paragraph contains "instructions"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeUniversalInstructionBoxDocXml({ cellCount: 2 }));

    const outXml = await getOutputDocXml(zip, [], [UNIVERSAL_IB_CHANGE]);

    expect(outXml).toContain('DGHT-SPECIFIC INSTRUCTIONS');
    expect(outXml).toContain('w:tbl');
  });

  it('does not modify the document when targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeUniversalInstructionBoxDocXml({}));

    const outXml = await getOutputDocXml(zip, [], []);

    expect(outXml).toContain('DGHT-SPECIFIC INSTRUCTIONS');
  });
});

// ─── ATTACH-001: Required. paragraph positioning ──────────────────────────────

const ATTACH_001_CHANGE: AutoAppliedChange = {
  ruleId: 'ATTACH-001',
  description: 'Required. paragraph position normalized in Attachments h5 blocks.',
  targetField: 'struct.attachments.required.position',
  value: '1',
};

/**
 * Build a minimal document.xml with:
 *   h4 "Attachments"
 *     h5 "Organizational chart"
 *       [optionally some other content first]
 *       Required.  (bold)
 */
function makeAttach001DocXml(requiredIsFirst: boolean): string {
  const h4 = `<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>Attachments</w:t></w:r></w:p>`;
  const h5 = `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>Organizational chart</w:t></w:r></w:p>`;
  const other = `<w:p><w:r><w:t>File name: Org Chart</w:t></w:r></w:p>`;
  const required = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Required.</w:t></w:r></w:p>`;
  const body = requiredIsFirst
    ? `${h4}${h5}${required}${other}`
    : `${h4}${h5}${other}${required}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`
  );
}

function makeAttach001ListDocXml(): string {
  const h4 = `<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>Attachments</w:t></w:r></w:p>`;
  const h5 = `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>Organizational chart</w:t></w:r></w:p>`;
  const other = `<w:p><w:r><w:t>File name: Org Chart</w:t></w:r></w:p>`;
  // Required. with numPr (list item)
  const required = `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Required.</w:t></w:r></w:p>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>${h4}${h5}${other}${required}<w:sectPr/></w:body></w:document>`
  );
}

describe('buildDocx — ATTACH-001: Required. paragraph positioning', () => {
  it('moves Required. to first position under h5 when it follows other content', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach001DocXml(false));

    const outXml = await getOutputDocXml(zip, [], [ATTACH_001_CHANGE]);

    // Required. should appear before "File name:" in the output
    const requiredPos = outXml.indexOf('>Required.</w:t>');
    const fileNamePos = outXml.indexOf('>File name: Org Chart</w:t>');
    expect(requiredPos).toBeGreaterThan(-1);
    expect(fileNamePos).toBeGreaterThan(-1);
    expect(requiredPos).toBeLessThan(fileNamePos);
  });

  it('leaves document unchanged when Required. is already first', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach001DocXml(true));

    const originalXml = makeAttach001DocXml(true);
    const outXml = await getOutputDocXml(zip, [], [ATTACH_001_CHANGE]);

    // Required. should still be before "File name:"
    const requiredPos = outXml.indexOf('>Required.</w:t>');
    const fileNamePos = outXml.indexOf('>File name: Org Chart</w:t>');
    expect(requiredPos).toBeLessThan(fileNamePos);
    // The document XML content should be unchanged (serializeXml is not called)
    expect(outXml).toContain(originalXml.slice(originalXml.indexOf('<w:body>')));
  });

  it('does not reorder Required. when it is a list item (numPr)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach001ListDocXml());

    const outXml = await getOutputDocXml(zip, [], [ATTACH_001_CHANGE]);

    // Required. should still be AFTER "File name:" (not moved)
    const requiredPos = outXml.indexOf('>Required.</w:t>');
    const fileNamePos = outXml.indexOf('>File name: Org Chart</w:t>');
    expect(requiredPos).toBeGreaterThan(fileNamePos);
  });

  it('makes no change when no Attachments h4 exists', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>No attachments section here.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [ATTACH_001_CHANGE]);
    expect(outXml).toContain('No attachments section here.');
  });
});

// ─── ATTACH-002: File name sentence case ─────────────────────────────────────

const ATTACH_002_CHANGE: AutoAppliedChange = {
  ruleId: 'ATTACH-002',
  description: 'File name values in Attachments h5 blocks normalized to sentence case.',
  targetField: 'struct.attachments.filename.sentencecase',
  value: '1',
};

function makeAttach002DocXml(fileNameValue: string, multiRun = false): string {
  const h4 = `<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>Attachments</w:t></w:r></w:p>`;
  const h5 = `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>Organizational chart</w:t></w:r></w:p>`;

  const fileNamePara = multiRun
    ? `<w:p>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>File name:</w:t></w:r>` +
      `<w:r><w:t xml:space="preserve"> ${fileNameValue.split(' ')[0] ?? ''}</w:t></w:r>` +
      `<w:r><w:t xml:space="preserve"> ${fileNameValue.split(' ').slice(1).join(' ')}</w:t></w:r>` +
      `</w:p>`
    : `<w:p>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>File name:</w:t></w:r>` +
      `<w:r><w:t xml:space="preserve"> ${fileNameValue}</w:t></w:r>` +
      `</w:p>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>${h4}${h5}${fileNamePara}<w:sectPr/></w:body></w:document>`
  );
}

describe('buildDocx — ATTACH-002: File name sentence case', () => {
  it('converts "Organizational Chart" to "Organizational chart"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach002DocXml('Organizational Chart'));

    const outXml = await getOutputDocXml(zip, [], [ATTACH_002_CHANGE]);

    expect(outXml).toContain('Organizational chart');
    expect(outXml).not.toContain('Organizational Chart');
    // Bold "File name:" label must be unchanged
    expect(outXml).toContain('>File name:</w:t>');
  });

  it('does not modify a value containing a 2+ char all-caps acronym', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach002DocXml('DMP Plan'));

    const outXml = await getOutputDocXml(zip, [], [ATTACH_002_CHANGE]);

    expect(outXml).toContain('DMP Plan');
    expect(outXml).not.toContain('Dmp plan');
  });

  it('leaves an already-correct sentence-case value unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach002DocXml('Organizational chart'));

    const outXml = await getOutputDocXml(zip, [], [ATTACH_002_CHANGE]);

    expect(outXml).toContain('Organizational chart');
  });

  it('merges multi-run value into single run with sentence case applied', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAttach002DocXml('Organizational Chart', true));

    const outXml = await getOutputDocXml(zip, [], [ATTACH_002_CHANGE]);

    expect(outXml).toContain('Organizational chart');
    // The multi-run "Chart" text node should no longer appear separately
    expect(outXml).not.toContain('>Chart</w:t>');
  });

  it('makes no change when no Attachments h4 exists', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body><w:p><w:r><w:t>No attachments section.</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [ATTACH_002_CHANGE]);
    expect(outXml).toContain('No attachments section.');
  });
});

// ─── applyBoldColonFix (CLEAN-019) ───────────────────────────────────────────

const W_NS_COLON = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeColonDocXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_COLON}">` +
    `<w:body>${body}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const BOLD_COLON_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-019',
  description: 'Bold removed from 1 colon run following non-bold text.',
  targetField: 'text.colon.unbold',
};

describe('buildDocx — CLEAN-019: bold colon run removal', () => {
  it('removes w:b from a sole-colon run preceded by a non-bold run', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Section Title</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>:</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeColonDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [BOLD_COLON_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    expect(runs).toHaveLength(2);

    const colonRun = runs[1]!;
    const rPr = Array.from(colonRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(colonRun.getElementsByTagName('w:t')[0]?.textContent).toBe(':');
  });

  it('removes both w:b and w:bCs when both are present on the colon run', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Label</w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>:</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeColonDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [BOLD_COLON_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    const colonRun = runs[1]!;
    const rPr = Array.from(colonRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(0);
    expect(rPr?.getElementsByTagName('w:bCs').length ?? 0).toBe(0);
  });

  it('does not modify the document when the preceding run is also bold', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>Bold Title</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>:</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeColonDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [BOLD_COLON_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    expect(runs).toHaveLength(2);
    const colonRun = runs[1]!;
    const rPr = Array.from(colonRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });

  it('does not modify a bold run whose text is "Section:" (not solely ":")', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Before</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>Section:</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeColonDocXml(body));

    const outXml = await getOutputDocXml(zip, [], [BOLD_COLON_CHANGE]);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    expect(runs).toHaveLength(2);
    const longRun = runs[1]!;
    const rPr = Array.from(longRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });

  it('does not apply the patch when targetField is absent from autoAppliedChanges', async () => {
    const body =
      `<w:p>` +
      `<w:r><w:t>Title</w:t></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>:</w:t></w:r>` +
      `</w:p>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeColonDocXml(body));

    const outXml = await getOutputDocXml(zip, [], []);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(outXml, 'application/xml');

    const [wP] = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const runs = Array.from(wP!.childNodes).filter(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:r'
    ) as Element[];
    const colonRun = runs[1]!;
    const rPr = Array.from(colonRun.childNodes).find(
      n => n.nodeType === 1 && (n as Element).tagName === 'w:rPr'
    ) as Element | undefined;
    // Bold should still be present — patch was not triggered
    expect(rPr?.getElementsByTagName('w:b').length ?? 0).toBe(1);
  });
});

// ─── CLEAN-020: Remove SAMHSA H1 divider lines ───────────────────────────────

const W_NS_SAMHSA = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Build a heading paragraph element string for use in SAMHSA tests. */
function makeSamhsaH1(text: string): string {
  return (
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

/** Build a plain body paragraph for use in SAMHSA tests. */
function makeSamhsaBodyPara(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

/** Build a minimal document.xml wrapping the given inner body content. */
function makeSamhsaDocXml(innerBody: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_SAMHSA}">` +
    `<w:body>${innerBody}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const H1_DIVIDERS_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-020',
  description: 'SAMHSA H1 divider lines removed.',
  targetField: 'samhsa.h1.dividers.remove',
};

describe('buildDocx — CLEAN-020: SAMHSA H1 divider removal', () => {
  it('removes an underscore-only H1 that appears after the "Step 1:" anchor', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('Step 1: Review the Opportunity') +
      makeSamhsaBodyPara('Body text.') +
      makeSamhsaH1('___________________________')
    ));

    const outXml = await getOutputDocXml(zip, [], [H1_DIVIDERS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('Step 1: Review the Opportunity');
    expect(texts).toContain('Body text.');
    expect(texts.some(t => /^[_\s]+$/.test(t) && t.includes('_'))).toBe(false);
  });

  it('removes multiple underscore H1 paragraphs after the anchor', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('Step 1: Review the Opportunity') +
      makeSamhsaH1('___________') +
      makeSamhsaH1('Step 2: Review Eligibility') +
      makeSamhsaH1('___________')
    ));

    const outXml = await getOutputDocXml(zip, [], [H1_DIVIDERS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('Step 1: Review the Opportunity');
    expect(texts).toContain('Step 2: Review Eligibility');
    expect(texts.filter(t => /^[_\s]+$/.test(t) && t.includes('_'))).toHaveLength(0);
  });

  it('preserves regular H1 headings after the anchor', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('Step 1: Review the Opportunity') +
      makeSamhsaH1('___________') +
      makeSamhsaH1('Step 2: Review Eligibility') +
      makeSamhsaBodyPara('Eligible applicants...')
    ));

    const outXml = await getOutputDocXml(zip, [], [H1_DIVIDERS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('Step 2: Review Eligibility');
    expect(texts).toContain('Eligible applicants...');
  });

  it('does NOT remove underscore H1s that appear before the "Step 1:" anchor', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('___________') +
      makeSamhsaH1('Step 1: Review the Opportunity') +
      makeSamhsaBodyPara('Body text.')
    ));

    const outXml = await getOutputDocXml(zip, [], [H1_DIVIDERS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // The pre-anchor divider must survive
    expect(texts.some(t => /^[_\s]+$/.test(t) && t.includes('_'))).toBe(true);
  });

  it('does nothing when no "Step 1:" H1 exists in the document', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('Introduction') +
      makeSamhsaH1('___________')
    ));

    const outXml = await getOutputDocXml(zip, [], [H1_DIVIDERS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // Without the anchor, even a divider-shaped H1 must survive
    expect(texts.some(t => /^[_\s]+$/.test(t) && t.includes('_'))).toBe(true);
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('Step 1: Review the Opportunity') +
      makeSamhsaH1('___________')
    ));

    const outXml = await getOutputDocXml(zip, [], []);
    const texts = extractParagraphTexts(outXml);
    // Divider must be untouched when the change is not flagged
    expect(texts.some(t => /^[_\s]+$/.test(t) && t.includes('_'))).toBe(true);
  });
});

// ─── CLEAN-021: Fix "SAMSHA" misspelling ─────────────────────────────────────

const SAMSHA_FIX_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-021',
  description: '"SAMSHA" corrected to "SAMHSA".',
  targetField: 'samhsa.misspelling.samsha',
};

describe('buildDocx — CLEAN-021: SAMSHA misspelling fix', () => {
  it('replaces "SAMSHA" with "SAMHSA" in a plain body paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('Contact SAMSHA for more information.')
    ));

    const outXml = await getOutputDocXml(zip, [], [SAMSHA_FIX_CHANGE]);
    expect(outXml).toContain('SAMHSA');
    expect(outXml).not.toContain('>Contact SAMSHA');
  });

  it('replaces all occurrences of "SAMSHA" within a single paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('SAMSHA is the funder. Contact SAMSHA directly.')
    ));

    const outXml = await getOutputDocXml(zip, [], [SAMSHA_FIX_CHANGE]);
    expect(outXml).not.toContain('SAMSHA');
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('SAMHSA is the funder. Contact SAMHSA directly.');
  });

  it('does NOT replace "SAMSHA" in a Heading1 paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('SAMSHA Grant Announcement')
    ));

    const outXml = await getOutputDocXml(zip, [], [SAMSHA_FIX_CHANGE]);
    // Heading text must remain unchanged
    expect(outXml).toContain('SAMSHA Grant Announcement');
  });

  it('leaves "SAMHSA" (correct spelling) unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('Funded by SAMHSA.')
    ));

    const outXml = await getOutputDocXml(zip, [], [SAMSHA_FIX_CHANGE]);
    expect(outXml).toContain('Funded by SAMHSA.');
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('Contact SAMSHA for more information.')
    ));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('SAMSHA');
    expect(outXml).not.toContain('SAMHSA');
  });

  it('does not replace text inside hyperlink URL targets (relationship attributes)', async () => {
    // URL targets live in relationship XML, not in w:t elements — the fix
    // must never touch them. This test verifies the w:t-only replacement
    // leaves the relationship href attribute untouched.
    const relsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"` +
      ` Target="https://www.SAMSHA.gov/grants" TargetMode="External"/>` +
      `</Relationships>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      `<w:p><w:hyperlink r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:r><w:t>Visit the SAMSHA website</w:t></w:r></w:hyperlink></w:p>`
    ));
    zip.file('word/_rels/document.xml.rels', relsXml);

    const outXml = await getOutputDocXml(zip, [], [SAMSHA_FIX_CHANGE]);
    // The display text in the w:t run is fixed...
    expect(outXml).toContain('>Visit the SAMHSA website</w:t>');
    // ...but the relationship file is untouched (the URL is not in document.xml w:t)
    const outZip = await JSZip.loadAsync(
      await buildDocx(zip, [], [SAMSHA_FIX_CHANGE])
    );
    const relsFile = outZip.file('word/_rels/document.xml.rels');
    const relsOut = relsFile ? await relsFile.async('string') : '';
    expect(relsOut).toContain('SAMSHA.gov');
  });
});

// ─── CLEAN-022: Normalize "NOTE:" to "Note:" ─────────────────────────────────

const NOTE_NORMALIZE_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-022',
  description: '"NOTE:" normalized to "Note:".',
  targetField: 'samhsa.note.capitalize',
};

describe('buildDocx — CLEAN-022: NOTE: normalization', () => {
  it('replaces "NOTE:" with "Note:" in a plain body paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('NOTE: Applicants must submit by the deadline.')
    ));

    const outXml = await getOutputDocXml(zip, [], [NOTE_NORMALIZE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Note: Applicants must submit by the deadline.');
  });

  it('replaces all occurrences of "NOTE:" within a single paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('NOTE: First note. NOTE: Second note.')
    ));

    const outXml = await getOutputDocXml(zip, [], [NOTE_NORMALIZE_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Note: First note. Note: Second note.');
    expect(outXml).not.toContain('NOTE:');
  });

  it('does NOT replace "NOTE:" in a Heading1 paragraph', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaH1('NOTE: Important Requirement')
    ));

    const outXml = await getOutputDocXml(zip, [], [NOTE_NORMALIZE_CHANGE]);
    expect(outXml).toContain('NOTE: Important Requirement');
  });

  it('leaves "Note:" (sentence case) unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('Note: Please read the instructions.')
    ));

    const outXml = await getOutputDocXml(zip, [], [NOTE_NORMALIZE_CHANGE]);
    expect(outXml).toContain('Note: Please read the instructions.');
  });

  it('leaves "note:" (all lowercase) unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('See the note: this is important.')
    ));

    const outXml = await getOutputDocXml(zip, [], [NOTE_NORMALIZE_CHANGE]);
    expect(outXml).toContain('note:');
    expect(outXml).not.toContain('Note:');
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSamhsaDocXml(
      makeSamhsaBodyPara('NOTE: This should not be changed.')
    ));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('NOTE:');
    expect(outXml).not.toContain('Note:');
  });
});

// ─── ACL OOXML helpers ────────────────────────────────────────────────────────

const W_NS_ACL = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeAclH2(text: string): string {
  return (
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r>` +
    `</w:p>`
  );
}

function makeAclBodyPara(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function makeAclDocXml(innerBody: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_ACL}">` +
    `<w:body>${innerBody}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

// ─── CLEAN-023: Add Telephone: prefix to bare phone numbers ──────────────────

const TELEPHONE_PREFIX_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-023',
  description: '1 bare phone number labeled.',
  targetField: 'acl.telephone.prefix',
  value: '1',
};

describe('buildDocx — CLEAN-023: ACL telephone prefix', () => {
  it('prepends "Telephone: " to a bare NNN-NNN-NNNN number under Agency contacts', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Agency contacts') +
      makeAclBodyPara('555-123-4567')
    ));

    const outXml = await getOutputDocXml(zip, [], [TELEPHONE_PREFIX_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('Telephone: 555-123-4567');
  });

  it('sets xml:space="preserve" on the modified w:t element', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Agency contacts') +
      makeAclBodyPara('555-123-4567')
    ));

    const outXml = await getOutputDocXml(zip, [], [TELEPHONE_PREFIX_CHANGE]);
    expect(outXml).toMatch(/xml:space="preserve"[^>]*>Telephone: 555-123-4567/);
  });

  it('does not modify a phone number already labeled "Telephone:"', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Agency contacts') +
      makeAclBodyPara('Telephone: 555-123-4567')
    ));

    const outXml = await getOutputDocXml(zip, [], [TELEPHONE_PREFIX_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('Telephone: 555-123-4567');
    // Ensure it wasn't double-labeled
    expect(texts.filter(t => t.includes('Telephone:')).length).toBe(1);
    expect(outXml).not.toContain('Telephone: Telephone:');
  });

  it('does not modify a phone number outside the Agency contacts section', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Program description') +
      makeAclBodyPara('555-123-4567') +
      makeAclH2('Agency contacts') +
      makeAclBodyPara('Jane Smith')
    ));

    const outXml = await getOutputDocXml(zip, [], [TELEPHONE_PREFIX_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('555-123-4567');
    expect(texts).not.toContain('Telephone: 555-123-4567');
  });

  it('stops modifying at the next same-level heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Agency contacts') +
      makeAclBodyPara('555-123-4567') +
      makeAclH2('Funding details') +
      makeAclBodyPara('555-987-6543')
    ));

    const outXml = await getOutputDocXml(zip, [], [TELEPHONE_PREFIX_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // Phone inside Agency contacts is labeled
    expect(texts).toContain('Telephone: 555-123-4567');
    // Phone after the next heading is untouched
    expect(texts).toContain('555-987-6543');
    expect(texts).not.toContain('Telephone: 555-987-6543');
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Agency contacts') +
      makeAclBodyPara('555-123-4567')
    ));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('555-123-4567');
    expect(outXml).not.toContain('Telephone:');
  });
});

// ─── CLEAN-024: Add OpDiv/Agency labels in Basic information ─────────────────

const BASIC_INFO_LABELS_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-024',
  description: 'OpDiv: and Agency: labels added.',
  targetField: 'acl.basic.info.labels',
  value: '2',
};

describe('buildDocx — CLEAN-024: ACL Basic information labels', () => {
  it('prepends "OpDiv: " to a bare ACL full name', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Administration for Community Living')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('OpDiv: Administration for Community Living');
  });

  it('sets xml:space="preserve" on the OpDiv: w:t element', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Administration for Community Living')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    expect(outXml).toMatch(/xml:space="preserve"[^>]*>OpDiv: Administration for Community Living/);
  });

  it('prepends "Agency: " to the unlabeled paragraph following the ACL name', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Administration for Community Living') +
      makeAclBodyPara('ACL Regional Office')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('OpDiv: Administration for Community Living');
    expect(texts).toContain('Agency: ACL Regional Office');
  });

  it('sets xml:space="preserve" on the Agency: w:t element', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Administration for Community Living') +
      makeAclBodyPara('ACL Regional Office')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    expect(outXml).toMatch(/xml:space="preserve"[^>]*>Agency: ACL Regional Office/);
  });

  it('prepends only "Agency: " when OpDiv: is already labeled', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('OpDiv: Administration for Community Living') +
      makeAclBodyPara('ACL Regional Office')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('OpDiv: Administration for Community Living');
    expect(texts).toContain('Agency: ACL Regional Office');
    // OpDiv: must not be doubled
    expect(outXml).not.toContain('OpDiv: OpDiv:');
  });

  it('does nothing when both OpDiv: and Agency: are already present', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('OpDiv: Administration for Community Living') +
      makeAclBodyPara('Agency: ACL Regional Office')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts).toContain('OpDiv: Administration for Community Living');
    expect(texts).toContain('Agency: ACL Regional Office');
    expect(outXml).not.toContain('OpDiv: OpDiv:');
    expect(outXml).not.toContain('Agency: Agency:');
  });

  it('does not modify content outside the Basic information section', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Program description') +
      makeAclBodyPara('Administration for Community Living') +
      makeAclH2('Basic information') +
      makeAclBodyPara('Opportunity name: Sample NOFO')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // ACL name outside Basic information must not be labeled
    expect(texts).toContain('Administration for Community Living');
    expect(texts).not.toContain('OpDiv: Administration for Community Living');
  });

  it('stops at the next same-level heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Opportunity name: Sample NOFO') +
      makeAclH2('Funding details') +
      makeAclBodyPara('Administration for Community Living')
    ));

    const outXml = await getOutputDocXml(zip, [], [BASIC_INFO_LABELS_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // ACL name after the next heading must not be labeled
    expect(texts).toContain('Administration for Community Living');
    expect(texts).not.toContain('OpDiv: Administration for Community Living');
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAclDocXml(
      makeAclH2('Basic information') +
      makeAclBodyPara('Administration for Community Living') +
      makeAclBodyPara('ACL Regional Office')
    ));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(outXml).toContain('Administration for Community Living');
    expect(outXml).not.toContain('OpDiv:');
    expect(outXml).not.toContain('Agency:');
  });
});

// ─── applyIntergovernmentalReviewSentenceCaseFix (HEAD-007) ──────────────────

const W_NS_IGR = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeIgrDocXml(headingLevel: number, runs: string[]): string {
  const wRuns = runs
    .map(text => `<w:r><w:t>${text}</w:t></w:r>`)
    .join('');
  const heading =
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${headingLevel}"/></w:pPr>` +
    wRuns +
    `</w:p>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_IGR}">` +
    `<w:body>${heading}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const IGR_CHANGE: AutoAppliedChange = {
  ruleId: 'HEAD-007',
  description: '"Intergovernmental Review" heading corrected to sentence case.',
  targetField: 'heading.intergovernmentalreview.sentencecase',
  value: '1',
};

describe('buildDocx — HEAD-007: Intergovernmental Review → sentence case', () => {
  it('corrects "Intergovernmental Review" in an H2 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(2, ['Intergovernmental Review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('corrects "Intergovernmental Review" in an H3 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(3, ['Intergovernmental Review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('corrects "Intergovernmental Review" in an H4 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(4, ['Intergovernmental Review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('corrects a multi-run heading (text split across two w:t nodes)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(3, ['Intergovernmental ', 'Review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('corrects any capitalisation variant (all-uppercase)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(2, ['INTERGOVERNMENTAL REVIEW']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('leaves an already-correct heading unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(3, ['Intergovernmental review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');
  });

  it('does not apply when autoAppliedChanges does not include the targetField', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(2, ['Intergovernmental Review']));

    const outXml = await getOutputDocXml(zip, [], []);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental Review');
  });

  it('does not modify headings outside H2–H4 (e.g. H1)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeIgrDocXml(1, ['Intergovernmental Review']));

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental Review');
  });

  it('corrects a heading whose single run has a leading space (xml:space="preserve")', async () => {
    const W = W_NS_IGR;
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve"> Intergovernmental Review</w:t></w:r>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // The leading space is preserved; only 'R'→'r' is changed
    expect(texts[0]).toBe(' Intergovernmental review');
  });

  it('corrects a heading whose single run has a trailing space (xml:space="preserve")', async () => {
    const W = W_NS_IGR;
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">Intergovernmental Review </w:t></w:r>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);
    const texts = extractParagraphTexts(outXml);
    // The trailing space is preserved; only 'R'→'r' is changed
    expect(texts[0]).toBe('Intergovernmental review ');
  });

  it('preserves run boundaries when text is split across runs with different formatting', async () => {
    // Simulate a heading where the two words are in separate runs with different
    // w:rPr (e.g. first run bold). The fix must only change 'R'→'r' in the
    // second run, leaving the first run's text and both runs' <w:rPr> intact.
    const W = W_NS_IGR;
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Intergovernmental </w:t></w:r>` +
      `<w:r><w:rPr><w:i/></w:rPr><w:t>Review</w:t></w:r>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [IGR_CHANGE]);

    // Combined text is correct
    const texts = extractParagraphTexts(outXml);
    expect(texts[0]).toBe('Intergovernmental review');

    // The bold run still contains only the first word (not the whole replacement)
    const parser = new DOMParser();
    const doc = parser.parseFromString(outXml, 'application/xml');
    const runs = Array.from(doc.getElementsByTagName('w:r'));
    const boldRun = runs.find(r => r.getElementsByTagName('w:b').length > 0);
    const italicRun = runs.find(r => r.getElementsByTagName('w:i').length > 0);
    expect(boldRun?.getElementsByTagName('w:t')[0]?.textContent).toBe('Intergovernmental ');
    expect(italicRun?.getElementsByTagName('w:t')[0]?.textContent).toBe('review');
  });
});

// ─── applyAgencyPrioritiesSentenceCaseFix (HEAD-006) ─────────────────────────

function makeAgencyPrioritiesDocXml(headingLevel: number, runs: string[]): string {
  const wRuns = runs.map(text => `<w:r><w:t>${text}</w:t></w:r>`).join('');
  const heading =
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Heading${headingLevel}"/></w:pPr>` +
    wRuns +
    `</w:p>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS_IGR}">` +
    `<w:body>${heading}<w:sectPr/></w:body>` +
    `</w:document>`
  );
}

const AGENCY_PRIORITIES_CHANGE: AutoAppliedChange = {
  ruleId: 'HEAD-006',
  description: '"Agency Priorities" heading corrected to sentence case.',
  targetField: 'heading.agencypriorities.sentencecase',
  value: '1',
};

describe('buildDocx — HEAD-006: Agency Priorities → sentence case', () => {
  it('corrects "Agency Priorities" in an H1 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(1, ['Agency Priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities');
  });

  it('corrects "Agency Priorities" in an H2 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(2, ['Agency Priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities');
  });

  it('corrects "Agency Priorities" in an H3 single-run heading', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(3, ['Agency Priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities');
  });

  it('corrects a multi-run heading (text split across two w:t nodes)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(2, ['Agency ', 'Priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities');
  });

  it('corrects a heading with a leading space (xml:space="preserve")', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_IGR}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve"> Agency Priorities</w:t></w:r>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    // Leading space preserved; only 'P'→'p' changed
    expect(extractParagraphTexts(outXml)[0]).toBe(' Agency priorities');
  });

  it('corrects a heading with a trailing space (xml:space="preserve")', async () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS_IGR}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">Agency Priorities </w:t></w:r>` +
      `</w:p>` +
      `<w:sectPr/>` +
      `</w:body>` +
      `</w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    // Trailing space preserved; only 'P'→'p' changed
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities ');
  });

  it('leaves an already-correct heading unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(2, ['Agency priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency priorities');
  });

  it('does not apply when autoAppliedChanges does not include the targetField', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(2, ['Agency Priorities']));

    const outXml = await getOutputDocXml(zip, [], []);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency Priorities');
  });

  it('does not modify H4 headings (outside H1–H3 range)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeAgencyPrioritiesDocXml(4, ['Agency Priorities']));

    const outXml = await getOutputDocXml(zip, [], [AGENCY_PRIORITIES_CHANGE]);
    expect(extractParagraphTexts(outXml)[0]).toBe('Agency Priorities');
  });
});

// ─── CDC-001: Financial capability statement internal link ────────────────────

/** Build a minimal document.xml for CDC-001 tests. */
function makeCdcFinancialCapabilityDocXml(opts: {
  includeTargetBullet?: boolean;
  bulletAlreadyLinked?: boolean;
  bulletOutsideSection?: boolean;
}): string {
  const { includeTargetBullet = true, bulletAlreadyLinked = false, bulletOutsideSection = false } = opts;

  const bulletPara = bulletAlreadyLinked
    ? `<w:p>
        <w:hyperlink w:anchor="Financial_capability_statement">
          <w:r><w:t>Financial capability statement</w:t></w:r>
        </w:hyperlink>
       </w:p>`
    : `<w:p><w:r><w:t>Financial capability statement</w:t></w:r></w:p>`;

  const inSection = includeTargetBullet && !bulletOutsideSection ? bulletPara : '';
  const outSection = bulletOutsideSection ? bulletPara : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Project narrative</w:t></w:r></w:p>` +
    inSection +
    `<w:p><w:r><w:t>Some other text</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Next section</w:t></w:r></w:p>` +
    outSection +
    `<w:sectPr/>` +
    `</w:body>` +
    `</w:document>`
  );
}

const CDC_001_CHANGE: AutoAppliedChange = {
  ruleId: 'CDC-001',
  description: 'Internal link added to "Financial capability statement" bullet.',
  targetField: 'cdc.financial.capability.link',
  value: 'Financial_capability_statement',
};

describe('buildDocx — CDC-001: Financial capability statement internal link', () => {
  it('wraps the bullet run in w:hyperlink w:anchor when all conditions are met', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeCdcFinancialCapabilityDocXml({}));

    const outXml = await getOutputDocXml(zip, [], [CDC_001_CHANGE]);

    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    const internalLinks = hyperlinks.filter(h => {
      const anchor = h.getAttribute('w:anchor') ?? h.getAttributeNS(W_NS, 'anchor');
      return anchor === 'Financial_capability_statement';
    });
    expect(internalLinks).toHaveLength(1);

    // The link should contain the original text
    const linkText = Array.from(internalLinks[0]!.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('');
    expect(linkText).toBe('Financial capability statement');
  });

  it('adds the Hyperlink character style to runs inside the new hyperlink', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeCdcFinancialCapabilityDocXml({}));

    const outXml = await getOutputDocXml(zip, [], [CDC_001_CHANGE]);

    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    const link = hyperlinks.find(h => {
      const anchor = h.getAttribute('w:anchor') ?? h.getAttributeNS(W_NS, 'anchor');
      return anchor === 'Financial_capability_statement';
    });
    expect(link).toBeDefined();
    const rStyles = Array.from(link!.getElementsByTagName('w:rStyle'));
    const hyperlinkStyle = rStyles.find(s => {
      const val = s.getAttribute('w:val') ?? s.getAttributeNS(W_NS, 'val');
      return val === 'Hyperlink';
    });
    expect(hyperlinkStyle).toBeDefined();
  });

  it('does not apply when the targetField is absent from autoAppliedChanges', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeCdcFinancialCapabilityDocXml({}));

    const outXml = await getOutputDocXml(zip, [], []);

    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(0);
  });

  it('does not add a hyperlink when the bullet paragraph is outside the Project narrative section', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeCdcFinancialCapabilityDocXml({ bulletOutsideSection: true }));

    const outXml = await getOutputDocXml(zip, [], [CDC_001_CHANGE]);

    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(xmlDoc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(0);
  });

  it('does nothing when no "Project narrative" H2 exists', async () => {
    const zip = new JSZip();
    // Document with no "Project narrative" heading
    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}"><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Background</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Financial capability statement</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`
    );

    const outXml = await getOutputDocXml(zip, [], [CDC_001_CHANGE]);
    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(outXml, 'application/xml');
    expect(Array.from(xmlDoc.getElementsByTagName('w:hyperlink'))).toHaveLength(0);
  });
});
