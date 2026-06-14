import { Injectable } from '@angular/core';

import {
  Category,
  IdenticalFolderPair,
  ReportHandle,
  Row,
  RowPage,
  RowQuery,
  Source,
} from '../models/report';
import { ReportBackend } from './report-backend';
import { filterAndPage } from './row-filter';

/**
 * In-memory backend used when Tauri is not available (e.g. `ng serve`)
 * and in unit tests. Carries a small fixture so the UI is interactive.
 */
@Injectable({ providedIn: 'root' })
export class MockReportBackend implements ReportBackend {
  private readonly reports = new Map<number, { jobName: string; rows: Row[] }>();
  private nextId = 0;

  async openReport(_path: string): Promise<ReportHandle> {
    const rows = MOCK_ROWS.slice();
    const id = ++this.nextId;
    this.reports.set(id, { jobName: 'Mock report', rows });
    return {
      id,
      rowCount: rows.length,
      jobName: 'Mock report',
      hasSecondSource: rows.some((r) => r.source === 'Second'),
    };
  }

  async listRows(handle: ReportHandle, query: RowQuery): Promise<RowPage> {
    const r = this.reports.get(handle.id);
    if (!r) {
      throw new Error(`Unknown handle ${handle.id}`);
    }
    return filterAndPage(r.rows, query);
  }

  async findIdenticalFolders(
    handle: ReportHandle,
  ): Promise<IdenticalFolderPair[]> {
    if (!this.reports.has(handle.id)) {
      throw new Error(`Unknown handle ${handle.id}`);
    }
    // Tiny fixed result so the UI panel has something to render.
    return [
      {
        folderA: 'C:\\demo\\base\\photos',
        folderB: 'D:\\demo\\copy\\photos',
        fileCount: 2,
        totalSize: 3072,
      },
    ];
  }

  async closeReport(handle: ReportHandle): Promise<void> {
    this.reports.delete(handle.id);
  }

  async pickReportFile(): Promise<string | null> {
    return 'mock://fixture.csv';
  }
}

const MOCK_ROWS: Row[] = [
  row('C:\\demo\\base\\photos\\a.jpg', 1024, 'AA11', 'Duplicate', 'Base', 1),
  row('D:\\demo\\copy\\photos\\a.jpg', 1024, 'AA11', 'Duplicate', 'Second', 1),
  row('C:\\demo\\base\\photos\\b.jpg', 2048, 'BB22', 'Duplicate', 'Base', 2),
  row('D:\\demo\\copy\\photos\\b.jpg', 2048, 'BB22', 'Duplicate', 'Second', 2),
  row('C:\\demo\\base\\docs\\readme.md', 512, 'CC33', 'Unique', 'Base', 3),
  row('D:\\demo\\copy\\docs\\note.md', 200, 'DD44', 'New', 'Second', 4),
  row('C:\\demo\\base\\docs\\old.md', 400, 'EE55', 'Missing', 'Base', 5),
];

function row(
  path: string,
  size: number,
  hash: string,
  category: Category,
  source: Source,
  groupId: number,
): Row {
  return {
    filenameAndPath: path,
    fileSize: size,
    fileSha512Hash: hash,
    category,
    source,
    groupId,
  };
}
