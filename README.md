# myDupFinder UI

A desktop UI (Tauri 2 + Angular 20) that visualizes the duplicate / whole-lot
reports produced by [myDupFinder](https://github.com/rogerbriggen/myDupFinder).
The UI loads a `<JobName> dupReport.csv`, reconstructs the folder tree from
the rows, and lets you browse, filter, and inspect duplicate / missing / new /
changed / moved files.

See [AGENTS.md](AGENTS.md) for the full specification (input format, UI
contract, conventions).

---

## Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- **Rust** stable 1.96+ (`rustup` installed, `cargo` on `PATH`)
- **Tauri 2 system deps** for your OS:
  - Windows: WebView2 runtime (preinstalled on Win11), MSVC build tools
  - macOS: Xcode command line tools
  - Linux: `webkit2gtk-4.1`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`
- Recommended IDE setup: VS Code + the Tauri, rust-analyzer, and Angular
  Language Service extensions.

---

## Build

Install JS deps once:

```bash
pnpm install
```

### Frontend only (Angular bundle)

```bash
pnpm build           # production bundle → dist/mydupfinderui/browser
pnpm watch           # rebuild on change (development config)
```

### Backend only (Rust)

```bash
cd src-tauri
cargo build           # debug
cargo build --release # release
```

### Full desktop app (Tauri bundle)

```bash
pnpm tauri build      # produces an installer + standalone binary in
                      # src-tauri/target/release/bundle/
```

> **Note** — the `Cargo.lock` in `src-tauri/` pins `alloc-stdlib` to `0.2.2`
> to work around a transitive `brotli` ↔ `alloc-no-stdlib` resolver conflict.
> Keep it checked in.

---

## Test

### Rust (cargo test)

Covers CSV parsing (both fixtures in `testdata/`), the identical-folder
detector, the in-memory query, and the handle store.

```bash
cd src-tauri
cargo test --lib
```

### Frontend (Vitest)

Covers pure-TS logic: folder-tree builder, row filter, helpers. Component
DOM tests are not part of v1.

```bash
pnpm test             # one-shot run
pnpm test:watch       # watch mode
```

### Quick "everything compiles" check

```bash
pnpm build && (cd src-tauri && cargo check)
```

---

## Run (development)

```bash
pnpm tauri dev
```

This spawns `ng serve` on `http://localhost:1420` and opens a Tauri window
pointed at it. Hot-reload works for the Angular side.

### Frontend only (no Tauri)

```bash
pnpm start
```

`ng serve` on `http://localhost:1420`. The app auto-detects the absence of
Tauri and provides a `MockReportBackend` with a small fixture, so the UI is
fully interactive in the browser.

### Using the app

1. Click **Open report…** in the toolbar.
2. Pick a `<JobName> dupReport.csv` (both AGENTS-mode fixtures live in
   [`testdata/`](testdata/)).
3. The folder tree (left) shows the reconstructed hierarchy with per-folder
   file counts. Click a folder to filter the table on the right.
4. Use the toolbar filters (path/filename text, hash prefix ≥ 8 chars,
   category chips, source chips) to narrow the view.
5. Click **Identical folders** to run the Rust-side detector; results
   appear under the tree pane and clicking a row jumps to that folder.
6. Toggle the **hash column** checkbox to show/hide SHA-512s.

---

## Deploy

`pnpm tauri build` produces a signed-or-unsigned installer per OS in
`src-tauri/target/release/bundle/`:

- **Windows** — `.msi` and `.exe` (NSIS) under
  `bundle/msi/` and `bundle/nsis/`
- **macOS** — `.dmg` and `.app` under `bundle/dmg/` and `bundle/macos/`
- **Linux** — `.deb`, `.rpm`, and `.AppImage` under `bundle/deb/`, etc.

For a production release:

1. Bump `version` in both `package.json` and `src-tauri/tauri.conf.json`
   (keep them in sync).
2. Run `pnpm tauri build` on each target OS (Tauri does not cross-compile
   bundles out of the box).
3. (Optional) Configure code signing in `tauri.conf.json` — see the Tauri
   docs for `bundle.windows.certificateThumbprint`, the macOS notarization
   keys, etc.
4. Distribute the installer; users do not need Rust or Node to run it.

### CI smoke test

The minimum CI matrix should run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
cd src-tauri && cargo test --lib && cargo clippy -- -D warnings
```

---

## Implemented features (v1)

- **Tauri 2 + Angular 20 standalone-component shell** wired end-to-end.
- **Backend abstraction (`ReportBackend`)** with two implementations:
  - `TauriReportBackend` (real, via `invoke` + dialog plugin)
  - `MockReportBackend` (fixture-backed, for `ng serve` and tests)
- **CSV parser (Rust)** — `;`-delimited, header-validated, rejects the
  check-report sibling format (AGENTS §3.6).
- **All six categories** parsed and modeled: `Duplicate`, `Moved`, `Unique`,
  `Missing`, `New`, `Changed`.
- **Folder-tree reconstruction** from `FilenameAndPath`, tolerant of `\`
  and `/` separators. Per-node aggregates: total files, total size,
  per-category counts.
- **Two-pane explorer UI**: folder tree (left) + row table (right) +
  toolbar.
- **Filters** (AND semantics, all reset independently):
  - Path / filename substring (case-insensitive)
  - Hash prefix (≥ 8 chars) or exact match
  - Category multi-select chips
  - Source multi-select chips (hidden when report has only `Base`)
  - "Include descendants" toggle for folder selection
- **Hash column toggle** — off by default; on, shows first 12 chars with
  full hash in tooltip.
- **Identical-folder detector (Rust)** — bottom-up algorithm with
  memoization and maximal-pair pruning. Results sorted by total size,
  rendered in a side panel, clickable to jump to a folder.
- **Tauri commands**: `open_report`, `list_report_rows`,
  `find_identical_folders_cmd`, `close_report`. Errors returned as tagged
  serde enums.
- **Tests**: 18 `cargo test` cases (parser, identical-folders, query,
  state) and 13 Vitest cases (tree builder, row filter).

---

## Missing / deferred features

These are explicitly out of scope for v1 and are tracked for the next
sprint.

- **Angular Material + CDK Virtual Scroll** — AGENTS calls these mandatory.
  The current table is a plain HTML `<table>` capped at 5 000 rendered
  rows. Large reports (≥ 200 k rows) need virtual scroll before they're
  comfortable.
- **Push filtering to Rust for large reports** — AGENTS §4.4 calls for a
  > 50 k-row threshold beyond which filters run on the backend with paged
  > fetches. Today all filtering is in-memory on the JS side.
- **Group-id row grouping with expand/collapse** — sibling rows that share
  a `GroupId` (Duplicate / Moved / Changed pairs) are shown flat. The
  spec wants them visually grouped and collapsible.
- **Identical-pair badges in the tree** — pairs are listed in a side
  panel; folder-tree nodes don't yet get the "identical to: …" chip
  described in AGENTS §4.3.
- **Persistence** — last-opened report path and UI prefs (column toggles,
  filters) are not saved between sessions. AGENTS sprint backlog item 8.
- **Async progress events** — backend commands run synchronously. AGENTS
  §5 asks long-running ops to emit `report-progress` events.
- **Streaming CSV parse** — the parser reads the whole CSV into a
  `Vec<Row>` before returning. AGENTS asks for streaming. Fine for the
  current report sizes; revisit when scaling.
- **Identical-folder algorithm — renamed (Moved) subfolders** — the
  current bottom-up check requires matching subfolder names. Folders
  whose names changed but whose contents are entirely `Moved` won't be
  flagged identical.
- **Check-report support** — `myDupFinder check` reports are detected
  and rejected with an "unsupported" error rather than parsed.
- **Component-level tests** — only pure-TS modules are covered by
  Vitest. Component / harness tests are deferred.
- **Lint / format gates in CI** — Prettier + `@angular-eslint` and
  `cargo clippy -D warnings` are not wired into a `package.json` script
  or workflow yet.
