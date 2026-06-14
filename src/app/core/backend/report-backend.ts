import { InjectionToken } from '@angular/core';
import {
  IdenticalFolderPair,
  ReportHandle,
  RowPage,
  RowQuery,
} from '../models/report';

/**
 * Backend abstraction layer. The UI talks to ReportBackend only; Tauri is one
 * implementation. A second mock implementation backs `ng serve` (no Tauri).
 */
export interface ReportBackend {
  openReport(path: string): Promise<ReportHandle>;
  listRows(handle: ReportHandle, query: RowQuery): Promise<RowPage>;
  findIdenticalFolders(handle: ReportHandle): Promise<IdenticalFolderPair[]>;
  closeReport(handle: ReportHandle): Promise<void>;
  /**
   * Open a native file-picker, return the picked path or null if cancelled.
   * The mock backend returns a fixture path; the Tauri backend uses the
   * dialog plugin.
   */
  pickReportFile(): Promise<string | null>;
}

export const REPORT_BACKEND = new InjectionToken<ReportBackend>('REPORT_BACKEND');
