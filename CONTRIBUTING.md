# Contributing to NOFO Design Prep Checker

Thank you for contributing. This document covers the conventions and requirements for contributing to this project.

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- A code editor with ESLint and TypeScript support (VS Code recommended — see `.vscode/extensions.json`)

## Setup

```sh
git clone <repo-url>
cd nofo-design-prep-checker
npm install
sh scripts/install-hooks.sh
npm run dev
```

The dev server runs at `http://localhost:5173`.

## Project structure

```
src/
  types/          TypeScript interfaces (Rule, Issue, ParsedDocument, etc.)
  data/           Static data (contentGuides.ts, metadataGuidance.ts)
  utils/          Pure utility functions (parseDocx, sanitize, RuleRunner, etc.)
  rules/
    universal/    Rules that run on all documents
    opdiv/        Rules specific to one or more OpDiv content guides
    index.ts      Exports all rules in execution order
  components/     React UI components
  content/        All user-facing strings (no hardcoded strings in components)
  styles/         SCSS: _uswds-theme.scss + index.scss
docs/             Reference documentation
scripts/          Shell scripts (install-hooks.sh, pre-push hook)
```

## Branching and pull requests

- All changes must go through a pull request — direct pushes to `main` are blocked by a pre-push hook
- Branch names should be descriptive: `feat/LINK-007-external-link-indicator`, `fix/meta-001-false-positive`
- PR titles should be concise and in sentence case: "Add LINK-007 external link indicator rule"
- PRs require review from `@agilesix/nofo-maintainers` before merging (see CODEOWNERS)

## Commit message format

This project uses the [Conventional Commits](https://www.conventionalcommits.org/) format. All commit messages must use one of the following prefixes:

- `feat:` — a new rule, feature, or user-facing capability
- `fix:` — a bug fix
- `docs:` — changes to documentation only (README, CONTRIBUTING, rules.md, decisions.md)
- `chore:` — maintenance, dependency updates, config changes, refactoring with no behavior change
- `refactor:` — code restructuring with no behavior change and no new features
- `test:` — adding or updating tests only

Examples:

```
feat: add auto-fix rule to remove empty list items
fix: resolve constant condition lint error in buildDocx
docs: update README with new rules and local dev guidance
chore: update release-please config
```

**Why this matters:** release-please reads commit messages to auto-generate `CHANGELOG.md` and determine version bumps. Commit messages that don't follow this format will not be grouped correctly in the changelog.

**Enforcement:** The `commit-msg` git hook (installed by `sh scripts/install-hooks.sh`) validates the first line of every commit message against the allowed prefixes. Commits with a non-conforming message are rejected immediately with an error explaining the required format. The check is case-insensitive — `Feat:` and `feat:` are both accepted.

**When using Claude Code:** Claude Code commits bypass local git hooks when the tool pushes directly. Always review Claude Code commit messages before pushing — if a message does not follow the conventional commit format, amend it with `git commit --amend` before opening a pull request.

## Code conventions

### TypeScript

- Strict TypeScript is enforced — no `any` types
- All interfaces are defined in `src/types/index.ts`
- Use `import type` for type-only imports
- Unused locals and unused parameters are errors at lint time

### React

- Functional components only — no class components
- Props interfaces are defined inline above each component
- No hardcoded strings in components — import from `src/content/index.ts`
- All USWDS CSS classes only — no inline styles, no CSS modules

### Rules

Rules implement the `Rule` interface from `src/types/index.ts`:

```typescript
interface Rule {
  id: string;                             // e.g., "LINK-001"
  contentGuideIds?: ContentGuideId[];     // omit for universal rules
  autoApply?: boolean;                    // true = runs without user review
  check: (doc: ParsedDocument, options: RuleRunnerOptions) =>
    Issue[] | AutoAppliedChange[] | (Issue | AutoAppliedChange)[];
}
```

#### Rule file conventions

- File name matches rule ID: `LINK-001.ts`, `STRUCT-007.ts`
- Universal rules go in `src/rules/universal/`
- OpDiv-specific rules go in `src/rules/opdiv/`
- Default export is the rule object
- Include a JSDoc comment explaining what the rule checks

#### Auto-apply rules

Auto-apply rules (`autoApply: true`) run before user-review rules. They should only be used when:

1. The change is safe to make without user review, OR
2. The rule detects something that must be flagged as an `AutoAppliedChange` (informational) rather than an actionable `Issue`

Auto-apply rules may return a mix of `AutoAppliedChange` and `Issue` items — see `LINK-006` for an example.

#### Issue IDs

Issue IDs must be unique across a single run. The convention is:

```
{RULE-ID}-{index-or-descriptor}
```

For example: `LINK-001-0`, `LINK-001-1`, `META-001-author`, `STRUCT-007-missing`.

#### instructionOnly issues

Set `instructionOnly: true` for issues where the tool cannot make an automated fix. These issues display as informational cards with a "Mark reviewed" action instead of "Accept fix".

### Strings

All user-facing strings live in `src/content/index.ts`. To add new strings:

1. Add the string to the appropriate section of the `content` object
2. Import and use `content` in your component
3. Never hardcode strings directly in JSX

### Accessibility

- All interactive elements must have visible focus styles (USWDS provides these)
- All form inputs must have associated `<label>` elements
- Dynamic content updates must use `aria-live` regions
- All images (including icons) must have alt text or `aria-hidden="true"`
- Use semantic HTML: `<button>` for actions, `<a>` for navigation
- The USWDS Skip Nav link in `App.tsx` must remain in place

## Testing

```sh
npm test           # run all tests once
npm run test:watch # run tests in watch mode
```

Tests live alongside their source files or in `__tests__/` subdirectories. Test file naming: `{filename}.test.ts` or `{filename}.test.tsx`.

### Testing rules

Each rule should have a test file covering:

- Returns no issues when the document is clean
- Returns the expected issues for known problems
- Does not throw on empty or minimal documents

Use the `jsdom` environment (configured in `vite.config.ts`). Construct minimal `ParsedDocument` fixtures rather than loading real .docx files.

### No real documents in the repo

Never commit `.docx` or `.doc` files. The `.gitignore` blocks these globally. Test fixtures should be constructed programmatically in test files.

## Linting

```sh
npm run lint
```

Zero warnings are allowed. All lint errors must be resolved before merging.

## Updating the USWDS version

USWDS is pinned in `package.json` and grouped in Dependabot. Before accepting a USWDS version bump:

1. Review the USWDS changelog for breaking changes
2. Test the full UI at all viewport sizes
3. Run `npm run build` to confirm no SCSS compilation errors
4. Update `docs/rules.md` if any USWDS component changes affect rule output

## Adding a new content guide

1. Add a new `ContentGuideId` type to `src/types/index.ts`
2. Add a `ContentGuideEntry` to `src/data/contentGuides.ts` with detection signals
3. Add detection logic to `src/utils/detectContentGuide.ts` if needed
4. Create OpDiv-specific rules in `src/rules/opdiv/` with `contentGuideIds` set
5. Register the new rules in `src/rules/index.ts`
6. Update `docs/rules.md`
7. Update the `guideSelection.guides` map in `src/content/index.ts`

## Security

- This tool processes documents entirely client-side — no server uploads
- All HTML from document parsing is sanitized via DOMPurify before rendering
- The CSP in `public/_headers` must be maintained; do not loosen it without approval
- Do not add external API calls, analytics, or tracking scripts

## Questions and support

Open an issue or reach out to `@agilesix/nofo-maintainers` on GitHub.
