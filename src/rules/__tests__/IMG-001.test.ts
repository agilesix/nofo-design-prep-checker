import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import IMG_001 from '../universal/IMG-001';
import type { ParsedDocument, Issue } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDoc(documentXml: string): ParsedDocument {
  return {
    html: '',
    sections: [
      {
        id: 'section-preamble',
        heading: 'Document start',
        headingLevel: 0,
        html: '',
        rawText: '',
        startPage: 1,
      },
    ],
    rawText: '',
    zipArchive: new JSZip(),
    documentXml,
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
  };
}

/**
 * Minimal OOXML document with two drawings:
 *  id="1" — in the preamble (before Step 1 heading)
 *  id="2" — after the Step 1 heading
 * Both are missing the `descr` attribute (no alt text).
 */
const PREAMBLE_AND_BODY_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="1" name="Preamble Logo"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Step 1: Review the Opportunity</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="2" name="Body Chart"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

/** Same structure but the Step 1 heading uses Heading1 style. */
const HEADING1_STEP1_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="1" name="Preamble Logo"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Step 1: Review the Opportunity</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="2" name="Body Chart"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

/** A document with one image and no Step 1 heading at all. */
const NO_STEP1_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="1" name="Some Image"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

/** Image with alt text present — should never be flagged. */
const WITH_ALT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline><wp:docPr id="1" name="Logo" descr="CDC logo"/></wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Step 1: Review the Opportunity</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

const OPTIONS_SSJ         = { contentGuideId: 'cdc-dght-ssj' } as const;
const OPTIONS_COMPETITIVE = { contentGuideId: 'cdc-dght-competitive' } as const;
const OPTIONS_DGHP        = { contentGuideId: 'cdc-dghp' } as const;
const OPTIONS_CDC         = { contentGuideId: 'cdc' } as const;
const OPTIONS_OTHER       = { contentGuideId: 'acf' } as const;
const OPTIONS_NONE        = { contentGuideId: null } as const;

// ─── Preamble exemption ───────────────────────────────────────────────────────

describe('IMG-001: CDC/DGHT preamble exemption', () => {
  it('does not flag an image in the preamble for cdc-dght-ssj', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_SSJ) as Issue[];
    const ids = issues.map(i => i.id);
    expect(ids).not.toContain('IMG-001-1');
  });

  it('does not flag an image in the preamble for cdc-dght-competitive', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_COMPETITIVE) as Issue[];
    expect(issues.map(i => i.id)).not.toContain('IMG-001-1');
  });

  it('does not flag an image in the preamble for cdc-dghp', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_DGHP) as Issue[];
    expect(issues.map(i => i.id)).not.toContain('IMG-001-1');
  });

  it('still flags an image after the Step 1 heading in a CDC/DGHT doc', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_SSJ) as Issue[];
    expect(issues.map(i => i.id)).toContain('IMG-001-2');
  });

  it('exemption works when Step 1 uses a Heading1 style', () => {
    const doc = makeDoc(HEADING1_STEP1_XML);
    const issues = IMG_001.check(doc, OPTIONS_SSJ) as Issue[];
    expect(issues.map(i => i.id)).not.toContain('IMG-001-1');
    expect(issues.map(i => i.id)).toContain('IMG-001-2');
  });

  it('does NOT exempt a preamble image for plain cdc guide (no preamble removal)', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_CDC) as Issue[];
    expect(issues.map(i => i.id)).toContain('IMG-001-1');
  });

  it('does NOT exempt a preamble image for a non-CDC guide', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_OTHER) as Issue[];
    expect(issues.map(i => i.id)).toContain('IMG-001-1');
  });

  it('does NOT exempt a preamble image when no content guide is selected', () => {
    const doc = makeDoc(PREAMBLE_AND_BODY_XML);
    const issues = IMG_001.check(doc, OPTIONS_NONE) as Issue[];
    expect(issues.map(i => i.id)).toContain('IMG-001-1');
  });

  it('does not apply exemption when there is no Step 1 heading in the document', () => {
    const doc = makeDoc(NO_STEP1_XML);
    const issues = IMG_001.check(doc, OPTIONS_SSJ) as Issue[];
    // No Step 1 → no preamble boundary → image must be flagged
    expect(issues.map(i => i.id)).toContain('IMG-001-1');
  });
});

// ─── Core detection ───────────────────────────────────────────────────────────

describe('IMG-001: core alt text detection', () => {
  it('flags an image with no descr attribute', () => {
    const doc = makeDoc(NO_STEP1_XML);
    const issues = IMG_001.check(doc, OPTIONS_NONE) as Issue[];
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('IMG-001-1');
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.title).toBe('Image is missing alt text');
  });

  it('flags an image with an empty descr attribute as a suggestion', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:r><w:drawing>
      <wp:inline><wp:docPr id="3" name="Decorative" descr=""/></wp:inline>
    </w:drawing></w:r></w:p>
  </w:body>
</w:document>`;
    const issues = IMG_001.check(makeDoc(xml), OPTIONS_NONE) as Issue[];
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('IMG-001-empty-3');
    expect(issues[0]!.severity).toBe('suggestion');
  });

  it('does not flag an image that has descriptive alt text', () => {
    const doc = makeDoc(WITH_ALT_XML);
    expect(IMG_001.check(doc, OPTIONS_NONE)).toHaveLength(0);
  });

  it('returns empty array when documentXml is empty', () => {
    const doc = makeDoc('');
    expect(IMG_001.check(doc, OPTIONS_NONE)).toHaveLength(0);
  });

  it('sets targetField to image.docPr.<id> on the inputRequired spec', () => {
    const doc = makeDoc(NO_STEP1_XML);
    const issues = IMG_001.check(doc, OPTIONS_NONE) as Issue[];
    expect(issues[0]!.inputRequired?.targetField).toBe('image.docPr.1');
  });
});
