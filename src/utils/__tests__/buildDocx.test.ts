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
 * Run buildDocx and return the docProps/core.xml text from the output blob.
 */
async function getOutputCoreXml(
  zip: JSZip,
  acceptedFixes: AcceptedFix[] = []
): Promise<string> {
  const blob = await buildDocx(zip, acceptedFixes);
  const outZip = await JSZip.loadAsync(blob);
  const coreFile = outZip.file('docProps/core.xml');
  if (!coreFile) throw new Error('docProps/core.xml missing from output');
  return coreFile.async('string');
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

// ─── applyMetadataFixes — core.xml ───────────────────────────────────────────

describe('buildDocx — metadata core.xml updates', () => {
  it('writes accepted author value to dc:creator in core.xml', async () => {
    const zip = await makeZip(['Metadata author: [Author Name]']);
    zip.file('docProps/core.xml', makeCoreXml({ creator: '[Author Name]' }));

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const coreXml = await getOutputCoreXml(zip, [fix]);
    expect(coreXml).toContain('Jane Smith');
    expect(coreXml).not.toContain('[Author Name]');
  });

  it('writes accepted subject value to dc:subject in core.xml', async () => {
    const zip = await makeZip(['Metadata subject: [Subject]']);
    zip.file('docProps/core.xml', makeCoreXml({ subject: '[Subject]' }));

    const fix: AcceptedFix = {
      issueId: 'META-002-0',
      ruleId: 'META-002',
      targetField: 'metadata.subject',
      value: 'Community Health Grants',
    };

    const coreXml = await getOutputCoreXml(zip, [fix]);
    expect(coreXml).toContain('Community Health Grants');
    expect(coreXml).not.toContain('[Subject]');
  });

  it('writes accepted keywords value to cp:keywords in core.xml', async () => {
    const zip = await makeZip(['Metadata keywords: [Keywords]']);
    zip.file('docProps/core.xml', makeCoreXml({ keywords: '[Keywords]' }));

    const fix: AcceptedFix = {
      issueId: 'META-003-0',
      ruleId: 'META-003',
      targetField: 'metadata.keywords',
      value: 'health, CDC',
    };

    const coreXml = await getOutputCoreXml(zip, [fix]);
    expect(coreXml).toContain('health, CDC');
    expect(coreXml).not.toContain('[Keywords]');
  });

  it('updates both core.xml and body paragraph in the same pass', async () => {
    const zip = await makeZip(['Metadata author: [Author Name]']);
    zip.file('docProps/core.xml', makeCoreXml({ creator: '[Author Name]' }));

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    const blob = await buildDocx(zip, [fix]);
    const outputZip = await JSZip.loadAsync(blob);

    const docXml = await outputZip.file('word/document.xml')!.async('string');
    const coreXml = await outputZip.file('docProps/core.xml')!.async('string');
    expect(docXml).toContain('Metadata author: Jane Smith');
    expect(coreXml).toContain('Jane Smith');
  });

  it('skips core.xml update silently when docProps/core.xml is absent', async () => {
    const zip = await makeZip(['Metadata author: [Author Name]']);
    // No core.xml added — function should not throw

    const fix: AcceptedFix = {
      issueId: 'META-001-0',
      ruleId: 'META-001',
      targetField: 'metadata.author',
      value: 'Jane Smith',
    };

    // Body paragraph should still be updated
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
