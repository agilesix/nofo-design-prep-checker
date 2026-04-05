import mammoth from 'mammoth';
import JSZip from 'jszip';
import type { ParsedDocument, Section, ActiveContentGuide } from '../types';
import { sanitizeHtml } from './sanitize';

export async function parseDocx(
  file: File,
  activeContentGuide: ActiveContentGuide | null
): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();

  // Parse with mammoth for HTML
  const mammothResult = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
      ],
    }
  );

  const html = sanitizeHtml(mammothResult.value);

  // Load as JSZip for raw XML access
  const zipArchive = await JSZip.loadAsync(arrayBuffer);

  // Read core XML files now so rules can inspect OOXML synchronously
  const documentXmlFile = zipArchive.file('word/document.xml');
  const footnotesXmlFile = zipArchive.file('word/footnotes.xml');
  const endnotesXmlFile = zipArchive.file('word/endnotes.xml');

  const [documentXml, footnotesXml, endnotesXml] = await Promise.all([
    documentXmlFile ? documentXmlFile.async('string') : Promise.resolve(''),
    footnotesXmlFile ? footnotesXmlFile.async('string') : Promise.resolve(''),
    endnotesXmlFile ? endnotesXmlFile.async('string') : Promise.resolve(''),
  ]);
  // Extract raw text
  const rawText = extractRawText(html);

  // Build sections from headings
  const sections = buildSections(html);

  return {
    html,
    sections,
    rawText,
    zipArchive,
    documentXml,
    footnotesXml,
    endnotesXml,
    activeContentGuide,
  };
}

function extractRawText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

function buildSections(html: string): Section[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.children);

  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let sectionHtml = '';
  let pageEstimate = 1;
  let charCount = 0;
  const CHARS_PER_PAGE = 3000; // rough estimate

  // Add a default section for content before first heading
  currentSection = {
    id: 'section-preamble',
    heading: 'Document start',
    headingLevel: 0,
    html: '',
    rawText: '',
    startPage: 1,
  };

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const isHeading = /^h[1-6]$/.test(tag);

    if (isHeading) {
      // Save previous section
      if (currentSection) {
        currentSection.html = sectionHtml;
        currentSection.rawText = extractRawTextFromHtml(sectionHtml);
        sections.push(currentSection);
      }

      const level = parseInt(tag[1] ?? '1', 10);
      const headingText = el.textContent ?? '';

      charCount += headingText.length;
      pageEstimate = Math.floor(charCount / CHARS_PER_PAGE) + 1;

      currentSection = {
        id: `section-${sections.length + 1}-${headingText.slice(0, 30).replace(/\s+/g, '-').toLowerCase()}`,
        heading: headingText,
        headingLevel: level,
        html: '',
        rawText: '',
        startPage: pageEstimate,
      };
      sectionHtml = el.outerHTML;
    } else {
      charCount += (el.textContent ?? '').length;
      sectionHtml += el.outerHTML;
    }
  }

  // Push last section
  if (currentSection) {
    currentSection.html = sectionHtml;
    currentSection.rawText = extractRawTextFromHtml(sectionHtml);
    sections.push(currentSection);
  }

  return sections;
}

function extractRawTextFromHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}
