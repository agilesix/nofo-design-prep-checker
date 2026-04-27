# Rules reference

This document lists all checks run by the NOFO Design Prep Checker. Rules are identified by a rule ID in the format `CATEGORY-NNN`.

## Universal rules

Universal rules run on every document regardless of which content guide is selected.

### Headings (HEAD)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| HEAD-001 | Heading capitalization | Auto-fix (H2) / Suggestion (H1–H6 for "Form"; H3–H6 otherwise) | H2 headings must use title case (all major words capitalized); H3–H6 headings must use sentence case (only first word and proper nouns capitalized). **H2 auto-fix:** when sentence case is detected in an H2 heading, the downloaded document is silently corrected to title case. Title case rules: capitalize major words; treat articles (a, an, the), coordinating conjunctions (and, but, or, nor, for, so, yet), and minor prepositions/connections (for example: to, in, of, at, by, up, as, on, from, with, into, over, upon, via) as minor words except at the start of the heading or immediately after a colon; leave ALL-CAPS words (acronyms like HRSA, CDC) and other already-capitalized words unchanged. This means the auto-fix does not force a capitalized minor word to lowercase if it is already capitalized in the source heading. A single summary entry ("X H2 heading(s) corrected to title case") is added to the auto-applied changes. **H3–H6:** title case is flagged as a suggestion only — corrections must be made in the source Word document. **Exceptions (not flagged, not auto-fixed):** headings that reference federal laws, acts, or directives are excluded from all checks, including: Paperwork Reduction Act, Plain Writing Act, Rehabilitation Act, Americans with Disabilities Act, Freedom of Information Act, Privacy Act, Administrative Procedure Act, Federal Grant and Cooperative Agreement Act, Uniform Guidance; any heading containing "Executive Order"; any heading matching the "Act of" or "Act," pattern; any heading containing "Section N" (e.g. "Section 508", "Section 1557"). Headings containing form identifiers (SF-424, SF-424A, SF-LLL, PHS 398, R&R, and similar patterns — 2–4 uppercase letters followed by a hyphen or space and alphanumeric content) are also exempt from the general capitalization check, since their capitalization is intentional. Headings containing federal grants system and portal names — eRA Commons, Grants.gov, SAM.gov, USASpending.gov, PaymentManagement.gov, and GrantSolutions — are also exempt; these names use non-standard casing by convention and any heading referencing them is assumed to be intentionally cased. Headings containing "CDC" as a standalone whole word are also exempt, but only for case-sensitive matches; headings containing "CDC-funded" are also exempt via a case-insensitive match. These reference the agency name by convention. In addition, individual words that begin with a lowercase letter followed by one or more uppercase letters (e.g. "eRA") are treated as intentional mixed-case proper nouns at the word level — they are neither treated as sentence-case evidence nor capitalized when a heading is auto-fixed to title case. **Additional check — capitalized "Form" (H1–H6, suggestion):** if the word "Form" (capital F) appears in any non-first-word position in a heading, a suggestion is emitted. Per the SimplerNOFOs style guide, "form" should be lowercase when it follows a form name — for example, "SF-424 application form" not "SF-424 Application Form". This check applies even to form-identifier and federal-system headings that are otherwise exempt from the general cap check. |
| HEAD-002 | Document has more than one H1 heading | Warning | NOFO Builder requires exactly one H1 per document — the NOFO title. Step titles (e.g. "Step 1: Review the Opportunity") should be styled as H2, not H1. Multiple H1 headings will cause accessibility issues in the final PDF. **HRSA exception:** this rule is skipped entirely for all HRSA content guides (hrsa-rr, hrsa-bhw, hrsa-bphc, hrsa-construction, hrsa-mchb) — NOFO Builder auto-demotes HRSA H1 step titles on import. Instruction-only; no auto-fix. |
| HEAD-003 | Heading levels skip a level | Warning | A heading whose level is more than one step deeper than the preceding heading will cause NOFO Builder to warn about incorrectly nested headings on import and creates navigation problems for screen readers. One issue card is emitted per skipped heading. **Suggested level logic:** if the heading immediately following the flagged heading is at the same or deeper level, the flagged heading is treated as a section opener and H[preceding+1] is suggested; if the following heading is at the same or shallower level as the preceding heading, the flagged heading is likely a peer and H[preceding] is suggested; otherwise (following is between the two levels, or there is no following heading) the context is ambiguous and the issue is instruction-only. **Accept-to-fix:** when a suggested level can be determined, a text input pre-filled with the suggested level is shown — the user can confirm or change the value and accept to apply the correction to the downloaded document. The fix changes the Word paragraph style (`w:pStyle`) from `Heading N` to the accepted level. Ambiguous cases are instruction-only with no accept-to-fix. Applies to all content guides. |
| HEAD-004 | Heading may be too long | Suggestion | Per WCAG 2.0 G130, headings should be descriptive and concise. Flags H3–H6 headings that exceed 10 words or 80 characters (whichever threshold is reached first). H1 (NOFO title) and H2 (step titles) are excluded. Headings that appear to be entirely a proper noun phrase — every significant word starts with an uppercase letter — are also excluded, as long organization names are not heading length violations. **Accept-to-fix:** a text input pre-filled with the current heading text is shown; the user can enter a shorter replacement and accept to apply it to the downloaded document. The heading level (H3–H6) is preserved exactly — only the `w:t` text content is updated, never the `w:pStyle` or run formatting. If the user accepts without changing the prefilled text, no change is applied. Applies to all content guides. |

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
| LINK-006 | Internal link anchor may need updating | Warning | An internal anchor link (`#bookmark`) points to a target that could not be found in the document. **OOXML bookmark match (user-accepted fix):** if the anchor normalizes to exactly one existing `w:bookmarkStart` name in the document — via capitalization, leading/trailing underscores, CamelCase word-boundary splitting, Word's trailing numeric-suffix stripping (`_1`, `_2`, …), or stop-word-stripped containment — a Review card is shown pre-filled with the exact bookmark name. Accepting rewrites `w:anchor` in the downloaded docx to the correct value. **All other cases (Source 2/3 or no match):** instruction-only warning directing the user to use Insert → Link → This Document in Word. Fuzzy matching via heading text also surfaces a **link-text suggestion** when the link text does not already name the destination heading. |
| LINK-007 | [PDF] label on external PDF links (auto-apply) | — | External hyperlinks whose URL contains ".pdf" (case-insensitive) must include "[PDF]" at the end of the link text. Three cases: (1) link text does not already end with "[PDF]" (case-insensitive) — " [PDF]" is appended silently; (2) link text already ends with "[PDF]" (case-insensitive) — no change; (3) "[PDF]" appears as plain text immediately after the hyperlink but is not part of the link text — "[PDF]" is moved inside the link text and the adjacent plain-text occurrence is removed. Excludes internal bookmark links (`#…`) and `mailto:` links. No entry appears in the auto-applied list when no qualifying links are found. |
| LINK-008 | Email address mailto enforcement (auto-apply) | Error | Plain-text email addresses are automatically converted to `mailto:` hyperlinks. Links whose `href` contains an email address but is missing the `mailto:` protocol are flagged as errors for manual correction. |
| LINK-009 | Fix partial hyperlinks — characters outside the link element (auto-apply) | — | In Word, it is possible for characters that are part of a linked word to be accidentally placed outside the `w:hyperlink` element as adjacent plain-text runs. This rule detects and corrects two cases: (1) **Leading**: the `w:r` run immediately preceding the hyperlink ends with one or more non-whitespace characters AND the hyperlink's text also starts with a non-whitespace character — the trailing non-whitespace characters are moved from the preceding run into a new run at the start of the hyperlink; (2) **Trailing**: the `w:r` run immediately following the hyperlink starts with one or more non-whitespace characters AND the hyperlink's text ends with a non-whitespace character — the leading non-whitespace characters are moved from the following run into a new run at the end of the hyperlink. "Immediately adjacent" means a direct sibling of the `w:hyperlink` in the paragraph with no intervening elements other than `w:bookmarkStart` / `w:bookmarkEnd` (which are transparent non-text markers). If the external run becomes empty after the move, it is removed entirely. Run properties from the external run are preserved on the new internal run. Applies to both external (`r:id`) and internal (`w:anchor`) hyperlinks. No entry appears in the auto-applied list when no qualifying hyperlinks are found. |

### Tables (TABLE)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| TABLE-002 | Table missing caption | Warning / Suggestion | A table has no caption. Any non-empty paragraph (normal or bold text) placed directly above the table with no blank line is accepted as a valid caption — a `Table:` prefix is not required. A `<caption>` element is also accepted. In addition, the issue may be suppressed when a nearby heading (`H1`–`H4` only for the current nearest-heading lookup) within 50 words of body text effectively serves as the table caption, even if there is no `<caption>` or directly preceding paragraph. When a caption is found but the text appears to use title case or all-caps, a separate low-priority suggestion is emitted recommending sentence case (capitalize only the first word and proper nouns). **Exempt table types — suppressed entirely, no caption required:** (1) **Callout boxes** — single-cell tables (exactly one `<td>` or `<th>`) are exempt regardless of their content. (2) **Key facts / key dates tables** — detected when the first cell or first row contains "Key facts" or "Key dates". (3) **Application contents** — detected when the section heading or nearest preceding heading (`H1`–`H4` only) contains "application contents" or "table of contents". (4) **Standard forms** — detected when the section or nearest heading (`H1`–`H4` only) contains "standard forms" or "required forms", or when the first row contains an SF-424 or "Standard Form N" identifier. (5) **Application checklist** — detected when the section or nearest heading (`H1`–`H4` only) contains "application checklist", when the first row contains that phrase, or structurally when at least two rows have a checkbox glyph (◻ ☐ □ ☑ ☒) in the first column. (6) **Merit review criteria** — detected when the section or nearest heading (`H1`–`H4` only) contains "merit review" (parentheticals such as "(50 points)" do not prevent matching), or when the first row contains "merit review criteria", "maximum points", or "total points". (7) **Reporting** — detected when the section or nearest heading (`H1`–`H4` only) contains the word "reporting" (matches "Reporting", "Reporting requirements", "Post-award reporting", etc.), or when the first row contains "report type". The issue card lists all exempt categories so reviewers can use their judgment for any table the rule could not automatically detect. |
| TABLE-003 | Table contains merged cells | Suggestion | A table uses `colspan` or `rowspan`. Merged cells can sometimes be harder for screen readers to interpret, but are acceptable when the table structure is clear and the merging aids comprehension. |
| TABLE-004 | Apply heading style to "Important: public information" callout (auto-apply) | — | Single-cell tables whose first paragraph starts with "Important: public information" (case-insensitive) and contains at least one additional paragraph are silently given a heading paragraph style. The heading level matches the nearest preceding heading in the document body; defaults to Heading 5 when no preceding heading is found. |

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
| CLEAN-011 | Normalize application checklist checkboxes (auto-apply) | — | Scans tables in two scopes and corrects three issues in the first column cell of each non-header row. **Scope A:** tables under the "Application checklist" heading (H2 or H3, case-insensitive). **Scope B:** tables under the H4 headings "Narratives", "Attachments", or "Other required forms" (case-insensitive) within the "Step 3: Build Your Application" section (H2 or H3). **(1) Wrong glyph:** the first non-whitespace character must be ◻ (U+25FB WHITE MEDIUM SQUARE); incorrect substitutes — ☐, ☑, ☒, □, •, and 'o'/'O' or any other non-alphanumeric character used as a placeholder (immediately followed by a space) — are silently replaced. **(2) List style:** if the cell's paragraph style contains "List" or "Bullet" (e.g. ListParagraph, ListBullet), it is changed to Normal to prevent NOFO Builder from overwriting the glyph on import. **(3) Missing glyph:** if the first-column cell of a non-header row has no checkbox glyph at all (cell text begins with an alphanumeric character), ◻ followed by a space is silently prepended. Header rows (w:tblHeader) are skipped for all three fixes. Only the first column of checklist tables is inspected. No entry appears in the auto-applied list when no corrections are needed. |
| CLEAN-012 | Bold "asterisked ( * )" in Approach and Program logic model sections (auto-apply) | — | Finds the exact phrase "asterisked ( * )" (case-insensitive) in paragraph text under headings whose text matches "Approach" or "Program logic model" (case-insensitive, including their subheadings). If the phrase is present and not already fully bold, it is silently bolded in the downloaded output. The OOXML patch splits runs at phrase boundaries as needed to ensure only the exact phrase is bolded — surrounding text is unaffected. Scope ends when a heading at the same or higher level is encountered. No entry appears in the auto-applied list when no qualifying instances are found. |
| CLEAN-014 | Universal auto-apply CLEAN rule | — | Universal auto-apply rule included in the implemented CLEAN rule set. Add this entry to keep the documentation aligned with the actual rules shipped by the checker. |
| CLEAN-015 | Remove bold styling from list item bullet characters (auto-apply) | — | In Word documents, the paragraph-level `w:rPr` (inside `w:pPr`) controls the formatting of the generated bullet or number character independently from the item's text runs. If `w:b` or `w:bCs` is present in that paragraph-level `w:rPr`, the bullet/number renders bold regardless of the text styling. This rule silently removes `w:b` and `w:bCs` from the `w:pPr/w:rPr` of every list paragraph (any `w:p` with a `w:numPr` element in its `w:pPr`). Only the paragraph-level run properties are modified — `w:rPr` elements on individual `w:r` text runs within the same paragraph are left entirely unchanged, preserving any bold applied to the item text itself. Applies to all ordered (numbered) and unordered (bulleted) list paragraphs. No entry appears in the auto-applied list when no list paragraphs have bold bullet/number formatting. |
| CLEAN-016 | Remove bold styling from trailing periods preceded by normal text (auto-apply) | — | In Word documents, a period at the end of a sentence is sometimes accidentally bold while the preceding text is not. If the last direct `w:r` run in a paragraph ends with a period and is bold, but the immediately preceding `w:r` run is not bold, `w:b` and `w:bCs` are silently removed from the period run's `w:rPr`. If the period is the only character in its run, bold is removed from that run entirely. If the period shares a run with other bold characters, the run is split: the prefix characters remain in a bold run, and the period moves to a new non-bold run. Skipped when the preceding run is also bold (the bold period is intentional, e.g. the entire paragraph is bold), when there is no preceding run, or when the last character is not a period. No entry appears in the auto-applied list when no qualifying paragraphs are found. |

### Text formatting (FORMAT)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| FORMAT-002 | Date format correction (auto-apply) | — | Scans all paragraph types (including list items and table cells) for dates that do not follow the SimplerNOFOs style guide format of "Month D, YYYY". Automatically corrects: MM/DD/YYYY (4-digit year) → Month D, YYYY; YYYY-MM-DD → Month D, YYYY; ordinal day suffixes (e.g. "April 16th, 2026") → "April 16, 2026"; missing comma between day and year (e.g. "April 16 2026") → "April 16, 2026"; abbreviated month names with or without trailing period (e.g. "Apr. 2, 2026" or "Apr 2, 2026") → "April 2, 2026"; leading-zero day (e.g. "April 02, 2026") → "April 2, 2026". These month-name issues may appear in combination (e.g. "Apr. 16th 2026" is corrected in a single pass). MM/DD/YY (2-digit year) is intentionally not corrected — there is no reliable way to determine the correct century. When a day name precedes the date (e.g. "Monday, April 02, 2024") the day name is preserved. Excludes headings and code/preformatted blocks. No entry appears in the auto-applied list when zero corrections are needed. **Exception: HRSA NOFOs use MM/DD/YYYY by convention — this rule is skipped entirely for all HRSA content guides.** |
| CLEAN-013 | Unfilled placeholder text | Warning | Detects any occurrence of the pattern `{Insert...}` in the document body — text enclosed in curly braces that contains the word "insert" (case-insensitive). These are template placeholders that must be replaced with real content before the document is imported into NOFO Builder. All placeholders are grouped into a single issue card so the user can review them in one place; each entry shows the placeholder text and the nearest preceding heading so the user knows where to look. Excluded: paragraphs that begin with a metadata field label (`Author:`, `Metadata author:`, `Subject:`, `Metadata subject:`, `Keywords:`, `Metadata keywords:`) — these are surfaced by META-001, META-002, and META-003 instead; single-cell tables (treated as instructional callout boxes). Duplicate (placeholder, heading) pairs are shown only once. No auto-fix; the user selects "I'll do it later" to acknowledge. |
| FORMAT-003 | Time format correction (auto-apply) | — | Scans all paragraph types (including list items, body text, and table cells — no exclusions) for time expressions that do not follow the SimplerNOFOs style guide format. Automatically corrects: (1) AM/PM normalization — AM, A.M., A.M, am → a.m.; PM, P.M., P.M, pm → p.m.; handles both "11 AM" and "11AM" (with or without a space before the suffix); (2) Exact-hour :00 removal — 11:00 a.m. → 11 a.m., 3:00 p.m. → 3 p.m.; only removes :00 when minutes are exactly 00 — times with non-zero minutes (e.g. 3:30 p.m.) are left unchanged; (3) Timezone normalization — EST/EDT → ET, CST/CDT → CT, MST/MDT → MT, PST/PDT → PT; timezone is only normalized when it immediately follows a time expression. Corrections are applied in order (AM/PM first, then :00 removal, then timezone), so "11:00 AM EST" is fully corrected to "11 a.m. ET" in one pass. No entry appears in the auto-applied list when zero corrections are needed. |

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

### CDC auto-applied changes (CLEAN-007)

| Rule ID | Title | Severity | Description |
|---------|-------|----------|-------------|
| CLEAN-007 | Remove CDC preamble content (auto-apply) | — | CDC NOFO templates often begin with editorial instructions, content-guide reference tables, or other scaffolding that is not part of the NOFO itself. When any non-empty content appears before the heading "Step 1: Review the Opportunity" (any heading level, case-insensitive), everything before that heading is silently removed from the downloaded document. The heading itself and all content after it are preserved. CDC NOFO metadata (Author, Subject, Keywords, Tagline) lives inside the document body under Step 1, not before it, so this removal is safe. No entry appears in the auto-applied list when Step 1 is already the first body element. Applies to all CDC content guides: `cdc`, `cdc-research`, `cdc-dght-ssj`, `cdc-dght-competitive`, `cdc-dghp`. |

### Supported CDC content guides

| Content Guide ID | Display name | Detection signals |
|-----------------|--------------|-------------------|
| `cdc` | CDC Content Guide | CDC full name, "CDC" abbreviation, CDC Office of Grants Services |
| `cdc-research` | CDC Research Content Guide | CDC identifier + ≥2 of: eRA Commons, PHS 398, principal investigator |
| `cdc-dght-ssj` | CDC/DGHT SSJ Content Guide | CDC identifier + DGHT identifier + SSJ or "Prepare Your Application" signal |
| `cdc-dght-competitive` | CDC/DGHT Competitive Content Guide | CDC identifier + DGHT identifier + competitive or "Build Your Application" signal |
| `cdc-dghp` | CDC DGHP Competitive Content Guide | CDC identifier required + any ≥2 of: "CDC/DGHP", "Division of Global Health Protection", CDC-RFA-JG- opportunity number, "DGHP-SPECIFIC INSTRUCTIONS", "DGHP NOFO Tracker", "Global Health Security (GHS)", "Global Health Security Agenda (GHSA)", "We fund all Global Health Security (GHS) cooperative agreements" |

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
