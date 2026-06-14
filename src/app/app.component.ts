import { Component } from '@angular/core';

import { ExplorerComponent } from './features/explorer/explorer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ExplorerComponent],
  template: `<app-explorer />`,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }
    `,
  ],
})
export class AppComponent {}
