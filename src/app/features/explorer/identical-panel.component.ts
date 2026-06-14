import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { formatSize } from '../../core/format';
import { ReportStore } from './report-store';

@Component({
  selector: 'app-identical-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (pairs().length === 0) {
      @if (loading()) {
        <div class="empty">Scanning…</div>
      } @else {
        <div class="empty">
          No identical folder pairs (or scan not started — click “Identical folders”).
        </div>
      }
    } @else {
      <table>
        <thead>
          <tr>
            <th>Base folder</th>
            <th>Second folder</th>
            <th class="num">Files</th>
            <th class="num">Total size</th>
          </tr>
        </thead>
        <tbody>
          @for (p of pairs(); track p.folderA + '→' + p.folderB) {
            <tr>
              <td>
                <button type="button" class="link" (click)="select(p.folderA)" [title]="p.folderA">
                  {{ p.folderA }}
                </button>
              </td>
              <td [title]="p.folderB">{{ p.folderB }}</td>
              <td class="num">{{ p.fileCount }}</td>
              <td class="num">{{ formatSize(p.totalSize) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 6px 8px;
        font-size: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: left;
        padding: 3px 6px;
        border-bottom: 1px solid #eee;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 360px;
      }
      th.num,
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      button.link {
        color: #1565c0;
        cursor: pointer;
        text-decoration: underline;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        text-align: left;
      }
      .empty {
        color: #666;
      }
    `,
  ],
})
export class IdenticalPanelComponent {
  private readonly store = inject(ReportStore);
  readonly pairs = this.store.identicalFolders;
  readonly loading = this.store.identicalLoading;

  select(folder: string): void {
    this.store.selectFolder(folder);
  }

  protected readonly formatSize = formatSize;
}
