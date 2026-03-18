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

- **Document metadata** — Author, Subject, and Keywords fields required for 508 compliance
- **Document cleanliness** — tracked changes, unresolved comments, leftover instruction boxes, and placeholder text
- **Heading structure** — sequential heading levels, bold text mistakenly used as headings, body copy accidentally tagged as headings
- **Links** — broken internal links (with fuzzy match suggestions for near-miss anchors), non-descriptive link text, punctuation in link text, missing file type/size labels on download links, plain text email addresses converted to mailto: links automatically, and non-standard page fragment syntax on file links
- **Tables** — merged cells, multiple header rows, and callout boxes not formatted correctly
- **Footnotes and endnotes** — unlinked reference numbers and repeated reference numbers
- **Images** — missing alt text
- **Application checklists** — checkbox items formatted as bulleted lists instead of ballot box glyphs
- **Text formatting** — date and time range formatting that doesn't follow SimplerNOFOs style: en dashes, em dashes, hyphens, or "through" used as range separators (should be "to"); incorrect a.m./p.m. capitalization; "EST" instead of "ET"; exact hours written with `:00`; and "12:00 p.m." or "12:00 a.m." instead of "noon" or "midnight"

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

| OpDiv | Guide |
|-------|-------|
| ACF | ACF Content Guide (FY26 Interim) |
| ACL | ACL Content Guide |
| CDC | CDC Content Guide (Standard) |
| CDC | CDC Content Guide (Research) |
| CMS | CMS Content Guide |
| IHS | IHS Content Guide |
| HRSA | HRSA BHW R&R Content Guide |
| HRSA | HRSA BPHC Content Guide |
| HRSA | HRSA Construction Content Guide |
| HRSA | HRSA MCHB R&R Content Guide |
| HRSA | HRSA R&R Content Guide |

## Getting started (development)

### Prerequisites

- Node.js 20+
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
