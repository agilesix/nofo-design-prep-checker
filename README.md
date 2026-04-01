# NOFO Design Prep Checker

An internal HHS tool that helps staff and contractors prepare Notice of Funding Opportunity (NOFO) documents for design by checking for common issues before handoff.

> **Internal tool — not for public distribution.** This tool is for HHS staff and contractors. Do not share this URL publicly.

## Impact

Preparing a NOFO Word document for design has always been a manual, time-intensive process. A coach, grant writer, or designer working carefully through a NOFO — checking metadata fields, verifying 60 to 100+ hyperlinks, reviewing table structures, hunting for footnote and image issues, then fixing each problem found directly in the Word document — typically spent **3 to 4 hours per NOFO**.

This tool automates that process. The same comprehensive review now takes about **10 minutes**.

| Metric | Manual process | With this tool |
|---|---|---|
| **Time per NOFO** | 3–4 hours | ~10 minutes |
| **Staff time saved per NOFO** | — | 2.5–3.5 hours |
| **Annual savings (300 SimplerNOFOs/year)** | — | 750–1,050 hours returned to program work |
| **Link coverage** | Often partial or skipped | Every link, every time |
| **Consistency** | Depends on reviewer's familiarity | Same checks applied to every document |

## What it checks

- **Document metadata** — key fields such as Author, Subject, and Keywords that support accessibility and consistency; for Keywords the tool generates an 8–10 term suggestion drawn from the OpDiv name and abbreviation, the opportunity name and tagline (when present), and distinctive subject-matter headings (each keyword ≤ 3 words); structural and navigational headings (e.g. "Before You Begin", "Basic information", "Step 1: …") and Word content-control artifacts (e.g. `[1]Before You Begin`) are excluded from suggestions
- **Document cleanliness** — common issues like unresolved comments, leftover instruction boxes, and placeholder text
- **Heading structure** — obvious heading level and tagging inconsistencies that can affect navigation and readability
- **Links** — internal and external link issues, including non-descriptive link text, basic formatting problems, and broken internal anchors (with fuzzy-match suggestions when a likely target can be found; suggested anchors are derived from heading text by converting spaces to underscores, normalizing punctuation, and collapsing repeated underscores — e.g. "Attachment 1: Overview" → `Attachment_1_Overview`; the fuzzy matcher handles Word's auto-generated numeric suffixes, anchors where stop words like "and"/"or" were dropped from the slug, and manually abbreviated bookmarks such as `#Attach8OrgChart` that are resolved by extracting the embedded number and matching it against structural headings); when an internal link's anchor resolves to a heading and the link text doesn't already reference that heading by name, a suggestion card prompts the author to include the destination heading name — e.g. suggesting "rural community health-related needs (see Appendix A)" when a bare phrase like "rural community health-related needs" links to the Appendix A heading
- **Tables** — structural issues that can cause accessibility or reading-order problems, including missing header rows (with estimated page numbers) and missing captions; captions must follow the `Table: Title of table` format in normal text — standard table types such as application checklists, merit review criteria, and forms are exempt from the caption requirement
- **Footnotes and endnotes** — basic reference and linking issues
- **Images** — missing or incomplete alternative text
- **Application checklists** — formatting issues that make checklist items harder to scan or understand
- **Text formatting** — common style issues in dates, times, and ranges based on SimplerNOFOs guidance

## Applied automatically

The following changes are applied silently without requiring review. They appear in the **Applied automatically** sidebar on the review screen and in the Summary page with a count of what was changed.

| Rule | Scope | What it does |
|------|-------|--------------|
| **Tagline relocation** (CLEAN-005) | All NOFOs | If the document contains a standalone tagline paragraph ("Tagline: …") that is not already positioned immediately after the metadata block, moves it there. Removes any duplicate tagline paragraphs found elsewhere in the document. Reports: *"Tagline relocated to follow metadata section."* Skips silently if no standalone tagline is found, if no headings are present, or if the tagline is already correctly placed. |
| **Before You Begin heading removal** (CLEAN-006) | HRSA NOFOs only | NOFO Builder does not use a "Before You Begin" heading. For HRSA NOFOs, any heading-level paragraph (any heading level) with exactly that text is automatically removed. The content below the heading is preserved. Reports: *"Before You Begin heading removed — content preserved."* |
| **Date format correction** (FORMAT-002) | All NOFOs except HRSA | Scans paragraph text for dates that do not follow the SimplerNOFOs style guide format of Month D, YYYY (e.g. "April 2, 2024"). Corrects: MM/DD/YYYY or MM/DD/YY, Month DD, YYYY with a leading zero on the day (e.g. "April 02, 2024"), and YYYY-MM-DD. When a day name precedes the date (e.g. "Monday, April 02, 2024") the day name is preserved. Reports: *"Date formats corrected — N instance(s) updated to Month D, YYYY format."* No entry appears if zero corrections are needed. **HRSA exception:** HRSA templates use MM/DD/YYYY by convention — this rule is skipped entirely for all HRSA content guides. |

## Your document stays private

This tool runs entirely in your browser. **Your document is never uploaded to a server, saved, or shared with anyone.** When you close the tab, all data is cleared automatically.

NOFO drafts are pre-decisional, sensitive HHS documents that are not for public release until published on grants.gov. This tool was built with that in mind — there is no backend, no database, and no way for document content to leave your computer.

## What it does

Upload a NOFO `.docx` file and the tool will:

1. **Detect the content guide** — Automatically identifies which HHS OpDiv content guide applies (ACF, ACL, CDC, CMS, IHS, HRSA variants)
2. **Run automated checks** — Scans for common issues across metadata, links, tables, images, footnotes, headings, and required sections
3. **Guide you through review** — Presents each issue with a severity rating and suggested fix
4. **Download an updated document** — Applies accepted fixes and generates a corrected `.docx`

All processing happens entirely in your browser. No file contents are sent to any server.

## Supported content guides

> **Note on HRSA structural checks:** HRSA templates are updated more frequently than other OpDiv templates. Structural checks for HRSA guides (required sections such as "Before You Begin", "Trainee Eligibility", "Project Description", and "Program Requirements") are reported as **warnings** rather than errors. A missing section may reflect a recent template change rather than a writer error — always verify against the most current HRSA template before acting on these warnings.

| OpDiv | Guide |
|-------|-------|
| ACF | ACF Content Guide (FY26 Interim) |
| ACL | ACL Content Guide |
| CDC | CDC Content Guide (Standard) |
| CDC | CDC Content Guide (Research) |
| CDC | CDC/DGHT SSJ Content Guide |
| CDC | CDC/DGHT Competitive Content Guide |
| CMS | CMS Content Guide |
| IHS | IHS Content Guide |
| HRSA | HRSA BHW R&R Content Guide |
| HRSA | HRSA BPHC Content Guide |
| HRSA | HRSA Construction Content Guide |
| HRSA | HRSA MCHB R&R Content Guide |
| HRSA | HRSA R&R Content Guide |

## Getting started (development)

### Prerequisites

- Node.js 20.19+
- npm 10+

### Installation

```sh
git clone <repo-url>
cd nofo-design-prep-checker
npm install
sh scripts/install-hooks.sh
```

### Development server

```sh
npm run dev
```

Opens at `http://localhost:5173`.

### Build

```sh
npm run build
```

Output goes to `dist/`. The build is a static site with no server-side requirements.

### Tests

```sh
npm test
```

### Lint

```sh
npm run lint
```

## Technology

- **React 18** with TypeScript (strict mode)
- **Vite 5** for bundling and dev server
- **USWDS v3** (U.S. Web Design System) for all UI components and styles
- **mammoth.js** for `.docx` to HTML conversion
- **JSZip** for reading and writing `.docx` ZIP archives
- **DOMPurify** for sanitizing parsed document HTML
- **Vitest** for unit testing

## Deployment

This tool is deployed to internal HHS hosting and is not intended for public access. Do not publish or share deployment URLs outside authorized HHS staff and contractors.

The built `dist/` directory can be deployed to an internal static hosting platform. The project is configured for Cloudflare Pages (see `.github/workflows/ci.yml`).

Security headers are set in `public/_headers`. The `robots.txt` blocks all crawlers.

## Rules

See [docs/rules.md](docs/rules.md) for a complete list of all checks performed by the tool.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions, branching guidelines, and instructions for adding new rules.

## License

Apache 2.0. See [LICENSE](LICENSE).
