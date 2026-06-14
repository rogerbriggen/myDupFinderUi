import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import { IdenticalFolderPair, ReportHandle, RowPage, RowQuery } from '../models/report';
import { ReportBackend } from './report-backend';

@Injectable({ providedIn: 'root' })
export class TauriReportBackend implements ReportBackend {
  openReport(path: string): Promise<ReportHandle> {
    return invoke<ReportHandle>('open_report', { path });
  }

  listRows(handle: ReportHandle, query: RowQuery): Promise<RowPage> {
    return invoke<RowPage>('list_report_rows', {
      handle: handle.id,
      query: normalizeQuery(query),
    });
  }

  findIdenticalFolders(handle: ReportHandle): Promise<IdenticalFolderPair[]> {
    return invoke<IdenticalFolderPair[]>('find_identical_folders_cmd', {
      handle: handle.id,
    });
  }

  async closeReport(handle: ReportHandle): Promise<void> {
    await invoke<void>('close_report', { handle: handle.id });
  }

  async pickReportFile(): Promise<string | null> {
    const result = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Dup report CSV', extensions: ['csv'] }],
    });
    if (typeof result === 'string') {
      return result;
    }
    return null;
  }
}

function normalizeQuery(q: RowQuery): RowQuery {
  return {
    folder: q.folder,
    includeDescendants: q.includeDescendants ?? false,
    text: q.text,
    hash: q.hash,
    categories: q.categories,
    sources: q.sources,
    offset: q.offset ?? 0,
    limit: q.limit ?? 1000,
  };
}
