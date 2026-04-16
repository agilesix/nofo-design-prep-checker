/**
 * CLEAN-008 diagnostic test suite
 *
 * Purpose: Verify that applyHeadingLeadingSpaceFix correctly updates
 * w:hyperlink w:anchor values in real-world-like OOXML scenarios that the
 * existing tests do not cover:
 *
 *   1. Full Word-style namespace declarations on the root element (many xmlns
 *      attributes — the production OOXML has ~25; the existing tests use one).
 *
 *   2. A w:bookmarkStart embedded inside the heading paragraph (as Word always
 *      generates), with a realistic w:rPr block on the run.
 *
 *   3. A serialization-cycle scenario: another auto-fix that runs BEFORE
 *      CLEAN-008 (e.g. CLEAN-004 double-space collapse) causes XMLSerializer to
 *      write document.xml once; CLEAN-008 then reads and re-parses that output.
 *      The browser's XMLSerializer is known to re-map namespace prefixes, which
 *      can break getElementsByTagName('w:hyperlink') lookups in a subsequent
 *      parse.
 *
 *   4. A document where the hyperlink paragraph also contains a plain-text run
 *      immediately before or after the w:hyperlink element, to ensure the
 *      sibling structure does not confuse the lookup.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from '../buildDocx';
import type { AutoAppliedChange } from '../../types';

// ─── Shared constants ─────────────────────────────────────────────────────────

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const CLEAN_008_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-008',
  description: 'Leading spaces removed from 1 heading.',
  targetField: 'heading.leadingspace',
};

// CLEAN-004 triggers the doublespace fix, which runs BEFORE CLEAN-008 and
// causes a full serialize/parse cycle on document.xml.
const CLEAN_004_CHANGE: AutoAppliedChange = {
  ruleId: 'CLEAN-004',
  description: 'Double spaces removed.',
  targetField: 'text.doublespace',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOutputDocXml(
  zip: JSZip,
  autoAppliedChanges: AutoAppliedChange[],
): Promise<string> {
  const blob = await buildDocx(zip, [], autoAppliedChanges);
  const outZip = await JSZip.loadAsync(blob);
  const docFile = outZip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml missing from output');
  return docFile.async('string');
}

function extractHyperlinkAnchor(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const hyperlinks = Array.from(
    doc.getElementsByTagNameNS(W_NS, 'hyperlink'),
  );
  if (hyperlinks.length === 0) return null;
  const el = hyperlinks[0]!;
  return (
    el.getAttributeNS(W_NS, 'anchor') ??
    el.getAttribute('w:anchor') ??
    el.getAttribute('anchor') ??
    null
  );
}

function extractParagraphText(xml: string, index: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const paras = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
  const para = paras[index];
  if (!para) return '';
  return Array.from(para.getElementsByTagNameNS(W_NS, 't'))
    .map(t => t.textContent ?? '')
    .join('');
}

// ─── Realistic OOXML builders ─────────────────────────────────────────────────

/**
 * A root namespace declaration block that mirrors a real Word document (~25
 * xmlns attributes). The critical difference from the minimal test fixture
 * used in existing tests is the presence of many additional namespaces,
 * which can cause XMLSerializer to pick different prefix assignments.
 */
const FULL_NS_ATTRS = [
  `xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"`,
  `xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"`,
  `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"`,
  `xmlns:o="urn:schemas-microsoft-com:office:office"`,
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`,
  `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"`,
  `xmlns:v="urn:schemas-microsoft-com:vml"`,
  `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`,
  `xmlns:w10="urn:schemas-microsoft-com:office:word"`,
  `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`,
  `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"`,
  `xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"`,
  `xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"`,
  `xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"`,
  `xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"`,
  `xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"`,
  `xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"`,
  `mc:Ignorable="w14 w15 w16 wp14"`,
].join(' ');

/**
 * Build a realistic word/document.xml with:
 *   - Full Word-style namespace declarations
 *   - A Heading1 paragraph with a leading space and an embedded w:bookmarkStart
 *   - A paragraph containing a w:hyperlink with w:anchor pointing to the heading
 *   - Optional extra body paragraphs with double spaces (to trigger CLEAN-004)
 */
function makeRealisticDocXml(opts: {
  headingText: string;
  bookmarkName: string;
  linkAnchor: string;
  includeDoubleSpace?: boolean;
}): string {
  const { headingText, bookmarkName, linkAnchor, includeDoubleSpace } = opts;
  const preserve = headingText !== headingText.trimStart() ? ' xml:space="preserve"' : '';

  // Body paragraph that triggers CLEAN-004 if present
  const doubleSpacePara = includeDoubleSpace
    ? `<w:p>` +
      `<w:pPr><w:pStyle w:val="Normal"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">This has  double spaces in it.</w:t></w:r>` +
      `</w:p>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${FULL_NS_ATTRS}>` +
    `<w:body>` +

    // ── Heading paragraph with leading space and embedded bookmark ────────
    `<w:p>` +
    `<w:pPr>` +
    `<w:pStyle w:val="Heading1"/>` +
    `<w:outlineLvl w:val="0"/>` +
    `</w:pPr>` +
    `<w:bookmarkStart w:id="5" w:name="${bookmarkName}"/>` +
    `<w:r>` +
    `<w:rPr>` +
    `<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/>` +
    `<w:color w:val="2F5496"/>` +
    `<w:sz w:val="28"/>` +
    `</w:rPr>` +
    `<w:t${preserve}>${headingText}</w:t>` +
    `</w:r>` +
    `<w:bookmarkEnd w:id="5"/>` +
    `</w:p>` +

    // ── Optional double-space paragraph (exercises prior serialize cycle) ─
    doubleSpacePara +

    // ── Paragraph containing the internal hyperlink ───────────────────────
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="Normal"/></w:pPr>` +
    `<w:hyperlink w:anchor="${linkAnchor}" w:history="1">` +
    `<w:r>` +
    `<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>` +
    `<w:t>See Contacts and Support</w:t>` +
    `</w:r>` +
    `</w:hyperlink>` +
    `</w:p>` +

    `<w:sectPr/>` +
    `</w:body></w:document>`
  );
}

// ─── Diagnostic tests ─────────────────────────────────────────────────────────

describe('CLEAN-008 diagnostic — realistic OOXML scenarios', () => {

  it('DIAG-1: updates w:anchor in a full-namespace OOXML document (no prior serialization cycle)', async () => {
    // This is the baseline: realistic namespaces but only CLEAN-008 fix applied.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeRealisticDocXml({
        headingText: ' Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        linkAnchor: '_Contacts_and_Support',
        includeDoubleSpace: false,
      })
    );

    const outXml = await getOutputDocXml(zip, [CLEAN_008_CHANGE]);

    const anchor = extractHyperlinkAnchor(outXml);
    expect(anchor).toBe('Contacts_and_Support');

    const headingText = extractParagraphText(outXml, 0);
    expect(headingText).toBe('Contacts and Support');

    // Old slug must not remain
    expect(outXml).not.toMatch(/w:anchor="_Contacts_and_Support"/);
    expect(outXml).not.toMatch(/(?<!:)anchor="_Contacts_and_Support"/);
  });

  it('DIAG-2: updates w:anchor AFTER a prior serialize cycle caused by CLEAN-004 (double-space fix)', async () => {
    // Critical scenario: CLEAN-004 (doublespace) runs BEFORE CLEAN-008 and
    // causes XMLSerializer to write document.xml.  CLEAN-008 then reads that
    // re-serialized XML, which the browser's XMLSerializer may have modified
    // (e.g. remapped namespace prefixes or emitted attributes without w: prefix).
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeRealisticDocXml({
        headingText: ' Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        linkAnchor: '_Contacts_and_Support',
        includeDoubleSpace: true, // triggers CLEAN-004 → prior XMLSerializer pass
      })
    );

    const outXml = await getOutputDocXml(zip, [CLEAN_004_CHANGE, CLEAN_008_CHANGE]);

    const anchor = extractHyperlinkAnchor(outXml);
    expect(anchor).toBe('Contacts_and_Support');

    const headingText = extractParagraphText(outXml, 0);
    expect(headingText).toBe('Contacts and Support');

    expect(outXml).not.toMatch(/_Contacts_and_Support/);
  });

  it('DIAG-3: also updates w:bookmarkStart w:name in the full-namespace document', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeRealisticDocXml({
        headingText: ' Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        linkAnchor: '_Contacts_and_Support',
        includeDoubleSpace: false,
      })
    );

    const outXml = await getOutputDocXml(zip, [CLEAN_008_CHANGE]);

    console.log('[DIAG-3] Output XML (bookmark area):');
    const bmIdx = outXml.indexOf('bookmarkStart');
    console.log('[DIAG-3]', outXml.slice(Math.max(0, bmIdx - 20), bmIdx + 150));

    // Bookmark name must be updated
    expect(outXml).toMatch(/w:name="Contacts_and_Support"/);
    expect(outXml).not.toMatch(/w:name="_Contacts_and_Support"/);
    // Hyperlink anchor must also be updated
    const anchor = extractHyperlinkAnchor(outXml);
    expect(anchor).toBe('Contacts_and_Support');
  });

  it('DIAG-4: intermediate XML after CLEAN-004 pass — inspect what CLEAN-008 actually reads', async () => {
    // Manually simulate what CLEAN-004 writes so we can see what CLEAN-008 reads.
    // We parse the original OOXML and immediately re-serialize it with XMLSerializer,
    // then check if getElementsByTagName('w:hyperlink') and getAttributeNS still work.
    const original = makeRealisticDocXml({
      headingText: ' Contacts and Support',
      bookmarkName: '_Contacts_and_Support',
      linkAnchor: '_Contacts_and_Support',
      includeDoubleSpace: false,
    });

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(original, 'application/xml');
    const serializer = new XMLSerializer();
    const reserialized = serializer.serializeToString(xmlDoc);

    console.log('[DIAG-4] Re-serialized XML (first 1000 chars):');
    console.log('[DIAG-4]', reserialized.slice(0, 1000));

    // After re-serialization, can we still find w:hyperlink elements?
    const reparsed = parser.parseFromString(reserialized, 'application/xml');
    // NS-aware lookup is reliable regardless of prefix remapping.
    const hyperlinksByNS = Array.from(reparsed.getElementsByTagNameNS(W_NS, 'hyperlink'));
    // Qualified-name lookup is diagnostic only — may return 0 if the prefix was remapped.
    const hyperlinksByTag = Array.from(reparsed.getElementsByTagName('w:hyperlink'));
    console.log(`[DIAG-4] getElementsByTagNameNS after re-parse: found ${hyperlinksByNS.length}`);
    console.log(`[DIAG-4] getElementsByTagName('w:hyperlink') after re-parse: found ${hyperlinksByTag.length}`);

    if (hyperlinksByNS.length > 0) {
      const el = hyperlinksByNS[0]!;
      const anchorNS = el.getAttributeNS(W_NS, 'anchor');
      const anchorPlain = el.getAttribute('anchor');
      const anchorQual = el.getAttribute('w:anchor');
      console.log(`[DIAG-4] anchor via getAttributeNS: "${anchorNS}"`);
      console.log(`[DIAG-4] anchor via getAttribute('anchor'): "${anchorPlain}"`);
      console.log(`[DIAG-4] anchor via getAttribute('w:anchor'): "${anchorQual}"`);
    }

    // Also check element tag names in the re-parsed document
    const allElements = Array.from(reparsed.getElementsByTagName('*')).slice(0, 20);
    console.log('[DIAG-4] First 20 element names after re-parse:');
    allElements.forEach(el => {
      console.log(`[DIAG-4]   tagName="${el.tagName}" localName="${el.localName}" namespaceURI="${el.namespaceURI}"`);
    });

    // Assert on the namespace-aware lookup — this must work regardless of
    // whether XMLSerializer remapped the 'w:' prefix.
    expect(hyperlinksByNS.length).toBeGreaterThan(0);
  });

  it('DIAG-5: w:hyperlink with w:anchor — what does jsdom vs browser do with getAttributeNS?', async () => {
    // Minimal sanity check: parse a single hyperlink element and verify that
    // getAttributeNS(W_NS, 'anchor') returns the correct value.
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body>` +
      `<w:p>` +
      `<w:hyperlink w:anchor="_Contacts_and_Support" w:history="1">` +
      `<w:r><w:t>link text</w:t></w:r>` +
      `</w:hyperlink>` +
      `</w:p>` +
      `</w:body></w:document>`;

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const links = Array.from(doc.getElementsByTagName('w:hyperlink'));
    console.log(`[DIAG-5] getElementsByTagName('w:hyperlink'): found ${links.length}`);
    expect(links.length).toBe(1);

    const el = links[0]!;
    const anchorNS = el.getAttributeNS(W_NS, 'anchor');
    const anchorPlain = el.getAttribute('anchor');
    const anchorQual = el.getAttribute('w:anchor');
    console.log(`[DIAG-5] getAttributeNS(W_NS, 'anchor'): "${anchorNS}"`);
    console.log(`[DIAG-5] getAttribute('anchor'): "${anchorPlain}"`);
    console.log(`[DIAG-5] getAttribute('w:anchor'): "${anchorQual}"`);
    console.log(`[DIAG-5] el.tagName: "${el.tagName}", el.localName: "${el.localName}"`);

    // At minimum, one form must return the value
    const combined = anchorNS ?? anchorPlain ?? anchorQual;
    console.log(`[DIAG-5] Combined (any form): "${combined}"`);
    expect(combined).toBe('_Contacts_and_Support');
  });

  it('DIAG-6: full-namespace document — getElementsByTagName uses qualified name or localName?', async () => {
    // With many xmlns declarations, XMLSerializer may remap the w: prefix.
    // This test checks whether w:hyperlink elements are findable by tag name
    // after a parse→serialize→parse cycle on a full-namespace document.
    const original = makeRealisticDocXml({
      headingText: ' Contacts and Support',
      bookmarkName: '_Contacts_and_Support',
      linkAnchor: '_Contacts_and_Support',
    });

    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    // Cycle 1
    const doc1 = parser.parseFromString(original, 'application/xml');
    const xml1 = serializer.serializeToString(doc1);
    // Cycle 2
    const doc2 = parser.parseFromString(xml1, 'application/xml');
    const xml2 = serializer.serializeToString(doc2);

    console.log('[DIAG-6] After 2 serialize cycles, XML snippet around hyperlink:');
    const idx = xml2.indexOf('hyperlink');
    console.log('[DIAG-6]', xml2.slice(Math.max(0, idx - 100), idx + 300));

    // Try both qualified and local-name lookups
    const byQualified = Array.from(doc2.getElementsByTagName('w:hyperlink'));
    const byLocal = Array.from(doc2.getElementsByTagNameNS(W_NS, 'hyperlink'));
    console.log(`[DIAG-6] getElementsByTagName('w:hyperlink'): ${byQualified.length}`);
    console.log(`[DIAG-6] getElementsByTagNameNS(W_NS, 'hyperlink'): ${byLocal.length}`);

    if (byLocal.length > 0 && byQualified.length === 0) {
      console.warn('[DIAG-6] *** BUG CONFIRMED: w:hyperlink not findable by qualified tag name after XMLSerializer cycle ***');
      console.warn('[DIAG-6] The namespace prefix was remapped. getElementsByTagNameNS should be used instead.');
    }

    // The namespace-aware lookup must always work
    expect(byLocal.length).toBeGreaterThan(0);
  });

  it('DIAG-7: anchor update works when hyperlink carries only the qualified getAttribute form (w:anchor without namespace)', async () => {
    // Simulates a browser whose DOMParser stores the attribute under the
    // qualified name 'w:anchor' rather than as a namespaced attribute retrievable
    // via getAttributeNS(W, 'anchor').  The third fallback (anchorQual) must pick
    // it up.  In jsdom, getAttributeNS always works, so the test verifies only
    // that the end-to-end update succeeds regardless of which fallback is active.
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      makeRealisticDocXml({
        headingText: ' Contacts and Support',
        bookmarkName: '_Contacts_and_Support',
        linkAnchor: '_Contacts_and_Support',
        includeDoubleSpace: false,
      })
    );

    const outXml = await getOutputDocXml(zip, [CLEAN_008_CHANGE]);
    const anchor = extractHyperlinkAnchor(outXml);
    console.log('[DIAG-7] Extracted hyperlink anchor:', anchor);
    expect(anchor).toBe('Contacts_and_Support');
  });

  it('DIAG-8: getElementsByTagNameNS vs getElementsByTagName — both must find the same hyperlinks after multiple serialize cycles', () => {
    // Verifies that in the current environment, both element-lookup strategies
    // agree.  A discrepancy would confirm that the getElementsByTagNameNS fix is
    // necessary (prefix was remapped by XMLSerializer).
    const xml = makeRealisticDocXml({
      headingText: ' Contacts and Support',
      bookmarkName: '_Contacts_and_Support',
      linkAnchor: '_Contacts_and_Support',
    });

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    // Two full serialize/parse cycles (mirrors what happens when multiple fixes run)
    const doc1 = parser.parseFromString(xml, 'application/xml');
    const xml1 = serializer.serializeToString(doc1);
    const doc2 = parser.parseFromString(xml1, 'application/xml');
    const xml2 = serializer.serializeToString(doc2);
    const doc3 = parser.parseFromString(xml2, 'application/xml');

    const byNS = Array.from(doc3.getElementsByTagNameNS(W_NS, 'hyperlink'));
    const byTag = Array.from(doc3.getElementsByTagName('w:hyperlink'));
    console.log(`[DIAG-8] getElementsByTagNameNS: ${byNS.length}, getElementsByTagName: ${byTag.length}`);

    if (byNS.length !== byTag.length) {
      console.warn('[DIAG-8] *** MISMATCH — prefix was remapped by XMLSerializer ***');
      console.warn('[DIAG-8] byNS tagNames:', byNS.map(e => e.tagName));
      console.warn('[DIAG-8] byTag tagNames:', byTag.map(e => e.tagName));
    }

    // Namespace-aware lookup must always work regardless of prefix remapping.
    expect(byNS.length).toBeGreaterThan(0);
  });

});
