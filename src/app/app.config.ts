import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { REPORT_BACKEND } from './core/backend/report-backend';
import { MockReportBackend } from './core/backend/mock-report-backend';
import { TauriReportBackend } from './core/backend/tauri-report-backend';
import { isRunningInTauri } from './core/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: REPORT_BACKEND,
      useClass: isRunningInTauri() ? TauriReportBackend : MockReportBackend,
    },
  ],
};
