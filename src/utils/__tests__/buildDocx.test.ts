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
