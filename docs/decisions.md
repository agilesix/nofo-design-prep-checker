# Architecture and implementation decisions

This file logs significant decisions made during the development of the NOFO Design Prep Checker — what was decided, why, and what alternatives were considered. Entries are added when a decision is non-obvious, affects user-facing behavior, or is likely to be revisited.

---

## 2026-04-21 — iOS Word compatibility: DEFLATE for XML parts, STORE for ZIP infrastructure files

**Decision:** `buildDocx`'s final `zip.generateAsync()` call now passes `compression: 'DEFLATE', compressionOptions: { level: 6 }` so modified XML content parts (e.g. `word/document.xml`) are compressed in the output ZIP. At the same time, every `zip.file()` call that writes `[Content_Types].xml` or relationship files (`word/_rels/document.xml.rels`) explicitly passes `{ compression: 'STORE' }` to override the global default.

**Reason:** Microsoft Word for iOS is stricter than desktop Word when validating the downloaded `.docx` ZIP structure. Users reported that files downloaded from Safari for iOS could not be opened in Word for iOS, producing two sequential error dialogs: "Word found unreadable content" followed by "This file was created in a pre-release version of Word 2007." Desktop Word opened the same files with just a recoverable warning.

The OOXML packaging convention (ECMA-376, Part 2 §13) expects `[Content_Types].xml` and relationship (`.rels`) files to be stored uncompressed (STORE). While desktop Word tolerates these files being DEFLATE-compressed, Word for iOS rejects the document outright when the ZIP infrastructure files are compressed. The global DEFLATE setting is safe for content XML parts — it reduces output file size while remaining compatible.

**Alternative considered:** Leaving `compression` unspecified in `generateAsync` (JSZip default: STORE for newly-written files). This was the prior behavior; the modified XML files were stored uncompressed, producing larger output files. The iOS incompatibility existed before this change because the original docx loaded from disk had `[Content_Types].xml` with STORE compression, but any write-back of that file (e.g., after removing comment content-type overrides) used JSZip's default and may have lost the STORE flag depending on JSZip version behavior.

**Outcome:** Output docx files now open without errors in Microsoft Word for iOS. Modified XML parts are DEFLATE-compressed (level 6), and the ZIP infrastructure files (`[Content_Types].xml`, `.rels`) are explicitly STORE.

---

## 2026-04-20 — Accepted text input values lifted to App state to survive back-navigation

**Decision:** Accepted text input values (metadata subject, metadata keywords, revised heading text, etc.) are stored in App-level `acceptedFixes` state rather than in local `ReviewStep` state. `App.tsx` passes `acceptedFixes` down to `ReviewStep` as `initialAcceptedFixes`, and `ReviewStep` initializes its local copy from that prop on mount. `IssueCard` receives the previously-accepted value via `acceptedValue` prop and uses it (over the rule's original prefill) when initializing `inputValue` state.

**Reason:** `ReviewStep` unmounts and remounts when the user navigates forward to the Summary page and then back. Without this fix, accepted text input values were lost on remount because (a) `ReviewStep`'s local `acceptedFixes` state always initialized to `[]`, and (b) each `IssueCard`'s `inputValue` always initialized from `issue.inputRequired.prefill`. The "Value recorded" success state disappeared and the entered text was gone.

**Implementation note:** The guide-change reset logic in `ReviewStep` uses a `useRef(true)` initial-mount guard so that the `useEffect` that resets `acceptedFixes` to `[]` only fires on real guide changes (component already mounted) and not on the initial mount after back-navigation. Without this guard, the effect would fire on mount and immediately wipe the restored values.

**Scope:** `resolutions` (accepted/skipped/dismissed decisions) were already persisted correctly — `App.tsx` saves them via `setReviewState({ ...reviewState, resolutions })` in `handleReviewComplete`, and `ReviewStep` initializes from `reviewState.resolutions`. Only text input values were missing. Summary page stat counts derive from `reviewState.resolutions` (App state) and are unaffected by this change.

---

## 2026-04-16 — LINK-006: stop rewriting internal link anchors; surface instruction-only warnings instead

**Decision:** LINK-006 now uses a two-tier approach based on the source of the fuzzy match:

1. **OOXML bookmark match → user-accepted fix.** When the broken anchor normalizes to exactly one existing `w:bookmarkStart w:name` in the document XML, a Review card is shown pre-filled with that exact bookmark name. Accepting rewrites `w:anchor` in the downloaded docx. Internal links in Word are purely `w:hyperlink w:anchor` → `w:bookmarkStart w:name` — no relationship entry, no other mechanism. Writing the exact existing bookmark name produces a working link.

2. **All other fuzzy matches and no-match → instruction-only warning.** When we only have a Source 2 (HTML id) or Source 3 (heading text) match, we do not have the exact OOXML bookmark name, so we cannot safely write a correct anchor. The instruction directs the user to use Insert → Link → This Document in Word.

**Reason (original decision to use instruction-only for everything):** The original thinking was that NOFO Builder had a proprietary linking mechanism. An earlier implementation failed — links were rewritten but still broken in Builder. Investigation revealed the actual causes: (a) `setAttributeNS` caused XMLSerializer to inject redundant `xmlns:w` declarations that corrupted the XML, and (b) our `slugifyHeading()` function was generating anchor values that didn't match the actual bookmark names (no leading underscore, special characters like colons and commas converted to underscores rather than preserved). Both issues have been fixed.

**Reason (revised decision to use accept-to-fix for OOXML matches):** Examination of real NOFO documents confirmed the format — internal links are `w:anchor` matching `w:bookmarkStart w:name`, with no other mechanism. When we read the bookmark name directly from the XML, we have the exact correct value. With the namespace fix in place, writing it back produces a correctly-wired link.

---

## 2026-04-20 — Pre-NOFO detection expanded to cover CDC/DGHT SSJ templates

**Decision:** Extended `detectPreNofo.ts` to catch CDC/DGHT Sole Source Justification (SSJ) pre-NOFO templates, which share some signals with the original DGHP/PEPFAR pre-NOFOs but use a different heading structure.

Two new signals were added (bringing the total to seven):
- Signal 3: An H1 heading containing "NOFO content" (case-insensitive) — SSJ pre-NOFOs use this as their top-level heading instead of the standard "Step 1: Review the Opportunity" structure
- Signal 4: Document body text containing "Sole Source Justification" anywhere (case-insensitive)

A Step 1 exclusion guard was also added: if any heading in the document contains "Step 1" (case-insensitive), detection is suppressed entirely and the document is treated as a content guide or NOFO. This prevents false positives on CDC/DGHT content guides (e.g., Haiti_JG-26-0141) that may contain "NOFO Content Guide" in an H1 heading or SSJ-like language in the body.

**Reason:** SSJ pre-NOFOs (observed in South Africa and Ethiopia CDC/DGHT grants) use "NOFO content" as their H1 and include "Sole Source Justification" language in the body. Neither signal appeared in the original five. The Step 1 guard was needed because CDC/DGHT content guides use "NOFO Content Guide" as their H1, which would match the new Signal 3 without the guard. Content guides always have a Step 1 heading; pre-NOFOs never do.

**Outcome:** SSJ pre-NOFOs are now correctly flagged. CDC/DGHT content guides with similar language are correctly excluded. All original DGHP/PEPFAR detection continues to work unchanged.

---

## 2026-04-13 — Pre-NOFO document detection added

**Decision:** Added a document-level validity check (`src/utils/detectPreNofo.ts`) that runs immediately after parsing — before any content rules execute — to detect whether the uploaded document is a pre-NOFO template rather than a content guide. If two or more signals are present, a blocking error alert is displayed at the top of the Review page, the issue list is visually muted and non-interactive, and the "Continue to summary" button is hidden.

Five signals are checked; any two trigger detection:
1. A heading (any level) containing "Pre-NOFO approval" (case-insensitive)
2. A heading (any level) containing "Pre-NOFO checklist" (case-insensitive)
3. A heading containing "Writing instructions" within the first 5 headings
4. A heading containing "Relevant deadlines" within the first 3 headings
5. Filename contains "pre-nofo" or "prenofo" (case-insensitive)

**Reason:** Users occasionally upload pre-NOFO drafts instead of content guide documents. The tool produces many false issues in this case — the pre-NOFO structure does not match content guide templates, so heading checks, metadata checks, and structure checks all fire. Surfacing the issue before the user reviews any content saves time and prevents confusion.

**Alternative considered:** Blocking at the upload step before parsing. Rejected because the filename signal alone is insufficient (not all pre-NOFO files have "pre-nofo" in the name), and heading detection requires parsing the document first. The review page with a muted list is a better landing point than a blank error on the upload screen: the user can still see what headings were found and confirm the diagnosis.

**Outcome:** When detected, the Review page shows a prominent non-dismissible error alert explaining the problem and listing three steps to resolve it. The issue cards remain visible but are grayed out (`opacity: 0.45`, `inert` attribute set) so the user can see the analysis without being able to interact with it. The "Continue to summary" button is hidden. The detection is intentionally not a standard rule in `src/rules/` — it is a document-level validity check with no associated fix, not a content issue.

---

## 2026-04-11 — Keyword suggestions switched from structural headings to contextual extraction

**Decision:** `META-003`'s keyword prefill generator no longer uses document section headings as keyword sources. Instead it draws from four contextual sources in priority order: (1) OpDiv name and abbreviation (from content guide detection), (2) agency/subagency/bureau/division names from metadata field lines (`Agency:`, `Subagency:`, etc.), (3) opportunity name and tagline, (4) repeated 2- and 3-word phrases (n-grams) extracted from program description and program summary sections.

A comprehensive exclusion set (`EXCLUDED_HEADINGS`) lists structural headings that must never appear as suggestions regardless of source — including all headings from the original spec exclusion list (Funding strategy, Statutory authority, Eligible applicants, Period of performance, etc.) plus standard NOFO structural sections, generic orientation headings, and document-structure headings.

The keyword count guidance has been updated from "8–10" to "at least 6" to avoid padding with generic terms when a document doesn't have enough distinctive content.

**Reason:** The heading-based approach consistently produced suggestions like "Funding strategy", "Eligible applicants", and "Statutory authority" — structural headings that appear in every NOFO and are useless as search keywords. The purpose of the Keywords metadata field is to help people find this specific NOFO in a search; only terms specific to the program content achieve that.

**Alternative considered:** Keeping the heading approach but expanding the exclusion list. Rejected because the heading pool for most NOFOs is dominated by structural headings; even with a large exclusion list, few program-specific headings remain. Content-based extraction targets the actual program description text where specific terminology lives.

**Outcome:** Suggestions now reflect program-specific terminology. The n-gram approach requires a phrase to appear at least twice in program description text, which filters out one-off sentence starters and generic structural language while surfacing terms the author intentionally repeats. Implemented in `META-003.ts` via `extractAgencyTerms` and `extractProgramSectionTerms`; the old `extractHeadingTerms` and `isNavigationalHeading` functions are removed.

---

## 2026-04-06 — Page number estimation removed

**Decision:** Issue locations no longer show an estimated page number. The nearest heading reference (e.g. "§ Near: Approach") is shown instead.

**Reason:** Word documents do not store page numbers in their XML structure — pagination is calculated by Word's rendering engine at display time based on font metrics, line breaks, image sizes, and other layout properties that are not present in the raw docx XML. Any page number the tool estimated from cumulative character offsets in the XML was unreliable and frequently inaccurate. Showing an estimated page number as though it were authoritative eroded user trust when the number did not match what users saw in Word.

**Alternative considered:** Improving the estimation heuristic (e.g. accounting for table rows, heading sizes, image heights) to reduce the frequency of wrong estimates. Rejected because the estimation is fundamentally limited by the absence of rendering information in the XML; a more sophisticated heuristic would still be wrong in many real documents and would add complexity with no reliability guarantee.

**Outcome:** `Issue.page` has been removed from the type and is no longer computed or stored. `LocationContext.page` and its `CHARS_PER_PAGE` constant have been removed from `locationContext.ts`. Issue locations now show only the nearest heading reference, which is accurate (derived directly from the parsed HTML heading order) and actionable (users can search for the heading in Word).

---

## 2026-04-06 — Duplicate "see" suppressed in internal link text suggestions

**Decision:** When suggesting updated link text for internal anchor links, the tool checks whether the word "see" already appears in the ~10 words preceding the link in the paragraph. If it does, the suggestion uses "(Destination)" instead of "(see Destination)".

**Reason:** Without this check, the tool produced grammatically redundant suggestions like "…see roles and responsibilities (see Cooperative agreement terms)" which would make the document read worse, not better.

**Outcome:** Suggestions are context-aware and avoid introducing redundant phrasing. Implemented in `LINK-006.ts` via the `hasSeeBeforeLink` helper and a `suppressSee` flag passed to `makeLinkTextSuggestion`.
