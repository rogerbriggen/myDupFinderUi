import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { FolderTreeComponent } from './folder-tree.component';
import { IdenticalPanelComponent } from './identical-panel.component';
import { ReportStore } from './report-store';
import { RowTableComponent } from './row-table.component';
import { ToolbarComponent } from './toolbar.component';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [
    CommonModule,
    ToolbarComponent,
    FolderTreeComponent,
    RowTableComponent,
    IdenticalPanelComponent,
  ],
  template: `
    <div class="layout">
      <app-toolbar />
      <div class="body">
        <div class="left">
          <app-folder-tree />
          @if (store.identicalFolders().length > 0 || store.identicalLoading()) {
            <div class="identical">
              <h4>Identical folders</h4>
              <app-identical-panel />
            </div>
          }
        </div>
        <div class="right">
          @if (!store.handle()) {
            <div class="placeholder">
              No report open. Click <strong>Open report…</strong> in the
              toolbar above to load a <code>dupReport.csv</code>.
            </div>
          } @else {
            <app-row-table />
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }
      .layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .body {
        flex: 1;
        display: flex;
        min-height: 0;
      }
      .left {
        width: 320px;
        min-width: 220px;
        border-right: 1px solid #ccc;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .left app-folder-tree {
        flex: 1;
        min-height: 0;
      }
      .identical {
        max-height: 40%;
        overflow: auto;
        border-top: 1px solid #ccc;
        background: #fafafa;
      }
      .identical h4 {
        margin: 4px 8px;
        font-size: 12px;
        text-transform: uppercase;
        color: #555;
      }
      .right {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .placeholder {
        padding: 24px;
        color: #555;
      }
      .placeholder code {
        background: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 3px;
      }
    `,
  ],
})
export class ExplorerComponent {
  readonly store = inject(ReportStore);
}
