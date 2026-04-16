export const RULES_REFERENCE_URL =
  'https://github.com/agilesix/nofo-design-prep-checker/blob/main/docs/rules.md#rules-reference';

/**
 * Canonical list of labeled-component reference words used in NOFO documents.
 * A word from this list immediately followed by a single uppercase letter (A–Z)
 * or digit is a proper label (e.g. "Component A", "Appendix B", "Figure 3")
 * whose capitalization is intentional.
 *
 * Shared by HEAD-001 (sentence-case exemption) and TABLE-002 (caption title-case
 * check) so the two rules cannot diverge.
 */
export const COMPONENT_LABEL_WORDS = [
  'Component', 'Table', 'Appendix', 'Figure', 'Exhibit',
  'Part', 'Attachment', 'Section',
] as const;
