import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ALL_CATEGORIES, Category, Source } from '../../core/models/report';
import { ReportStore } from './report-store';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bar">
      <button type="button" (click)="open()" [disabled]="store.loading()">
        @if (store.loading()) { Loading… } @else { Open report… }
      </button>

      @if (store.handle(); as h) {
        <span class="status">
          <strong>{{ h.jobName }}</strong> — {{ h.rowCount }} rows
        </span>
      }

      <input
        type="text"
        placeholder="path / filename filter"
        [ngModel]="store.textFilter()"
        (ngModelChange)="store.setTextFilter($event)"
        [disabled]="!store.handle()"
      />

      <input
        type="text"
        placeholder="hash filter (≥8 chars)"
        [ngModel]="store.hashFilter()"
        (ngModelChange)="store.setHashFilter($event)"
        [disabled]="!store.handle()"
        class="hash"
      />

      <label class="check">
        <input
          type="checkbox"
          [checked]="store.includeDescendants()"
          (change)="store.toggleIncludeDescendants(asBool($event))"
        />
        descendants
      </label>

      <label class="check">
        <input
          type="checkbox"
          [checked]="store.showHash()"
          (change)="store.toggleShowHash(asBool($event))"
        />
        hash column
      </label>

      <span class="sep"></span>

      <span class="chips">
        @for (cat of categories; track cat) {
          <label class="chip cat-{{ cat }}" [class.on]="hasCategory(cat)">
            <input
              type="checkbox"
              [checked]="hasCategory(cat)"
              (change)="store.toggleCategory(cat, asBool($event))"
            />
            {{ cat }}
          </label>
        }
      </span>

      @if (store.handle()?.hasSecondSource) {
        <span class="chips">
          @for (s of sources; track s) {
            <label class="chip" [class.on]="hasSource(s)">
              <input
                type="checkbox"
                [checked]="hasSource(s)"
                (change)="store.toggleSource(s, asBool($event))"
              />
              {{ s }}
            </label>
          }
        </span>
      }

      <button
        type="button"
        (click)="store.loadIdenticalFolders()"
        [disabled]="!store.handle() || store.identicalLoading()"
      >
        @if (store.identicalLoading()) { Scanning… } @else { Identical folders }
      </button>
    </div>

    @if (store.errorMessage(); as err) {
      <div class="error">{{ err }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        border-bottom: 1px solid #ccc;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        font-size: 12px;
      }
      .status {
        margin: 0 4px;
        color: #444;
      }
      input[type='text'] {
        font-size: 12px;
        padding: 3px 6px;
        border: 1px solid #ccc;
        border-radius: 4px;
        min-width: 160px;
      }
      input.hash {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        min-width: 140px;
      }
      button {
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
        border: 1px solid #ccc;
        background: #f6f6f6;
        border-radius: 4px;
      }
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .check {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .sep {
        flex: 1;
      }
      .chips {
        display: inline-flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 1px solid #ccc;
        border-radius: 12px;
        padding: 2px 8px;
        background: #fff;
      }
      .chip.on {
        background: #e8f0ff;
        border-color: #6796e1;
      }
      .error {
        background: #fdecea;
        color: #b71c1c;
        padding: 4px 8px;
        font-size: 12px;
      }
    `,
  ],
})
export class ToolbarComponent {
  readonly store = inject(ReportStore);
  readonly categories: readonly Category[] = ALL_CATEGORIES;
  readonly sources: readonly Source[] = ['Base', 'Second'];

  open(): void {
    void this.store.pickAndOpen();
  }

  hasCategory(c: Category): boolean {
    return this.store.categoryFilter().includes(c);
  }

  hasSource(s: Source): boolean {
    return this.store.sourceFilter().includes(s);
  }

  asBool(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
