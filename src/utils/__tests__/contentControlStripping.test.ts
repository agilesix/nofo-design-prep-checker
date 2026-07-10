import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from '../buildDocx';
import { stripContentControlsFromZip } from '../contentControlStripping';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Build a document.xml string that wraps `innerXml` in a single <w:sdt>. */
function makeSdtDocumentXml(innerXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}">` +
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

/** Build a minimal document.xml with one <w:p> per given paragraph text. */
function makeDocumentXml(paragraphs: string[]): string {
  const wParagraphs = paragraphs.map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>${wParagraphs}<w:sectPr/></w:body></w:document>`
  );
}

/** Parse paragraph texts from a serialized document.xml string, in document order. */
function extractParagraphTexts(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('w:p')).map(p =>
    Array.from(p.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('')
  );
}

async function stripAndRead(zip: JSZip, path: string): Promise<string> {
  await stripContentControlsFromZip(zip);
  const file = zip.file(path);
  if (!file) throw new Error(`${path} missing from zip`);
  return file.async('string');
}

describe('stripContentControlsFromZip', () => {
  it('removes the <w:sdt> wrapper and its <w:sdtPr> / <w:sdtContent> elements', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeSdtDocumentXml('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>'));

    const outXml = await stripAndRead(zip, 'word/document.xml');

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

    const outXml = await stripAndRead(zip, 'word/document.xml');

    expect(extractParagraphTexts(outXml)).toContain('Preserved text');
  });

  it('leaves a document with no content controls unchanged', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['First paragraph', 'Second paragraph']));

    const outXml = await stripAndRead(zip, 'word/document.xml');

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
      `<w:document xmlns:w="${W}">` +
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

    const outXml = await stripAndRead(zip, 'word/document.xml');

    expect(outXml).not.toContain('w:sdt');
    expect(extractParagraphTexts(outXml)).toContain('Inner text');
  });

  it('strips content controls from a header part (word/header1.xml)', async () => {
    // Content controls in headers live in a separate ZIP entry — they must be
    // stripped even though they are not in word/document.xml.
    const headerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="${W}">` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent><w:p><w:r><w:t>Header text</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:hdr>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['Body text']));
    zip.file('word/header1.xml', headerXml);

    const outHeaderXml = await stripAndRead(zip, 'word/header1.xml');

    expect(outHeaderXml).not.toContain('w:sdt');
    expect(outHeaderXml).toContain('Header text');
  });

  it('strips content controls from footnotes (word/footnotes.xml)', async () => {
    const footnotesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:footnotes xmlns:w="${W}">` +
      `<w:sdt><w:sdtPr/>` +
      `<w:sdtContent><w:p><w:r><w:t>Footnote text</w:t></w:r></w:p></w:sdtContent>` +
      `</w:sdt>` +
      `</w:footnotes>`;
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['Body text']));
    zip.file('word/footnotes.xml', footnotesXml);

    const outFootnotesXml = await stripAndRead(zip, 'word/footnotes.xml');

    expect(outFootnotesXml).not.toContain('w:sdt');
    expect(outFootnotesXml).toContain('Footnote text');
  });

  it('preserves bookmark order: bookmarkStart before content, bookmarkEnd after', async () => {
    // Regression for the two-step hoist bug: hoisting sdtContent children first
    // then bookmarks placed bookmarkStart *after* the content, breaking the span.
    // The fix walks sdt children in document order, so bookmarkStart preceding
    // sdtContent stays before the content in the output.
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:sdt>` +
      `<w:sdtPr/>` +
      `<w:bookmarkStart w:id="1" w:name="section_heading"/>` +
      `<w:sdtContent><w:p><w:r><w:t>Heading text</w:t></w:r></w:p></w:sdtContent>` +
      `<w:bookmarkEnd w:id="1"/>` +
      `</w:sdt>` +
      `<w:sectPr/>` +
      `</w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', docXml);

    const outXml = await stripAndRead(zip, 'word/document.xml');

    expect(outXml).not.toContain('w:sdt');
    expect(outXml).toContain('section_heading');
    const bmStart = outXml.indexOf('bookmarkStart');
    const content = outXml.indexOf('Heading text');
    const bmEnd = outXml.indexOf('bookmarkEnd');
    expect(bmStart).toBeLessThan(content);
    expect(content).toBeLessThan(bmEnd);
  });

  it('retains the XML declaration after rewriting document.xml', async () => {
    const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const zip = new JSZip();
    zip.file('word/document.xml', makeSdtDocumentXml('<w:p><w:r><w:t>inner text</w:t></w:r></w:p>'));

    const outXml = await stripAndRead(zip, 'word/document.xml');

    expect(outXml.startsWith(XML_DECL)).toBe(true);
  });

  it('does nothing and leaves the zip untouched when no story part contains a content control', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocumentXml(['Plain paragraph']));

    await stripContentControlsFromZip(zip);

    const outXml = await zip.file('word/document.xml')!.async('string');
    expect(outXml).toEqual(makeDocumentXml(['Plain paragraph']));
  });

  describe('w:displacedByCustomXml cleanup', () => {
    it("clears displacedByCustomXml=\"next\" from a bookmarkStart sitting before the <w:sdt>", async () => {
      // Word sometimes cannot nest a bookmarkStart inside a content control and
      // instead places it as a body-level sibling immediately before the
      // <w:sdt>, flagging it with w:displacedByCustomXml="next". Once the
      // <w:sdt> is unwrapped, the bookmark must survive with its w:name intact
      // and the stale attribute must be cleared.
      const docXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W}"><w:body>` +
        `<w:bookmarkStart w:id="1" w:name="my_bookmark" w:displacedByCustomXml="next"/>` +
        `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Displaced content</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
        `<w:bookmarkEnd w:id="1"/>` +
        `<w:sectPr/>` +
        `</w:body></w:document>`;
      const zip = new JSZip();
      zip.file('word/document.xml', docXml);

      const outXml = await stripAndRead(zip, 'word/document.xml');

      expect(outXml).not.toContain('w:sdt');
      expect(outXml).toContain('w:name="my_bookmark"');
      expect(outXml).not.toContain('displacedByCustomXml');
      expect(extractParagraphTexts(outXml)).toContain('Displaced content');
    });

    it('clears displacedByCustomXml="prev" from a bookmarkEnd sitting after the <w:sdt>', async () => {
      const docXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W}"><w:body>` +
        `<w:bookmarkStart w:id="1" w:name="trailing_bookmark"/>` +
        `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Content</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
        `<w:bookmarkEnd w:id="1" w:displacedByCustomXml="prev"/>` +
        `<w:sectPr/>` +
        `</w:body></w:document>`;
      const zip = new JSZip();
      zip.file('word/document.xml', docXml);

      const outXml = await stripAndRead(zip, 'word/document.xml');

      expect(outXml).not.toContain('w:sdt');
      expect(outXml).not.toContain('displacedByCustomXml');
      expect(outXml).toContain('w:name="trailing_bookmark"');
    });

    it('does not clear displacedByCustomXml on markers not adjacent to the unwrapped <w:sdt>', async () => {
      // A bookmark elsewhere in the document that happens to carry a (still
      // valid, unrelated) displacedByCustomXml marker must not be touched.
      const docXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W}"><w:body>` +
        `<w:p><w:bookmarkStart w:id="1" w:name="far_away" w:displacedByCustomXml="next"/><w:r><w:t>Unrelated</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>` +
        `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Content</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
        `<w:sectPr/>` +
        `</w:body></w:document>`;
      const zip = new JSZip();
      zip.file('word/document.xml', docXml);

      const outXml = await stripAndRead(zip, 'word/document.xml');

      expect(outXml).not.toContain('w:sdt');
      expect(outXml).toContain('w:name="far_away"');
      expect(outXml).toContain('displacedByCustomXml="next"');
    });
  });

  describe('regression: displacedByCustomXml bookmark survives import-time stripping through a subsequent download', () => {
    it('preserves the bookmark name through stripContentControlsFromZip and buildDocx', async () => {
      // Simulates the new pipeline shape: import-time pre-processing
      // (stripContentControlsFromZip, run immediately after unzipping and
      // before mammoth/any rule) followed by a later download (buildDocx,
      // which no longer strips content controls itself). The bookmark must
      // come out the other end with its w:name intact and no leftover
      // <w:sdt> or displacedByCustomXml marker — proving it would survive a
      // subsequent Word resave without breaking whatever internal link
      // anchors to it.
      const docXml =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="${W}"><w:body>` +
        `<w:bookmarkStart w:id="1" w:name="toc_target" w:displacedByCustomXml="next"/>` +
        `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Section heading</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
        `<w:bookmarkEnd w:id="1"/>` +
        `<w:sectPr/>` +
        `</w:body></w:document>`;

      const importZip = new JSZip();
      importZip.file('word/document.xml', docXml);

      // Import-time pre-processing step.
      await stripContentControlsFromZip(importZip);

      // Subsequent download, with no accepted fixes or auto-applied changes.
      const blob = await buildDocx(importZip, [], []);
      const outZip = await JSZip.loadAsync(blob);
      const outXml = await outZip.file('word/document.xml')!.async('string');

      expect(outXml).not.toContain('w:sdt');
      expect(outXml).not.toContain('displacedByCustomXml');
      expect(outXml).toContain('w:name="toc_target"');
      expect(extractParagraphTexts(outXml)).toContain('Section heading');
    });
  });
});
