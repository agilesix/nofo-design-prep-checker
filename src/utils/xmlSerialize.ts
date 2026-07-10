const _xmlSerializer = new XMLSerializer();

/**
 * XMLSerializer.serializeToString() drops the XML declaration. Word for iOS
 * (and strict XML consumers) require it — desktop Word auto-repairs missing
 * declarations, masking the issue on non-iOS platforms. This wrapper restores
 * the standard OOXML declaration whenever it is absent.
 */
export function serializeXml(xmlDoc: Document): string {
  const raw = _xmlSerializer.serializeToString(xmlDoc);
  return raw.startsWith('<?xml') ? raw : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${raw}`;
}
