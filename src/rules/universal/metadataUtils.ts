/**
 * Shared helpers for the META-001 / META-002 / META-003 body-paragraph checks.
 *
 * Metadata fields appear as plain text paragraphs near the top of a NOFO
 * document in one of these formats:
 *
 *   Metadata author: [value]
 *   Author: [value]
 *   Metadata subject: [value]
 *   Subject: [value]
 *   Metadata keywords: [value]
 *   Keywords: [value]
 *
 * The rules flag a paragraph only when the value after the colon is empty or
 * matches a known template placeholder phrase. A real value suppresses the issue.
 */

/**
 * Parse the HTML body, find the first <p> whose trimmed text starts with
 * fieldPattern (which must match up to and including the colon), and return
 * the text after the colon. Returns null if no matching paragraph is found.
 */
export function extractMetadataBodyValue(html: string, fieldPattern: RegExp): string | null {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, 'text/html');
  const paragraphs = Array.from(htmlDoc.querySelectorAll('p'));
  const safeFieldPattern = new RegExp(
    fieldPattern.source,
    fieldPattern.flags.replace(/[gy]/g, '')
  );

  const matchingPara = paragraphs.find(p =>
    safeFieldPattern.test((p.textContent ?? '').trim())
  );
  if (!matchingPara) return null;

  const fullText = (matchingPara.textContent ?? '').trim();
  const colonIdx = fullText.indexOf(':');
  return colonIdx >= 0 ? fullText.slice(colonIdx + 1).trim() : '';
}

/**
 * Returns true if the value is empty or matches a known template placeholder
 * pattern, meaning the field has not been filled in yet.
 *
 * Recognized placeholders:
 *  - Empty or whitespace-only string
 *  - Starts with "[" (bracket-style placeholder, e.g. "[Author Name]")
 *  - Contains "leave blank"
 *  - Contains "leave as is"
 *  - Contains "coach will insert"
 */
export function isMetadataPlaceholder(value: string): boolean {
  if (!value.trim()) return true;
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) return true;
  if (/\bleave\s+blank\b/i.test(trimmed)) return true;
  if (/\bleave\s+as\s+is\b/i.test(trimmed)) return true;
  if (/\bcoach\s+will\s+insert\b/i.test(trimmed)) return true;
  return false;
}
