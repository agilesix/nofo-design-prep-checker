# Architecture and implementation decisions

This file logs significant decisions made during the development of the NOFO Design Prep Checker — what was decided, why, and what alternatives were considered. Entries are added when a decision is non-obvious, affects user-facing behavior, or is likely to be revisited.

---

## 2026-04-06 — Duplicate "see" suppressed in internal link text suggestions

**Decision:** When suggesting updated link text for internal anchor links, the tool checks whether the word "see" already appears in the ~10 words preceding the link in the paragraph. If it does, the suggestion uses "(Destination)" instead of "(see Destination)".

**Reason:** Without this check, the tool produced grammatically redundant suggestions like "…see roles and responsibilities (see Cooperative agreement terms)" which would make the document read worse, not better.

**Outcome:** Suggestions are context-aware and avoid introducing redundant phrasing. Implemented in `LINK-006.ts` via the `hasSeeBeforeLink` helper and a `suppressSee` flag passed to `makeLinkTextSuggestion`.

---

## 2026-04-06 — Page number estimation removed

**Decision:** Issue locations no longer show an estimated page number. The nearest heading reference (e.g. "§ Near: Approach") is shown instead.

**Reason:** Word documents do not store page numbers in their XML structure — pagination is calculated by Word's rendering engine at display time based on font metrics, line breaks, image sizes, and other layout properties that are not present in the raw docx XML. Any page number the tool estimated from cumulative character offsets in the XML was unreliable and frequently inaccurate. Showing an estimated page number as though it were authoritative eroded user trust when the number did not match what users saw in Word.

**Alternative considered:** Improving the estimation heuristic (e.g. accounting for table rows, heading sizes, image heights) to reduce the frequency of wrong estimates. Rejected because the estimation is fundamentally limited by the absence of rendering information in the XML; a more sophisticated heuristic would still be wrong in many real documents and would add complexity with no reliability guarantee.

**Outcome:** `Issue.page` has been removed from the type and is no longer computed or stored. `LocationContext.page` and its `CHARS_PER_PAGE` constant have been removed from `locationContext.ts`. Issue locations now show only the nearest heading reference, which is accurate (derived directly from the parsed HTML heading order) and actionable (users can search for the heading in Word).

---

## 2026-04-11 — Keyword suggestions switched from structural headings to contextual extraction

**Decision:** `META-003`'s keyword prefill generator no longer uses document section headings as keyword sources. Instead it draws from four contextual sources in priority order: (1) OpDiv name and abbreviation (from content guide detection), (2) agency/subagency/bureau/division names from metadata field lines (`Agency:`, `Subagency:`, etc.), (3) opportunity name and tagline, (4) repeated 2- and 3-word phrases (n-grams) extracted from program description and program summary sections.

A comprehensive exclusion set (`EXCLUDED_HEADINGS`) lists structural headings that must never appear as suggestions regardless of source — including all headings from the original spec exclusion list (Funding strategy, Statutory authority, Eligible applicants, Period of performance, etc.) plus standard NOFO structural sections, generic orientation headings, and document-structure headings.

The keyword count guidance has been updated from "8–10" to "at least 6" to avoid padding with generic terms when a document doesn't have enough distinctive content.

**Reason:** The heading-based approach consistently produced suggestions like "Funding strategy", "Eligible applicants", and "Statutory authority" — structural headings that appear in every NOFO and are useless as search keywords. The purpose of the Keywords metadata field is to help people find this specific NOFO in a search; only terms specific to the program content achieve that.

**Alternative considered:** Keeping the heading approach but expanding the exclusion list. Rejected because the heading pool for most NOFOs is dominated by structural headings; even with a large exclusion list, few program-specific headings remain. Content-based extraction targets the actual program description text where specific terminology lives.

**Outcome:** Suggestions now reflect program-specific terminology. The n-gram approach requires a phrase to appear at least twice in program description text, which filters out one-off sentence starters and generic structural language while surfacing terms the author intentionally repeats. Implemented in `META-003.ts` via `extractAgencyTerms` and `extractProgramSectionTerms`; the old `extractHeadingTerms` and `isNavigationalHeading` functions are removed.
