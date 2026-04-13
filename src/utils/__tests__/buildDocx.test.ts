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

// ─── LINK-006 cap-anchor auto-fix: hyperlink retargeting ─────────────────────

describe('buildDocx — LINK-006 cap-anchor auto-fix', () => {
  // NOTE: these tests check the RAW SERIALIZED XML string so they catch
  // XMLSerializer stripping the w: namespace prefix — the same rationale as
  // the link-text hyperlink-preservation tests above.

  function makeCapAnchorChange(pairs: { old: string; new: string }[]): AutoAppliedChange {
    return {
      ruleId: 'LINK-006',
      description: `${pairs.length} internal link anchor${pairs.length === 1 ? '' : 's'} corrected for capitalization`,
      targetField: 'link.anchor.cap',
      value: JSON.stringify(pairs),
    };
  }

  it('rewrites w:anchor from the old (lowercase) value to the correctly-cased new value', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'eligibility', linkText: 'link' }));

    const outXml = await getOutputDocXml(zip, [], [makeCapAnchorChange([{ old: 'eligibility', new: 'Eligibility' }])]);

    // The serialized XML must contain the namespace-prefixed attribute with the new value.
    expect(outXml).toMatch(/w:anchor="Eligibility"/);
    // The old value must no longer appear as a w:anchor value.
    expect(outXml).not.toMatch(/w:anchor="eligibility"/);
  });

  it('serialized XML retains the w: prefix on the rewritten anchor (namespace preservation)', async () => {
    // Regression: XMLSerializer may emit `anchor="…"` without the w: prefix when an
    // attribute is only read and never written through the DOM. setAttributeNS ensures
    // the prefix is preserved so Word can resolve the link target.
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'overview', linkText: 'link' }));

    const outXml = await getOutputDocXml(zip, [], [makeCapAnchorChange([{ old: 'overview', new: 'Overview' }])]);

    expect(outXml).toMatch(/w:anchor="Overview"/);
  });

  it('rewrites all hyperlinks that share the same old anchor', async () => {
    // Two hyperlinks with the same broken anchor in one document
    const twoLinkXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
      `<w:body>` +
      `<w:p><w:hyperlink w:anchor="eligibility" w:history="1"><w:r><w:t>first</w:t></w:r></w:hyperlink></w:p>` +
      `<w:p><w:hyperlink w:anchor="eligibility" w:history="1"><w:r><w:t>second</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', twoLinkXml);

    const outXml = await getOutputDocXml(zip, [], [makeCapAnchorChange([{ old: 'eligibility', new: 'Eligibility' }])]);

    const parser = new DOMParser();
    const doc = parser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(doc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(2);
    for (const hl of hyperlinks) {
      expect(hl.getAttributeNS(W_NS, 'anchor')).toBe('Eligibility');
    }
  });

  it('does not touch hyperlinks whose anchor does not match the old value', async () => {
    // Document has two internal hyperlinks; only one matches the cap-fix pair
    const mixedXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
      `<w:body>` +
      `<w:p><w:hyperlink w:anchor="eligibility" w:history="1"><w:r><w:t>link 1</w:t></w:r></w:hyperlink></w:p>` +
      `<w:p><w:hyperlink w:anchor="Overview" w:history="1"><w:r><w:t>link 2</w:t></w:r></w:hyperlink></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', mixedXml);

    const outXml = await getOutputDocXml(zip, [], [makeCapAnchorChange([{ old: 'eligibility', new: 'Eligibility' }])]);

    const parser = new DOMParser();
    const doc = parser.parseFromString(outXml, 'application/xml');
    const hyperlinks = Array.from(doc.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks[0]!.getAttributeNS(W_NS, 'anchor')).toBe('Eligibility'); // rewritten
    expect(hyperlinks[1]!.getAttributeNS(W_NS, 'anchor')).toBe('Overview');    // untouched
  });

  it('skips gracefully when value is malformed JSON — download still succeeds', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'eligibility', linkText: 'link' }));

    const badChange: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'cap fix',
      targetField: 'link.anchor.cap',
      value: 'NOT_VALID_JSON',
    };

    // Should not throw — download must complete even with a corrupt entry
    const outXml = await getOutputDocXml(zip, [], [badChange]);
    // Anchor unchanged because the bad entry was skipped
    expect(outXml).toMatch(/w:anchor="eligibility"/);
  });

  it('skips gracefully when value is a JSON non-array — download still succeeds', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeHyperlinkDocXml({ anchor: 'eligibility', linkText: 'link' }));

    const badChange: AutoAppliedChange = {
      ruleId: 'LINK-006',
      description: 'cap fix',
      targetField: 'link.anchor.cap',
      value: JSON.stringify({ old: 'eligibility', new: 'Eligibility' }), // object, not array
    };

    const outXml = await getOutputDocXml(zip, [], [badChange]);
    expect(outXml).toMatch(/w:anchor="eligibility"/); // unchanged, entry was skipped
  });
});
