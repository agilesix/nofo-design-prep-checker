export const RULES_REFERENCE_URL =
  'https://github.com/agilesix/nofo-design-prep-checker/blob/main/docs/rules.md#rules-reference';

/**
 * Canonical list of labeled-component reference words used in NOFO documents.
 * A word from this list (or its simple plural) immediately followed by a
 * designator — a single uppercase letter, Roman numeral, or Arabic number —
 * is a proper label (e.g. "Component A", "Phase II", "Figure 10") whose
 * capitalization is intentional.
 *
 * Shared by HEAD-001 (sentence-case exemption) and TABLE-002 (caption title-case
 * check) so the two rules cannot diverge.
 */
export const COMPONENT_LABEL_WORDS = [
  'Component', 'Table', 'Appendix', 'Figure', 'Exhibit',
  'Part', 'Attachment', 'Section', 'Phase', 'Objective',
] as const;

/**
 * Matches a designator identifier that may follow a COMPONENT_LABEL_WORDS word:
 *   - Single uppercase letter (A–Z): Component A, Appendix B
 *   - Two or more uppercase I/V/X characters (II, III, IV, VI, …): Phase II, Phase III
 *     This branch is intentionally permissive and does not validate strict Roman-numeral syntax.
 *     Single-letter I, V, and X designators are caught by the [A-Z] branch.
 *   - Arabic number, one or more digits (1, 10, 100, …): Table 1, Figure 10
 */
export const DESIGNATOR_RE = /^([A-Z]|[IVX]{2,}|[0-9]+)$/;

/**
 * Returns true when `word` is a component-label designator word, accepting
 * the singular form or a simple plural (trailing 's'). Case-insensitive.
 *
 * Examples that return true: "Component", "Components", "Phase", "Phases",
 *   "Table", "Tables", "Appendix", "Figure", "Figures", "Objective", "Objectives"
 */
export function isComponentLabel(word: string): boolean {
  const lower = word.toLowerCase();
  return COMPONENT_LABEL_WORDS.some(
    label => lower === label.toLowerCase() || lower === label.toLowerCase() + 's',
  );
}
