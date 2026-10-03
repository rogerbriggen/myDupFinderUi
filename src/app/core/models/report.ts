export type Category = 'Duplicate' | 'Moved' | 'Unique' | 'Missing' | 'New' | 'Changed';

export const ALL_CATEGORIES: readonly Category[] = [
  'Duplicate',
  'Moved',
  'Unique',
  'Missing',
  'New',
  'Changed',
];

export type Source = 'Base' | 'Second';

export interface Row {
  filenameAndPath: string;
  fileSize: number;
  fileSha512Hash: string;
  category: Category;
  source: Source;
  groupId: number;
}

export interface RowQuery {
  folder?: string;
  includeDescendants?: boolean;
  text?: string;
  hash?: string;
  categories?: Category[];
  sources?: Source[];
  offset?: number;
  limit?: number;
}

export interface RowPage {
  rows: Row[];
  total: number;
  offset: number;
}

export interface ReportHandle {
  id: number;
  rowCount: number;
  jobName: string;
  hasSecondSource: boolean;
}

export interface IdenticalFolderPair {
  folderA: string;
  folderB: string;
  fileCount: number;
  totalSize: number;
}

/**
 * Progress event emitted by the Rust streaming parser during `openReport`.
 * `phase: "parsing"` arrives periodically while rows are being read;
 * `phase: "done"` arrives once when the parse finishes (just before the
 * `openReport` promise resolves).
 */
export interface ReportProgressEvent {
  phase: 'parsing' | 'done';
  rowsRead: number;
  bytesRead: number;
  totalBytes: number | null;
}
