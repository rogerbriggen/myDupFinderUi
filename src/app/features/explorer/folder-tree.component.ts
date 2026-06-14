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
    <div class="tree-header">
      <label class="toggle-label" [class.disabled]="!hasStatuses()">
        <input
          type="checkbox"
          [checked]="greenOnTop()"
          [disabled]="!hasStatuses()"
          (change)="toggleGreenOnTop($event)"
        />
        <span
          class="dot status-green"
          [attr.title]="
            hasStatuses() ? 'Show green (fully duplicated) folders at top of each level' : ''
          "
        ></span>
        green on top
      </label>
    </div>
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
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-size: 13px;
      }
      .tree-header {
        flex: 0 0 auto;
        padding: 4px 8px;
        border-bottom: 1px solid #eee;
        background: #fafafa;
        font-size: 12px;
        color: #444;
      }
      .toggle-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }
      .toggle-label.disabled {
        color: #999;
        cursor: not-allowed;
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #999;
      }
      .tree {
        flex: 1;
        margin: 0;
        padding: 0;
        list-style: none;
        overflow-y: auto;
        min-height: 0;
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
  readonly greenOnTop = signal<boolean>(true);

  readonly hasStatuses = computed(() => this.statuses().size > 0);

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
    const statuses = this.statuses();
    const sortByStatus = this.greenOnTop() && statuses.size > 0;
    const out: FlattenedNode[] = [];
    walk(root, 0, expanded, statuses, sortByStatus, out);
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

  toggleGreenOnTop(event: Event): void {
    this.greenOnTop.set((event.target as HTMLInputElement).checked);
  }
}

const STATUS_RANK: Record<IdenticalStatus, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

function statusRank(s: IdenticalStatus | undefined): number {
  // Unknown / unscanned siblings sort after red so colored ones come first.
  return s === undefined ? 3 : STATUS_RANK[s];
}

function orderChildren(
  children: readonly FolderNode[],
  statuses: Map<string, IdenticalStatus>,
  sortByStatus: boolean,
): readonly FolderNode[] {
  if (!sortByStatus) return children;
  // Stable sort: rank first, original (already-alphabetical) order as tiebreaker.
  const indexed = children.map((node, index) => ({
    node,
    index,
    rank: statusRank(statuses.get(node.path)),
  }));
  indexed.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return indexed.map((x) => x.node);
}

function walk(
  node: FolderNode,
  depth: number,
  expanded: Set<string>,
  statuses: Map<string, IdenticalStatus>,
  sortByStatus: boolean,
  out: FlattenedNode[],
): void {
  const isLeaf = node.children.length === 0;
  const isExpanded = expanded.has(node.path);
  out.push({ node, depth, expanded: isExpanded, isLeaf });
  if (isExpanded) {
    const ordered = orderChildren(node.children, statuses, sortByStatus);
    for (const child of ordered) {
      walk(child, depth + 1, expanded, statuses, sortByStatus, out);
    }
  }
}
