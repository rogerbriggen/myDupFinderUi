import { Component, computed, inject } from '@angular/core';
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
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="folder">Folder</th>
            <th class="filename">Filename</th>
            <th class="size">Size</th>
            <th class="category">Category</th>
            @if (showHash()) {
              <th class="hash">Hash</th>
            }
            <th class="source">Source</th>
            <th class="group">Group</th>
          </tr>
        </thead>
        <tbody>
          @for (row of display(); track $index) {
            <tr [class]="'cat-' + row.category">
              <td class="folder" [title]="row.folder">{{ row.folder }}</td>
              <td class="filename">{{ row.filename }}</td>
              <td class="size" [title]="row.rawSize + ' B'">{{ row.size }}</td>
              <td class="category">{{ row.category }}</td>
              @if (showHash()) {
                <td class="hash" [title]="row.hashFull">{{ row.hashShort }}</td>
              }
              <td class="source">{{ row.source }}</td>
              <td class="group">{{ row.groupId }}</td>
            </tr>
          }
        </tbody>
      </table>
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
      .scroll {
        flex: 1;
        overflow: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      th,
      td {
        text-align: left;
        padding: 2px 8px;
        border-bottom: 1px solid #eee;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 320px;
      }
      thead th {
        position: sticky;
        top: 0;
        background: #fafafa;
        border-bottom: 1px solid #ccc;
        font-weight: 600;
      }
      tr.cat-Duplicate td.category {
        color: #1565c0;
      }
      tr.cat-Moved td.category {
        color: #6a1b9a;
      }
      tr.cat-Unique td.category {
        color: #2e7d32;
      }
      tr.cat-Missing td.category {
        color: #c62828;
      }
      tr.cat-New td.category {
        color: #ef6c00;
      }
      tr.cat-Changed td.category {
        color: #ad1457;
      }
    `,
  ],
})
export class RowTableComponent {
  readonly store = inject(ReportStore);

  readonly rows = this.store.filteredRows;
  readonly showHash = this.store.showHash;

  /** v1: cap render at 5000 rows to stay responsive without virtual-scroll. */
  readonly display = computed<DisplayRow[]>(() => {
    const rows = this.rows();
    const sliced = rows.length > 5000 ? rows.slice(0, 5000) : rows;
    return sliced.map((r) => {
      const [folder, filename] = splitFolderAndName(r.filenameAndPath);
      return {
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
    });
  });
}
