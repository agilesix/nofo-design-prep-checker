import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'br', 'img', 'span', 'div', 'blockquote', 'caption'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'colspan', 'rowspan', 'scope', 'class', 'id', 'target', 'rel'],
  });
}
