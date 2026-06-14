import { Injectable, computed, inject, signal } from '@angular/core';

import { REPORT_BACKEND } from '../../core/backend/report-backend';
import {
  ALL_CATEGORIES,
  Category,
  IdenticalFolderPair,
  ReportHandle,
  Row,
  RowQuery,
  Source,
} from '../../core/models/report';
import { FolderNode, buildFolderTree } from '../../core/tree/folder-tree';

/**
 * Owns the currently open report and the user's view state (selected folder,
 * filters, column toggles). Components depend on this; it talks to the
 * `ReportBackend` token.
 */
@Injectable({ providedIn: 'root' })
export class ReportStore {
  private readonly backend = inject(REPORT_BACKEND);

  readonly handle = signal<ReportHandle | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly tree = signal<FolderNode | null>(null);
  /** All rows for the open report. v1 keeps them in memory. */
  readonly rows = signal<Row[]>([]);

  readonly selectedFolder = signal<string>('');
  readonly includeDescendants = signal<boolean>(true);
  readonly textFilter = signal<string>('');
  readonly hashFilter = signal<string>('');
  readonly categoryFilter = signal<readonly Category[]>(ALL_CATEGORIES);
  readonly sourceFilter = signal<readonly Source[]>(['Base', 'Second']);

  /** Toggle for the (off-by-default) hash column. */
  readonly showHash = signal(false);

  readonly identicalFolders = signal<IdenticalFolderPair[]>([]);
  readonly identicalLoading = signal(false);

  /** Materialised filtered rows for the current selection + filters. */
  readonly filteredRows = signal<Row[]>([]);
  readonly totalFilteredRows = computed(() => this.filteredRows().length);

  async openReport(path: string): Promise<void> {
    this.errorMessage.set(null);
    this.loading.set(true);
    try {
      await this.closeCurrent();
      const handle = await this.backend.openReport(path);
      this.handle.set(handle);
      // Fetch all rows up front. For a v1 with reports up to ~200k this is OK;
      // bigger reports will switch to paged listing later.
      const page = await this.backend.listRows(handle, {
        limit: handle.rowCount + 1,
      });
      this.rows.set(page.rows);
      this.tree.set(buildFolderTree(page.rows));
      this.selectedFolder.set('');
      // Reset source filter so the chips that are about to be hidden can't
      // silently exclude every row of the new report.
      this.sourceFilter.set(defaultSourceFilter(handle.hasSecondSource));
      this.refreshFilter();
    } catch (e) {
      this.errorMessage.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async pickAndOpen(): Promise<void> {
    const path = await this.backend.pickReportFile();
    if (!path) return;
    await this.openReport(path);
  }

  async loadIdenticalFolders(): Promise<void> {
    const handle = this.handle();
    if (!handle) return;
    this.identicalLoading.set(true);
    try {
      const pairs = await this.backend.findIdenticalFolders(handle);
      this.identicalFolders.set(pairs);
    } catch (e) {
      this.errorMessage.set(humanizeError(e));
    } finally {
      this.identicalLoading.set(false);
    }
  }

  selectFolder(path: string): void {
    this.selectedFolder.set(path);
    this.refreshFilter();
  }

  setTextFilter(text: string): void {
    this.textFilter.set(text);
    this.refreshFilter();
  }

  setHashFilter(hash: string): void {
    this.hashFilter.set(hash);
    this.refreshFilter();
  }

  toggleCategory(category: Category, on: boolean): void {
    const current = new Set(this.categoryFilter());
    if (on) current.add(category);
    else current.delete(category);
    this.categoryFilter.set(
      ALL_CATEGORIES.filter((c) => current.has(c)),
    );
    this.refreshFilter();
  }

  toggleSource(source: Source, on: boolean): void {
    const current = new Set(this.sourceFilter());
    if (on) current.add(source);
    else current.delete(source);
    this.sourceFilter.set(
      (['Base', 'Second'] as const).filter((s) => current.has(s)),
    );
    this.refreshFilter();
  }

  toggleIncludeDescendants(value: boolean): void {
    this.includeDescendants.set(value);
    this.refreshFilter();
  }

  toggleShowHash(value: boolean): void {
    this.showHash.set(value);
  }

  private refreshFilter(): void {
    const query = this.currentQuery();
    const rows = this.rows();
    this.filteredRows.set(applyFilter(rows, query));
  }

  private currentQuery(): RowQuery {
    const folder = this.selectedFolder();
    return {
      folder: folder.length ? folder : undefined,
      includeDescendants: this.includeDescendants(),
      text: this.textFilter().trim() || undefined,
      hash: this.hashFilter().trim() || undefined,
      categories: [...this.categoryFilter()],
      sources: [...this.sourceFilter()],
      offset: 0,
      limit: Number.MAX_SAFE_INTEGER,
    };
  }

  private async closeCurrent(): Promise<void> {
    const h = this.handle();
    if (!h) return;
    try {
      await this.backend.closeReport(h);
    } catch {
      // Ignore close failures — we're tearing down.
    }
    this.handle.set(null);
    this.rows.set([]);
    this.tree.set(null);
    this.identicalFolders.set([]);
  }
}

/**
 * Default source filter for a freshly opened report.
 *
 * The source chips are only rendered when `hasSecondSource` is true. If a
 * user unchecks `Base` in a two-source report and then opens a single-DB
 * (Base-only) report, a stale `['Second']` filter would hide every row and
 * the chips wouldn't be visible to restore it. Resetting on open prevents
 * that dead-end.
 */
export function defaultSourceFilter(hasSecondSource: boolean): Source[] {
  return hasSecondSource ? ['Base', 'Second'] : ['Base'];
}

function applyFilter(rows: readonly Row[], query: RowQuery): Row[] {
  const folder = query.folder?.length ? query.folder : undefined;
  const includeDescendants = query.includeDescendants ?? false;
  const text = query.text?.toLowerCase();
  const hash = query.hash?.toUpperCase();
  const cats = query.categories;
  const srcs = query.sources;

  return rows.filter((r) => {
    if (folder !== undefined) {
      if (includeDescendants) {
        if (!isUnderOrEqual(r.filenameAndPath, folder)) return false;
      } else {
        const lastSep = lastSeparator(r.filenameAndPath);
        const rf = lastSep < 0 ? '' : r.filenameAndPath.substring(0, lastSep);
        if (rf !== folder) return false;
      }
    }
    if (text && !r.filenameAndPath.toLowerCase().includes(text)) return false;
    if (hash) {
      const rh = r.fileSha512Hash.toUpperCase();
      if (hash.length >= 8) {
        if (!rh.startsWith(hash)) return false;
      } else if (rh !== hash) {
        return false;
      }
    }
    // Empty array means "user deselected every chip" → match nothing
    // (matches the Rust backend's `Some(vec![])` semantics). `undefined`
    // means "no filter".
    if (cats !== undefined && !cats.includes(r.category)) return false;
    if (srcs !== undefined && !srcs.includes(r.source)) return false;
    return true;
  });
}

function lastSeparator(s: string): number {
  let i = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c === 92 || c === 47) i = k;
  }
  return i;
}

function isUnderOrEqual(path: string, folder: string): boolean {
  if (!folder) return true;
  if (path === folder) return true;
  if (!path.startsWith(folder)) return false;
  const ch = path.charCodeAt(folder.length);
  return ch === 92 || ch === 47;
}

function humanizeError(e: unknown): string {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    // Tauri errors arrive as tagged objects: { type: '...', message: '...' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = e as any;
    if (typeof o.message === 'string' && typeof o.type === 'string') {
      return `${o.type}: ${o.message}`;
    }
    if (typeof o.message === 'string') return o.message;
    try {
      return JSON.stringify(o);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
