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
| LINK-005 | Same text, different destinations | Warning | The same link text points to different URLs. May confuse screen reader users. |
| LINK-006 | Internal bookmark not found | Warning | An internal anchor link (`#bookmark`) points to a target that was not found in the document. The rule attempts a normalize-and-compare fuzzy match (lowercase, underscores/hyphens → spaces, punctuation stripped) against OOXML bookmarks, HTML element IDs, and heading text before giving up. Matching uses a two-pass strategy: first with the anchor as-is, then — if no match is found — with Word's trailing numeric suffix (`_1`, `_2`, etc.) stripped (Word appends these when multiple headings share the same text, e.g. `#_Project_narrative_1`). When the suffix-stripped pass finds a match, the Review card includes a warning that multiple headings with this name may exist. A single match from any candidate source surfaces a Review card with a pre-filled suggestion the user can confirm or edit; multiple matches surface an ambiguous-anchor card with no auto-fix; no matches fall through to a broken-link warning. |
| LINK-008 | Email address mailto enforcement (auto-apply) | Error | Plain-text email addresses are automatically converted to `mailto:` hyperlinks. Links whose `href` contains an email address but is missing the `mailto:` protocol are flagged as errors for manual correction. |

### Tables (TABLE)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| TABLE-001 | Table missing header row | Error | A table has no `<th>` elements in its first row. All multi-row tables must have a header row for accessibility. The issue card includes an estimated page number to help locate the table in Word. |
| TABLE-002 | Table missing caption | Warning | A table has no caption element. Captions must follow the format `Table: Title of table` in normal (unstyled) text, placed directly above the table with no blank line — a bold line or heading does not count. Exempt table types (application contents, standard forms, application checklist, merit review criteria, reporting) are suppressed automatically where detectable; the issue card notes the exempt categories for cases the rule cannot detect. |
| TABLE-003 | Table contains merged cells | Warning | A table uses `colspan` or `rowspan`. Merged cells can be difficult for assistive technology to interpret. |

### Footnotes and endnotes (NOTE)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| NOTE-001 | Footnotes present | Warning | The document appears to contain footnotes. All notes must be converted to endnotes before design. |
| NOTE-002 | Endnotes present — verify intent | Suggestion | Endnotes detected. Verify they are intentional and not accidentally placed footnotes. |
| NOTE-003 | Auto-convert footnotes to endnotes (auto-apply) | — | Flags documents with footnotes but no endnotes for mandatory manual conversion. |

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

### Text formatting (FORMAT)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| FORMAT-001 | Excessive bold text | Suggestion | A section has an unusually high proportion of bold text, which may indicate incorrect use of Word styles. |

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

### HRSA structure checks (STRUCT-007 through STRUCT-009, STRUCT-020, STRUCT-025)

| Rule ID | Title | Applies to |
|---------|-------|------------|
| STRUCT-007 | Required "Before You Begin" section | All HRSA guides |
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
