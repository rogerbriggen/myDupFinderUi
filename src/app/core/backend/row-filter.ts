import { Row, RowPage, RowQuery } from '../models/report';
import { splitFolderAndName } from '../tree/folder-tree';

/**
 * In-memory filter + paginate. Mirrors the Rust `list_rows` impl. Pure
 * function for easy testing.
 */
export function filterAndPage(rows: readonly Row[], query: RowQuery): RowPage {
  const folder = query.folder?.length ? query.folder : undefined;
  const includeDescendants = query.includeDescendants ?? false;
  const text = query.text?.toLowerCase();
  const hash = query.hash?.toUpperCase();
  const cats = query.categories;
  const srcs = query.sources;

  const filtered = rows.filter((r) => {
    if (folder !== undefined) {
      if (includeDescendants) {
        if (!isUnderOrEqual(r.filenameAndPath, folder)) {
          return false;
        }
      } else {
        const [rf] = splitFolderAndName(r.filenameAndPath);
        if (rf !== folder) {
          return false;
        }
      }
    }
    if (text && !r.filenameAndPath.toLowerCase().includes(text)) {
      return false;
    }
    if (hash) {
      const rh = r.fileSha512Hash.toUpperCase();
      if (hash.length >= 8) {
        if (!rh.startsWith(hash)) return false;
      } else if (rh !== hash) {
        return false;
      }
    }
    if (cats && cats.length > 0 && !cats.includes(r.category)) {
      return false;
    }
    if (srcs && srcs.length > 0 && !srcs.includes(r.source)) {
      return false;
    }
    return true;
  });

  const offset = Math.max(0, Math.min(query.offset ?? 0, filtered.length));
  const limit = Math.max(1, query.limit ?? 1000);
  const end = Math.min(offset + limit, filtered.length);
  return {
    rows: filtered.slice(offset, end),
    total: filtered.length,
    offset,
  };
}

function isUnderOrEqual(path: string, folder: string): boolean {
  if (folder.length === 0) return true;
  if (path === folder) return true;
  if (!path.startsWith(folder)) return false;
  const next = path.charAt(folder.length);
  return next === '\\' || next === '/';
}
