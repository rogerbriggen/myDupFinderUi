import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FolderNode, IdenticalStatus } from '../../core/tree/folder-tree';
import { ReportStore } from './report-store';

interface FlattenedNode {
  node: FolderNode;
  depth: number;
  expanded: boolean;
  isLeaf: boolean;
}

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (!tree()) {
      <div class="empty">No report open.</div>
    } @else {
      <ul class="tree">
        @for (item of flattened(); track item.node.path) {
          <li
            class="row"
            role="treeitem"
            tabindex="0"
            [attr.aria-selected]="item.node.path === selected()"
            [class.selected]="item.node.path === selected()"
            [style.paddingLeft.px]="8 + item.depth * 14"
            (click)="select(item.node.path)"
            (keydown.enter)="select(item.node.path)"
            (keydown.space)="select(item.node.path); $event.preventDefault()"
          >
            <button
              class="toggle"
              type="button"
              [disabled]="item.isLeaf"
              (click)="onToggle($event, item.node.path)"
            >
              {{ item.isLeaf ? '·' : item.expanded ? '▾' : '▸' }}
            </button>
            @if (statusOf(item.node.path); as s) {
              <span
                class="status"
                [class.status-green]="s === 'green'"
                [class.status-yellow]="s === 'yellow'"
                [class.status-red]="s === 'red'"
                [attr.title]="statusTitle(s)"
                [attr.aria-label]="statusTitle(s)"
              ></span>
            }
            <span class="name">{{ item.node.name || '/' }}</span>
            <span class="count">{{ item.node.totalFileCount }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        overflow-y: auto;
        font-size: 13px;
      }
      .tree {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        padding: 2px 8px;
        white-space: nowrap;
      }
      .row:hover {
        background: rgba(64, 128, 255, 0.08);
      }
      .row.selected {
        background: rgba(64, 128, 255, 0.18);
      }
      .toggle {
        width: 18px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-family: inherit;
        padding: 0;
      }
      .toggle[disabled] {
        cursor: default;
        opacity: 0.4;
      }
      .status {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #999;
      }
      .status-green {
        background: #2ea043;
      }
      .status-yellow {
        background: #d4a017;
      }
      .status-red {
        background: #cf222e;
      }
      .name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .count {
        opacity: 0.6;
        font-variant-numeric: tabular-nums;
        font-size: 11px;
      }
      .empty {
        padding: 8px;
        color: #777;
      }
    `,
  ],
})
export class FolderTreeComponent {
  private readonly store = inject(ReportStore);

  readonly tree = this.store.tree;
  readonly selected = this.store.selectedFolder;
  readonly statuses = this.store.identicalStatuses;
  readonly expanded = signal<Set<string>>(new Set<string>(['']));

  statusOf(path: string): IdenticalStatus | undefined {
    return this.statuses().get(path);
  }

  statusTitle(s: IdenticalStatus): string {
    if (s === 'green') return 'Entire subtree has an identical match elsewhere';
    if (s === 'yellow') return 'Some descendants have an identical match elsewhere';
    return 'No identical match in this subtree';
  }

  readonly flattened = computed<FlattenedNode[]>(() => {
    const root = this.tree();
    if (!root) return [];
    const expanded = this.expanded();
    const out: FlattenedNode[] = [];
    walk(root, 0, expanded, out);
    return out;
  });

  select(path: string): void {
    this.store.selectFolder(path);
  }

  onToggle(event: MouseEvent, path: string): void {
    event.stopPropagation();
    const next = new Set(this.expanded());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.expanded.set(next);
  }
}

function walk(node: FolderNode, depth: number, expanded: Set<string>, out: FlattenedNode[]): void {
  const isLeaf = node.children.length === 0;
  const isExpanded = expanded.has(node.path);
  out.push({ node, depth, expanded: isExpanded, isLeaf });
  if (isExpanded) {
    for (const child of node.children) {
      walk(child, depth + 1, expanded, out);
    }
  }
}
