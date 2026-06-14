import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { Row } from '../../core/models/report';
import { formatHashShort, formatSize } from '../../core/format';
import { splitFolderAndName } from '../../core/tree/folder-tree';
import { ReportStore } from './report-store';

interface DisplayRow {
  folder: string;
  filename: string;
  size: string;
  rawSize: number;
  category: Row['category'];
  hashShort: string;
  hashFull: string;
  source: Row['source'];
  groupId: number;
}

const ROW_HEIGHT = 22;
const OVERSCAN = 10;

@Component({
  selector: 'app-row-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="meta">
      Showing {{ rows().length }} row
      @if (rows().length !== 1) {
        <span>s</span>
      }
      @if (store.selectedFolder(); as f) {
        <span>
          — folder: <code>{{ f || '(root)' }}</code>
        </span>
      }
    </div>
    <div class="viewport" #viewport (scroll)="onScroll()">
      <div class="header" [style.grid-template-columns]="cols()">
        <div class="hcell">Folder</div>
        <div class="hcell">Filename</div>
        <div class="hcell">Size</div>
        <div class="hcell">Category</div>
        @if (showHash()) {
          <div class="hcell">Hash</div>
        }
        <div class="hcell">Source</div>
        <div class="hcell">Group</div>
      </div>
      <div class="canvas" [style.height.px]="canvasHeight()">
        <div class="rows" [style.transform]="translate()">
          @for (row of visible(); track $index) {
            <div class="row" [class]="'cat-' + row.category" [style.grid-template-columns]="cols()">
              <div class="cell folder" [title]="row.folder">{{ row.folder }}</div>
              <div class="cell filename">{{ row.filename }}</div>
              <div class="cell size" [title]="row.rawSize + ' B'">{{ row.size }}</div>
              <div class="cell category">{{ row.category }}</div>
              @if (showHash()) {
                <div class="cell hash" [title]="row.hashFull">{{ row.hashShort }}</div>
              }
              <div class="cell source">{{ row.source }}</div>
              <div class="cell group">{{ row.groupId }}</div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      .meta {
        padding: 4px 8px;
        font-size: 12px;
        color: #444;
        border-bottom: 1px solid #ddd;
      }
      .meta code {
        background: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 3px;
      }
      .viewport {
        flex: 1;
        overflow: auto;
        position: relative;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .header {
        position: sticky;
        top: 0;
        z-index: 1;
        display: grid;
        background: #fafafa;
        border-bottom: 1px solid #ccc;
        font-weight: 600;
      }
      .hcell {
        padding: 2px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .canvas {
        position: relative;
      }
      .rows {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        will-change: transform;
      }
      .row {
        display: grid;
        box-sizing: border-box;
        height: ${ROW_HEIGHT}px;
        line-height: ${ROW_HEIGHT - 4}px;
        border-bottom: 1px solid #eee;
      }
      .cell {
        padding: 2px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row.cat-Duplicate .cell.category {
        color: #1565c0;
      }
      .row.cat-Moved .cell.category {
        color: #6a1b9a;
      }
      .row.cat-Unique .cell.category {
        color: #2e7d32;
      }
      .row.cat-Missing .cell.category {
        color: #c62828;
      }
      .row.cat-New .cell.category {
        color: #ef6c00;
      }
      .row.cat-Changed .cell.category {
        color: #ad1457;
      }
    `,
  ],
})
export class RowTableComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(ReportStore);

  readonly rows = this.store.filteredRows;
  readonly showHash = this.store.showHash;

  private readonly viewportRef = viewChild<ElementRef<HTMLDivElement>>('viewport');

  readonly scrollTop = signal(0);
  readonly viewportHeight = signal(600);

  private resizeObserver?: ResizeObserver;

  readonly canvasHeight = computed(() => this.rows().length * ROW_HEIGHT);

  readonly range = computed<{ start: number; end: number }>(() => {
    const total = this.rows().length;
    if (total === 0) return { start: 0, end: 0 };
    const visibleCount = Math.ceil(this.viewportHeight() / ROW_HEIGHT);
    // Clamp start to [0, total - 1] — when the filter shrinks the row set,
    // scrollTop() can still reflect the old (larger) offset until the browser
    // re-fires a scroll event, which would otherwise put start past total and
    // make `new Array(end - start)` blow up with a negative length.
    const rawStart = Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN;
    const start = Math.min(Math.max(0, rawStart), total - 1);
    const end = Math.min(total, start + visibleCount + OVERSCAN * 2);
    return { start, end };
  });

  readonly visible = computed<DisplayRow[]>(() => {
    const { start, end } = this.range();
    const rows = this.rows();
    const out: DisplayRow[] = new Array(end - start);
    for (let i = start; i < end; i++) {
      const r = rows[i];
      const [folder, filename] = splitFolderAndName(r.filenameAndPath);
      out[i - start] = {
        folder,
        filename,
        size: formatSize(r.fileSize),
        rawSize: r.fileSize,
        category: r.category,
        hashShort: formatHashShort(r.fileSha512Hash),
        hashFull: r.fileSha512Hash,
        source: r.source,
        groupId: r.groupId,
      };
    }
    return out;
  });

  readonly translate = computed(() => `translateY(${this.range().start * ROW_HEIGHT}px)`);

  readonly cols = computed(() => {
    return this.showHash()
      ? 'minmax(160px, 2fr) minmax(140px, 1fr) 90px 100px 130px 80px 70px'
      : 'minmax(160px, 2fr) minmax(140px, 1fr) 90px 100px 80px 70px';
  });

  ngAfterViewInit(): void {
    const el = this.viewportRef()?.nativeElement;
    if (!el) return;
    this.viewportHeight.set(el.clientHeight);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.viewportHeight.set(el.clientHeight);
      });
      this.resizeObserver.observe(el);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onScroll(): void {
    const el = this.viewportRef()?.nativeElement;
    if (!el) return;
    this.scrollTop.set(el.scrollTop);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const el = this.viewportRef()?.nativeElement;
    if (el) this.viewportHeight.set(el.clientHeight);
  }
}
