import type { Rule, Issue, ParsedDocument, RuleRunnerOptions } from '../../types';
import { DGHT_STEP1_ANCHOR } from '../opdiv/CLEAN-007-constants';
import CLEAN_007 from '../opdiv/CLEAN-007';

/**
 * IMG-001: Images missing alt text
 *
 * Parses word/document.xml (stored on ParsedDocument.documentXml) rather than
 * the mammoth HTML so we can read the wp:docPr element's `id` attribute — a
 * stable, unique integer per drawing in the OOXML spec — and store it as the
 * targetField. buildDocx then finds the exact element by that id instead of
 * the first element with an empty descr, which would apply alt text to the
 * wrong image when multiple images are missing alt text.
 */

// Derived from CLEAN-007 so the exemption always matches where scaffolding removal runs.
const PREAMBLE_GUIDE_IDS = new Set(CLEAN_007.contentGuideIds ?? []);

/**
 * Walks body-level OOXML nodes to find the Step 1 boundary, then collects the
 * `id` attributes of every wp:docPr that appears before it. Returns a Set for
 * O(1) per-image preamble checks. Built once per check() call.
 */
function buildPreambleDocPrIds(body: Element): Set<string> {
  const bodyChildren = Array.from(body.childNodes).filter(
    (n): n is Element => n.nodeName === 'w:p' || n.nodeName === 'w:tbl'
  );

  const step1Index = bodyChildren.findIndex(node => {
    if (node.nodeName !== 'w:p') return false;
    const pStyle = node.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? '';
    if (!/^heading\d/i.test(pStyle)) return false;
    const text = Array.from(node.getElementsByTagName('w:t'))
      .map(t => t.textContent ?? '')
      .join('')
      .toLowerCase()
      .trim();
    return text === DGHT_STEP1_ANCHOR;
  });

  if (step1Index === -1) return new Set();

  const ids = new Set<string>();
  for (const node of bodyChildren.slice(0, step1Index)) {
    for (const docPr of Array.from(node.getElementsByTagName('wp:docPr'))) {
      const id = docPr.getAttribute('id');
      if (id) ids.add(id);
    }
  }
  return ids;
}

const IMG_001: Rule = {
  id: 'IMG-001',
  check(doc: ParsedDocument, options: RuleRunnerOptions): Issue[] {
    if (!doc.documentXml) return [];

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(doc.documentXml, 'application/xml');

    // Build preamble id set once — O(preambleNodes) total, O(1) per-image check.
    const isPreambleGuide = options.contentGuideId !== null && PREAMBLE_GUIDE_IDS.has(options.contentGuideId);
    let preambleDocPrIds = new Set<string>();
    if (isPreambleGuide) {
      const body = xmlDoc.getElementsByTagName('w:body')[0];
      if (body) preambleDocPrIds = buildPreambleDocPrIds(body);
    }

    const issues: Issue[] = [];
    const docPrElements = Array.from(xmlDoc.getElementsByTagName('wp:docPr'));

    docPrElements.forEach(docPr => {
      const docPrId = docPr.getAttribute('id');
      if (!docPrId) return;

      // Images in the preamble are removed by CLEAN-007 on export; flagging them
      // is a false positive caused by rules running before the preamble patch applies.
      if (preambleDocPrIds.has(docPrId)) return;

      const descr = docPr.getAttribute('descr');
      const name = docPr.getAttribute('name') ?? `Image ${docPrId}`;

      const isMissingAlt = descr === null;
      const isEmptyAlt = descr !== null && descr.trim() === '';

      // Determine nearest section by looking for the element in sections' raw text
      const section = doc.sections.find(s => s.rawText.includes(docPrId));
      const sectionId = section?.id ?? doc.sections[0]?.id ?? 'section-preamble';
      // Use section heading as location context (image position from OOXML,
      // no HTML element available for a more precise lookup).
      const nearestHeading = section && section.headingLevel > 0 ? section.heading : null;

      if (isMissingAlt) {
        issues.push({
          id: `IMG-001-${docPrId}`,
          ruleId: 'IMG-001',
          title: 'Image is missing alt text',
          severity: 'error',
          sectionId,
          nearestHeading,
          description: `"${name}" has no alt text (the descr attribute is absent). All images must have alt text unless they are purely decorative.`,
          suggestedFix: 'Add descriptive alt text, or set descr="" to mark the image as decorative.',
          inputRequired: {
            type: 'text',
            label: `Alt text for "${name}"`,
            placeholder: 'Describe what the image shows',
            hint: 'Leave blank to mark this image as decorative (sets descr="").',
            targetField: `image.docPr.${docPrId}`,
            maxLength: 250,
          },
        });
      } else if (isEmptyAlt) {
        issues.push({
          id: `IMG-001-empty-${docPrId}`,
          ruleId: 'IMG-001',
          title: 'Image has empty alt text — verify it is decorative',
          severity: 'suggestion',
          sectionId,
          description: `"${name}" has an empty alt attribute (descr=""). This is correct for decorative images, but if this image conveys information it needs descriptive alt text.`,
          suggestedFix: 'Verify this image is purely decorative. If it conveys information, add descriptive alt text.',
          instructionOnly: true,
        });
      }
    });

    return issues;
  },
};

export default IMG_001;
