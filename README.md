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

- **Document metadata** — verifies that key fields such as Author, Subject, and Keywords are filled in and not left as placeholders. For Keywords, the tool generates up to 10 suggested terms drawn from the opportunity name, OpDiv, tagline, and subject-matter headings to help the author get started.
- **Links** — checks every internal and external link for non-descriptive text, formatting problems, and broken internal anchors. When an anchor appears broken, the tool suggests the most likely correct target heading by name.
- **Tables** — flags tables that are missing a required caption and merged cells that may affect screen reader interpretation. Common table types that do not require captions (key facts tables, application checklists, merit review criteria tables, and others) are automatically exempt.
- **Footnotes and endnotes** — flags documents that still contain footnotes, which must be converted to endnotes before design handoff, and orphaned "Footnotes" headings left over from the Word template.
- **Images** — flags images with missing or empty alternative text.
- **Lists** — flags consecutive paragraphs that use manual bullet characters or numbering instead of proper Word list styles, which may not convert correctly to accessible HTML. Also flags list items in majority-period lists that are missing a terminal period for consistency.
- **Date formatting** — auto-corrects dates that do not follow the SimplerNOFOs style guide format of Month D, YYYY. Corrects numeric formats (MM/DD/YYYY, YYYY-MM-DD), ordinal suffixes (April 16th, 2024), abbreviated month names (Apr. 2, 2024, Sept. 2, 2024), missing commas (April 16 2026), and leading-zero days (April 02, 2024). HRSA NOFOs are excepted.
- **Document cleanliness** — applies a set of automatic fixes before download: accepts tracked changes, removes comments, collapses double spaces, relocates misplaced tagline paragraphs, removes leading spaces from heading text, normalizes application checklist checkboxes to the correct glyph and paragraph style, and removes editorial scaffolding specific to certain content guide templates.
- **Required sections** (when a content guide is selected) — flags missing sections based on the selected OpDiv content guide (ACF, ACL, CDC standard and research, CDC/DGHT, CMS, IHS, and HRSA variants).

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

- Node.js 20.19+ (use `nvm use` after cloning to activate the version from `.nvmrc`)
- npm 10+

### Installation

```sh
git clone <repo-url>
cd nofo-design-prep-checker
nvm use          # ensures the correct Node version from .nvmrc is active
npm install
sh scripts/install-hooks.sh
```

`sh scripts/install-hooks.sh` installs a pre-push git hook that prevents accidental direct pushes to `main`. All changes must go through a pull request.

### Development server

```sh
npm run dev
```

Opens at `http://localhost:5173`. The tool requires uploading a `.docx` file to run checks — any NOFO Word document can be used for local testing.

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

## Troubleshooting

**Wrong Node version causes install or build failures.** If you see errors during `npm install` or `npm run build`, run `nvm use` to switch to the correct Node version (20.19+) and then re-run the failing command.

**Pre-push hook blocks a push to main.** If you see "Direct push to main is not allowed", create a branch and open a pull request instead. The hook is a local safeguard to discourage direct pushes to `main`; if server-side branch protection is enabled, that is what actually prevents direct pushes and helps keep the branch stable.

## Technology

- **React 18** with TypeScript (strict mode)
- **Vite 5** for bundling and dev server
- **USWDS v3** (U.S. Web Design System) for all UI components and styles
- **mammoth.js** for `.docx` to HTML conversion
- **JSZip** for reading and writing `.docx` ZIP archives
- **DOMPurify** for sanitizing parsed document HTML
- **Vitest** for unit testing

## Deployment

The `main` branch is deployed automatically to Cloudflare Pages via GitHub integration. Merging a pull request to `main` triggers a new deployment.

Security headers are set in `public/_headers`. The `robots.txt` blocks all crawlers.

## Rules

See [docs/rules.md](docs/rules.md) for a complete list of all checks performed by the tool.

## Architecture decisions

See [docs/decisions.md](docs/decisions.md) for a log of significant architecture and implementation decisions — what was decided, why, and what alternatives were considered.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching conventions, commit message format, and instructions for adding new rules.

## License

Apache 2.0. See [LICENSE](LICENSE).
