# Architecture and implementation decisions

This file logs significant decisions made during the development of the NOFO Design Prep Checker — what was decided, why, and what alternatives were considered. Entries are added when a decision is non-obvious, affects user-facing behavior, or is likely to be revisited.

---

## 2026-04-29 — HEAD-004 and HEAD-005: two separate heading-length rules with suppression

**Decision:** Two separate rules handle heading length: HEAD-004 (heading may be too long, 10+ words or 80+ chars) and HEAD-005 (heading may be misformatted normal text, 20+ words or 150+ chars). HEAD-005 suppresses HEAD-004 on the same heading. Any heading exceeding HEAD-005's thresholds is excluded from HEAD-004 even if HEAD-005 does not fire (e.g. headings ending with a colon).

**Reason — two rules instead of one:** The two rules serve different purposes. HEAD-004 asks the user to shorten a heading while keeping it as a heading. HEAD-005 asks whether the text should be a heading at all. These are different actions with different user interactions: HEAD-004 shows a text input for a replacement; HEAD-005 shows an accept/skip card that converts the paragraph to Normal style. Combining them into one rule would require conditional UI logic that is better expressed as separate rules with clear, single-purpose contracts.

**Reason — different thresholds:** HEAD-004 fires at 10+ words or 80+ characters — lengths that are plausibly long but still within normal heading territory. HEAD-005 fires at 20+ words or 150+ characters — lengths that are so extreme that the text is more likely body copy. The gap between the thresholds (10–20 words) is where HEAD-004 alone fires.

**Reason — HEAD-005 suppresses HEAD-004:** If text is long enough to question whether it belongs as a heading at all, asking the user to shorten it is redundant. The higher-priority question is "should this be a heading?" not "what should the shorter heading say?"

**Reason — colon exception excludes from HEAD-004 too:** Headings ending with a colon are intentional section labels (e.g. "Eligibility:") regardless of length. HEAD-005's colon exception means it doesn't fire on those headings. Since any heading exceeding HEAD-005's thresholds is already excluded from HEAD-004, colon-ending headings that are very long are excluded from both rules — neither fires.

**Fix mechanics:** HEAD-004's accepted fix calls `applyHeadingTextCorrections` (updates `w:t` text, preserves `w:pStyle`). HEAD-005's accepted fix calls `applyHeadingStyleToNormal` (updates `w:pStyle` to `Normal`, preserves all text and run formatting). Both use the same heading ordinal-index counting convention as HEAD-003.

---

## 2026-04-23 — Mobile: slim site alert on upload page replaces iOS-specific download branching

**Decision:** A `usa-site-alert--slim` (info type) is shown above the H1 on the Upload page on small screens only (hidden at ≥768px via `.mobile-only { @media (min-width: 48em) { display: none } }`). Alert text: "This tool works best on a desktop or laptop. Downloading your corrected document may not work on mobile devices or tablets."

All iOS-specific code was removed from the Download page: the `isIOS` detection variable, the iOS info alert, and the `(isIOS || !hasDownloaded)` body guard. The Download page now behaves identically on all devices.

**Reason:** The earlier iOS "use desktop" alert on the Download page meant users had already uploaded their document, worked through all the review issues, and reached the final step before discovering they couldn't download. Setting that expectation at the Upload step — before any work is invested — is more useful and less frustrating. A device-agnostic Download page is simpler and avoids maintaining two code paths for a download flow that may work on some mobile browsers.

**Alternative considered:** Keeping the iOS alert on the Download page in addition to adding the Upload alert. Rejected because the Download page alert was the original iOS workaround; once the Upload alert communicates the limitation upfront, the Download-page branch adds complexity without adding value.

**Outcome:** Mobile users see the caveat before they start. The Download page is device-agnostic. The `.mobile-only` CSS utility is available for other components if similar mobile-only visibility is needed.

---

## 2026-04-23 — iOS: download replaced with "use desktop" message; XML declaration fix applied

**Decision:** On iOS devices (`/iPad|iPhone|iPod/.test(navigator.userAgent) && !MSStream`), the Download page replaces the download button with a neutral info alert:

> "Downloading is not supported on iPhone or iPad. To download your corrected document, open this tool on a desktop or laptop computer. Your session is not saved — you will need to re-upload your document on desktop."

All iOS-specific download code (`window.open`, `newTab`, blob URL revocation delay, the yellow iOS banner) was removed from `App.tsx` and `DownloadStep.tsx`. The fix-count stat line and body text remain visible on iOS so users can still review their results before switching to a desktop browser.

A separate structural fix was also applied: `XMLSerializer.serializeToString()` silently drops the `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` processing instruction from every XML part it writes. A `serializeXml()` helper was added to `buildDocx.ts` to restore the declaration across all 32 serialization call sites. Five regression tests cover each category of rewritten part.

**Reason:** iOS WebKit does not support the `<a download>` attribute — anchor-click downloads are silently ignored. Multiple alternative approaches were explored and tested across multiple PRs:

- **Web Share API** — opened the iOS share tray immediately on button tap; unwanted UX
- **FileReader + base64 data URI** — file saved without binary encoding, producing a structurally corrupt file Word could not open
- **`window.open()` to a blob URL** — Chrome for iOS blocked the popup; Safari opened a new tab but the file showed as "Unknown" and was corrupt
- **`window.open()` pre-opened before `await`** — resolved the popup blocker but the file was still corrupt; users could also close the tab during `buildDocx`, leaving a blank orphaned tab
- **`File(blob, downloadName)` wrapper** — carried the filename for the Share sheet but did not resolve the "Unknown" save name from Quick Look

The file corruption was traced to the missing XML declaration (confirmed by a diagnostic test): Word for iOS is strict about this and rejects packages with OfficeImportErrorDomain error 912, while desktop Word auto-repairs the missing declaration and opens the file anyway. Even with the corruption fixed, the iOS download UX remained fragile enough that showing a clear redirect message is more reliable and honest than guiding users through a multi-step workaround.

**Outcome:** Desktop download behavior is unchanged. iOS users see the info alert and can complete the download on desktop. The XML declaration fix resolves the error 912 issue for any future iOS download path and improves correctness for all platforms.

---

## 2026-04-21 — iOS Word compatibility: DEFLATE for XML parts, STORE for ZIP infrastructure files

**Decision:** `buildDocx`'s final `zip.generateAsync()` call uses `compression: 'DEFLATE', compressionOptions: { level: 6 }` so modified XML content parts are compressed. Immediately before `generateAsync`, an unconditional loop re-adds `[Content_Types].xml` and every `*.rels` file with `{ compression: 'STORE' }`, regardless of whether any fix path previously rewrote them.

**Reason:** Microsoft Word for iOS is stricter than desktop Word when validating the downloaded `.docx` ZIP structure. Users reported that files downloaded from Safari for iOS could not be opened in Word for iOS, producing two sequential error dialogs: "Word found unreadable content" followed by "This file was created in a pre-release version of Word 2007." Desktop Word opened the same files with just a recoverable warning.

The OOXML packaging convention (ECMA-376, Part 2 §13) expects `[Content_Types].xml` and relationship (`.rels`) files to be stored uncompressed (STORE). While desktop Word tolerates DEFLATE-compressed infrastructure files, Word for iOS rejects the document outright. The global DEFLATE option would re-compress any infrastructure file loaded from the original archive but never touched by a fix path, so the unconditional enforcement loop is required to cover all documents regardless of which fixes run.

**Alternative considered:** Setting `{ compression: 'STORE' }` only on the explicit `zip.file()` calls that rewrite those files (accept-changes cleanup, email fix). This was insufficient: documents that don't trigger those paths had their infrastructure files re-compressed by the global DEFLATE option.

**Outcome:** Output docx files open without errors in Microsoft Word for iOS. Modified XML content parts are DEFLATE-compressed (level 6); `[Content_Types].xml` and all `*.rels` files are unconditionally STORE.

---

## 2026-04-20 — Accepted text input values lifted to App state to survive back-navigation

**Decision:** Accepted text input values (metadata subject, metadata keywords, revised heading text, etc.) are stored in App-level `acceptedFixes` state rather than in local `ReviewStep` state. `App.tsx` passes `acceptedFixes` down to `ReviewStep` as `initialAcceptedFixes`, and `ReviewStep` initializes its local copy from that prop on mount. `IssueCard` receives the previously-accepted value via `acceptedValue` prop and uses it (over the rule's original prefill) when initializing `inputValue` state.

**Reason:** `ReviewStep` unmounts and remounts when the user navigates forward to the Summary page and then back. Without this fix, accepted text input values were lost on remount because (a) `ReviewStep`'s local `acceptedFixes` state always initialized to `[]`, and (b) each `IssueCard`'s `inputValue` always initialized from `issue.inputRequired.prefill`. The "Value recorded" success state disappeared and the entered text was gone.

**Implementation note:** The guide-change reset logic in `ReviewStep` uses a `useRef(true)` initial-mount guard so that the `useEffect` that resets `acceptedFixes` to `[]` only fires on real guide changes (component already mounted) and not on the initial mount after back-navigation. Without this guard, the effect would fire on mount and immediately wipe the restored values.

**Scope:** `resolutions` (accepted/skipped/dismissed decisions) were already persisted correctly — `App.tsx` saves them via `setReviewState({ ...reviewState, resolutions })` in `handleReviewComplete`, and `ReviewStep` initializes from `reviewState.resolutions`. Only text input values were missing. Summary page stat counts derive from `reviewState.resolutions` (App state) and are unaffected by this change.

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

## 2026-04-16 — LINK-006: stop rewriting internal link anchors; surface instruction-only warnings instead

**Decision:** LINK-006 now uses a two-tier approach based on the source of the fuzzy match:

1. **OOXML bookmark match → user-accepted fix.** When the broken anchor normalizes to exactly one existing `w:bookmarkStart w:name` in the document XML, a Review card is shown pre-filled with that exact bookmark name. Accepting rewrites `w:anchor` in the downloaded docx. Internal links in Word are purely `w:hyperlink w:anchor` → `w:bookmarkStart w:name` — no relationship entry, no other mechanism. Writing the exact existing bookmark name produces a working link.

2. **All other fuzzy matches and no-match → instruction-only warning.** When we only have a Source 2 (HTML id) or Source 3 (heading text) match, we do not have the exact OOXML bookmark name, so we cannot safely write a correct anchor. The instruction directs the user to use Insert → Link → This Document in Word.

**Reason (original decision to use instruction-only for everything):** The original thinking was that NOFO Builder had a proprietary linking mechanism. An earlier implementation failed — links were rewritten but still broken in Builder. Investigation revealed the actual causes: (a) `setAttributeNS` caused XMLSerializer to inject redundant `xmlns:w` declarations that corrupted the XML, and (b) our `slugifyHeading()` function was generating anchor values that didn't match the actual bookmark names (no leading underscore, special characters like colons and commas converted to underscores rather than preserved). Both issues have been fixed.

**Reason (revised decision to use accept-to-fix for OOXML matches):** Examination of real NOFO documents confirmed the format — internal links are `w:anchor` matching `w:bookmarkStart w:name`, with no other mechanism. When we read the bookmark name directly from the XML, we have the exact correct value. With the namespace fix in place, writing it back produces a correctly-wired link.

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
