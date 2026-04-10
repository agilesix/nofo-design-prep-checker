# Rules reference

This document lists all checks run by the NOFO Design Prep Checker. Rules are identified by a rule ID in the format `CATEGORY-NNN`.

## Universal rules

Universal rules run on every document regardless of which content guide is selected.

### Metadata (META)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| META-001 | Document author metadata | Warning | The Author field in Document Properties should follow the format `Full OpDiv Name (ABBREVIATION)`. |
| META-002 | Document subject metadata | Warning | The Subject field should follow the formula: "A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO]." (~25 words or less). |
| META-003 | Document keywords metadata | Warning | The Keywords field should contain 8–10 specific terms from the NOFO, separated by commas. |

### Links (LINK)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| LINK-001 | Raw URL as link text | Error | A hyperlink's display text is the URL itself. Link text should describe the destination. |
| LINK-002 | Non-descriptive link text | Error | Link text is non-descriptive ("click here", "here", "read more", etc.). Fails accessibility requirements. |
| LINK-003 | Missing protocol in URL | Error | A link's `href` is missing `http://` or `https://`. |
| LINK-004 | Malformed URL | Error | A link's URL is malformed and may not resolve correctly. |
| LINK-006 | Internal bookmark not found | Warning | An internal anchor link (`#bookmark`) points to a target that was not found in the document. The rule attempts fuzzy matching through three passes before giving up: (1) normalize-and-compare against OOXML bookmarks, HTML element IDs, and heading text — heading text uses both direct containment and a stop-word-stripped containment check to handle slugs where Word dropped connective words like "and" or "or" (e.g. `#Program_requirements_expectations` matches "Program requirements and expectations"); (2) strip Word's trailing numeric suffix (`_1`, `_2`, etc.) and retry — Word appends these when multiple headings share the same text; (3) numeric extraction fallback — extract integers from the anchor and match against headings where a structural keyword (Attachment, Section, Step, Part, Appendix, Exhibit) immediately precedes that number (e.g. `#Attach8OrgChart` matches "Attachment 8: Non-duplication…"). A single match surfaces a Review card with a pre-filled suggestion; multiple matches surface an ambiguous-anchor card; no match falls through to a broken-link warning. |
| LINK-008 | Email address mailto enforcement (auto-apply) | Error | Plain-text email addresses are automatically converted to `mailto:` hyperlinks. Links whose `href` contains an email address but is missing the `mailto:` protocol are flagged as errors for manual correction. |

### Tables (TABLE)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| TABLE-002 | Table missing caption | Warning | A table has no caption element. Captions must follow the format `Table: Title of table` in normal (unstyled) text, placed directly above the table with no blank line — a bold line or heading does not count. Exempt table types (key facts tables, key dates tables, callout boxes/single-cell tables, application contents, standard forms, application checklist, merit review criteria, reporting) are suppressed automatically where detectable; the issue card notes the exempt categories for cases the rule cannot detect. |
| TABLE-003 | Table contains merged cells | Suggestion | A table uses `colspan` or `rowspan`. Merged cells can sometimes be harder for screen readers to interpret, but are acceptable when the table structure is clear and the merging aids comprehension. |

### Footnotes and endnotes (NOTE)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| NOTE-001 | Footnotes present | Warning | The document appears to contain footnotes. All notes must be converted to endnotes before design. |
| NOTE-004 | Orphaned "Footnotes" heading | Warning | A heading paragraph with the text "Footnotes" (or close variation) was found, but the document contains no footnotes or endnotes. This heading is likely a leftover from the Word template and will appear as an empty section in the published NOFO. |

### Images (IMG)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| IMG-001 | Image missing alt text | Error | An image has no `alt` attribute. All informational images must have descriptive alt text. |

### Lists (LIST)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| LIST-001 | Manual bullet or numbered list | Warning | Consecutive paragraphs use manual bullet characters or numbering instead of proper Word list styles. |

### Document readiness (CLEAN)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| CLEAN-004 | Collapse double spaces in body text (auto-apply) | — | Two or more consecutive spaces between words in body paragraphs are silently collapsed to a single space. Excludes headings, table cells, and code/preformatted blocks. |
| CLEAN-005 | Tagline relocation (auto-apply) | — | Checks whether the document's standalone tagline paragraph is positioned immediately after the metadata block (immediately before the first heading). If not, silently moves it there. Also removes any duplicate tagline paragraphs found elsewhere in the document. Skips when no standalone tagline is found, when no headings are present, or when the tagline is already in the correct position. Applies to all NOFOs. |
| CLEAN-008 | Remove leading spaces from heading text (auto-apply) | — | Heading paragraphs (Heading 1 through Heading 6) whose text content begins with one or more space characters have those leading spaces silently removed. Only leading spaces are removed — trailing spaces and spaces within the heading text are left intact. Applies to headings only; body paragraphs, captions, list items, and other paragraph styles are unaffected. No entry appears in the auto-applied list when no headings have leading spaces. |
| CLEAN-009 | Accept tracked changes and remove comments (auto-apply) | — | If the document contains any tracked changes (insertions, deletions, move annotations, or formatting change records) or comment annotations in the document body, footnotes, or endnotes, the downloaded output is silently cleaned across those XML parts: tracked insertions (`w:ins`, `w:moveTo`) are accepted by keeping their content and removing the wrapper; tracked deletions (`w:del`, `w:moveFrom`) and their content are discarded; formatting change records (`w:rPrChange`, `w:pPrChange`, `w:sectPrChange`, `w:tblPrChange`) are removed. Comment range markers and comment reference runs are removed from those processed parts; `word/comments.xml` and `word/commentsExtended.xml` are removed from the ZIP; and their relationship entries are removed from `word/_rels/document.xml.rels`. No entry appears in the auto-applied list when no tracked changes or comments are present in the document body, footnotes, or endnotes. |
| CLEAN-010 | Normalize list item punctuation (auto-apply) | — | For each bulleted or numbered list with 3 or more items where at least one item already ends with a period, silently adds a trailing period to every item that is missing one. Only a period (`.`) triggers and satisfies the rule — other punctuation (?, !, :, ;) is not treated as equivalent. Empty list items are skipped. Lists where no items end with a period, or lists with fewer than 3 items, are left unchanged. No entry appears in the auto-applied list when no qualifying lists are found. |
| CLEAN-011 | Normalize application checklist checkboxes (auto-apply) | — | Scans all tables under the "Application checklist" heading (H2 or H3, case-insensitive) and corrects two issues in the first column cell of each row. (1) Glyph: the first non-whitespace character must be ◻ (U+25FB WHITE MEDIUM SQUARE); incorrect substitutes — ☐, ☑, ☒, □, •, and 'o'/'O' or any other non-alphanumeric character used as a placeholder (immediately followed by a space) — are silently replaced. (2) List style: if the cell's paragraph style contains "List" or "Bullet" (e.g. ListParagraph, ListBullet), it is changed to Normal to prevent NOFO Builder from overwriting the glyph on import. Only the first column of checklist tables is inspected; tables outside the Application checklist section are not affected. No entry appears in the auto-applied list when no corrections are needed. |

### Text formatting (FORMAT)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| FORMAT-002 | Date format correction (auto-apply) | — | Scans paragraph text and table cells for dates that do not follow the SimplerNOFOs style guide format of "Month D, YYYY". Automatically corrects: MM/DD/YYYY (4-digit year) → Month D, YYYY; YYYY-MM-DD → Month D, YYYY; ordinal day suffixes (e.g. "April 16th, 2026") → "April 16, 2026"; missing comma between day and year (e.g. "April 16 2026") → "April 16, 2026"; abbreviated month names with or without trailing period (e.g. "Apr. 2, 2026" or "Apr 2, 2026") → "April 2, 2026"; leading-zero day (e.g. "April 02, 2026") → "April 2, 2026". These month-name issues may appear in combination (e.g. "Apr. 16th 2026" is corrected in a single pass). MM/DD/YY (2-digit year) is intentionally not corrected — there is no reliable way to determine the correct century. When a day name precedes the date (e.g. "Monday, April 02, 2024") the day name is preserved. Excludes headings and code/preformatted blocks. No entry appears in the auto-applied list when zero corrections are needed. **Exception: HRSA NOFOs use MM/DD/YYYY by convention — this rule is skipped entirely for all HRSA content guides.** |

---

## OpDiv-specific rules (STRUCT)

OpDiv rules only run when a content guide is selected. They check for required sections based on the selected guide.

### Standard OpDiv structure checks (STRUCT-001 through STRUCT-006)

These run for ACF, ACL, CDC (standard), CMS, and IHS content guides.

| Rule ID | Title | Applies to |
|---------|-------|------------|
| STRUCT-001 | Required "Basic Information" or "Step 1" section | ACF, ACL, CDC, CMS, IHS |
| STRUCT-002 | Required "Program Description" or "Step 2" section | ACF, ACL, CDC, CMS, IHS |
| STRUCT-003 | Required "Eligibility" or "Step 3" section | ACF, ACL, CDC, CMS, IHS |
| STRUCT-004 | Required "Application and Submission" or "Step 4" section | ACF, ACL, CDC, CMS, IHS |
| STRUCT-005 | Required "Review and Selection" or "Step 5" section | ACF, ACL, CDC, CMS, IHS |
| STRUCT-006 | Required "Award Administration" or "Step 6" section | ACF, ACL, CDC, CMS, IHS |

### HRSA auto-applied changes (CLEAN-006)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| CLEAN-006 | Remove "Before You Begin" heading (auto-apply) | — | NOFO Builder does not use a "Before You Begin" heading. For HRSA NOFOs, any heading-level paragraph (any heading level) whose text is exactly "Before You Begin" is automatically removed from the downloaded document. The content below the heading is preserved. Scoped to HRSA content guides only. |

### HRSA structure checks (STRUCT-007 through STRUCT-009, STRUCT-020, STRUCT-025)

| Rule ID | Title | Applies to |
|---------|-------|------------|
| STRUCT-007 | Required "Before You Begin" section | All HRSA guides (note: CLEAN-006 removes this heading from the downloaded document; STRUCT-007 checks the original upload and will not conflict) |
| STRUCT-008 | Required "Trainee Eligibility" section | HRSA BHW, MCHB, RR |
| STRUCT-009 | Required "Project Description" section | HRSA Construction |
| STRUCT-020 | Required "Program Requirements" section | HRSA BPHC |
| STRUCT-025 | Application guide reference | All HRSA guides |

### IHS-specific checks (STRUCT-010)

| Rule ID | Title | Applies to |
|---------|-------|------------|
| STRUCT-010 | Required "Tribal Resolution" section | IHS |

### OpDiv-specific content checks (STRUCT-021 through STRUCT-024, STRUCT-026)

| Rule ID | Title | Applies to |
|---------|-------|------------|
| STRUCT-021 | eRA Commons reference | CDC Research |
| STRUCT-022 | Funding opportunity number present | ACF |
| STRUCT-023 | Required "Summary" section | CMS |
| STRUCT-024 | Contact information section | ACL |
| STRUCT-026 | PHS 398 reference | CDC Research |

---

## Adding new rules

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed instructions on adding, testing, and documenting new rules.

### Quick checklist

1. Create a new file in `src/rules/universal/` or `src/rules/opdiv/`
2. Export a default object implementing the `Rule` interface from `src/types/index.ts`
3. Set `contentGuideIds` if the rule is OpDiv-specific; omit it for universal rules
4. Set `autoApply: true` only for changes that should happen without user review
5. Add the rule to `src/rules/index.ts`
6. Write a test in `src/rules/__tests__/`
7. Add the rule to this document

### Severity guide

| Severity | Use when |
|----------|----------|
| `error` | The issue will cause an accessibility failure or technical problem |
| `warning` | The issue may cause a problem or violates a content guide requirement |
| `suggestion` | The issue is a best practice — worth knowing but not critical |
