export function getCategoryLabel(ruleId: string): string {
  const prefix = (ruleId.split('-')[0] ?? ruleId).toUpperCase();
  const labels: Record<string, string> = {
    META: 'Document metadata',
    CLEAN: 'Document readiness',
    HEAD: 'Headings',
    LINK: 'Links',
    TABLE: 'Tables',
    NOTE: 'Footnotes and endnotes',
    IMG: 'Images',
    LIST: 'Lists',
    FORMAT: 'Text formatting',
    STRUCT: 'Required sections',
  };
  return labels[prefix] ?? prefix;
}
