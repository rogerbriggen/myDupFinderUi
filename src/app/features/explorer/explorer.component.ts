import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';

import { FolderTreeComponent } from './folder-tree.component';
import { IdenticalPanelComponent } from './identical-panel.component';
import { ReportStore } from './report-store';
import { RowTableComponent } from './row-table.component';
import { ToolbarComponent } from './toolbar.component';

type DragKind = 'sidebar' | 'identical';

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
      <div class="main">
        <div class="body">
          <div class="sidebar" [style.width.px]="sidebarWidth()">
            <app-folder-tree />
          </div>
          <div
            class="v-splitter"
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize sidebar"
            (mousedown)="startDrag('sidebar', $event)"
          ></div>
          <div class="right">
            @if (!store.handle()) {
              <div class="placeholder">
                No report open. Click <strong>Open report…</strong> in the toolbar above to load a
                <code>dupReport.csv</code>.
              </div>
            } @else {
              <app-row-table />
            }
          </div>
        </div>

        @if (hasIdentical()) {
          @if (identicalVisible()) {
            <div
              class="h-splitter"
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize identical-folders panel"
              (mousedown)="startDrag('identical', $event)"
            ></div>
            <div class="identical" [style.height.px]="identicalHeight()">
              <div class="identical-header">
                <h4>Identical folders</h4>
                <button
                  type="button"
                  class="collapse"
                  (click)="setIdenticalVisible(false)"
                  title="Hide identical-folders panel"
                  aria-label="Hide identical-folders panel"
                >
                  ▾
                </button>
              </div>
              <div class="identical-body">
                <app-identical-panel />
              </div>
            </div>
          } @else {
            <button
              type="button"
              class="identical-show"
              (click)="setIdenticalVisible(true)"
              title="Show identical-folders panel"
            >
              ▴ Identical folders
            </button>
          }
        }
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
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .body {
        flex: 1;
        display: flex;
        min-height: 0;
      }
      .sidebar {
        min-width: 160px;
        max-width: 80vw;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .sidebar app-folder-tree {
        flex: 1;
        min-height: 0;
      }
      .v-splitter {
        flex: 0 0 5px;
        cursor: col-resize;
        background: #ccc;
        position: relative;
      }
      .v-splitter:hover,
      .v-splitter:active {
        background: #6796e1;
      }
      .right {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .h-splitter {
        flex: 0 0 5px;
        cursor: row-resize;
        background: #ccc;
      }
      .h-splitter:hover,
      .h-splitter:active {
        background: #6796e1;
      }
      .identical {
        display: flex;
        flex-direction: column;
        min-height: 80px;
        overflow: hidden;
        border-top: 1px solid #ccc;
        background: #fafafa;
      }
      .identical-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 6px;
        border-bottom: 1px solid #e0e0e0;
        background: #f0f0f0;
      }
      .identical-header h4 {
        margin: 2px 4px;
        font-size: 12px;
        text-transform: uppercase;
        color: #555;
      }
      .collapse {
        border: 1px solid #ccc;
        background: #fff;
        border-radius: 3px;
        padding: 0 6px;
        font-size: 12px;
        line-height: 18px;
        cursor: pointer;
      }
      .collapse:hover {
        background: #e8f0ff;
      }
      .identical-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }
      .identical-show {
        align-self: stretch;
        border: none;
        border-top: 1px solid #ccc;
        background: #f0f0f0;
        color: #444;
        font-size: 12px;
        padding: 4px 8px;
        text-align: left;
        cursor: pointer;
      }
      .identical-show:hover {
        background: #e8f0ff;
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
      :host.dragging-sidebar,
      :host.dragging-identical {
        user-select: none;
        cursor: col-resize;
      }
      :host.dragging-identical {
        cursor: row-resize;
      }
    `,
  ],
  host: {
    '[class.dragging-sidebar]': "drag() === 'sidebar'",
    '[class.dragging-identical]': "drag() === 'identical'",
  },
})
export class ExplorerComponent {
  readonly store = inject(ReportStore);

  readonly sidebarWidth = signal(320);
  readonly identicalHeight = signal(220);
  readonly identicalVisible = signal(true);

  protected readonly drag = signal<DragKind | null>(null);

  hasIdentical(): boolean {
    return this.store.identicalFolders().length > 0 || this.store.identicalLoading();
  }

  setIdenticalVisible(value: boolean): void {
    this.identicalVisible.set(value);
  }

  startDrag(kind: DragKind, event: MouseEvent): void {
    event.preventDefault();
    this.drag.set(kind);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    const kind = this.drag();
    if (!kind) return;
    if (kind === 'sidebar') {
      const next = Math.max(160, Math.min(window.innerWidth - 200, event.clientX));
      this.sidebarWidth.set(next);
    } else {
      const next = Math.max(
        80,
        Math.min(window.innerHeight - 160, window.innerHeight - event.clientY),
      );
      this.identicalHeight.set(next);
    }
  }

  @HostListener('window:mouseup')
  onMouseUp(): void {
    if (this.drag() !== null) this.drag.set(null);
  }
}
