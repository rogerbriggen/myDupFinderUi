import { ALL_CATEGORIES, Category, Row } from '../models/report';

export interface FolderNode {
  /** Full path of this folder, e.g. `C:\demo\photos`. Empty for the synthetic root. */
  path: string;
  /** Final segment, e.g. `photos`. Empty for the synthetic root. */
  name: string;
  /** Direct child folders, keyed by name and sorted lexicographically. */
  children: FolderNode[];
  /** Number of files directly in this folder. */
  directFileCount: number;
  /** Recursive file count. */
  totalFileCount: number;
  /** Recursive size in bytes. */
  totalSize: number;
  /** Recursive per-category counts. Keys cover ALL_CATEGORIES. */
  categoryCounts: Record<Category, number>;
}

/**
 * Split a `FilenameAndPath` into `[folder, filename]`. Tolerant of both
 * `\` and `/` since the CSV may carry Windows paths even when shown on
 * another OS.
 */
export function splitFolderAndName(path: string): [string, string] {
  let lastSep = -1;
  for (let i = 0; i < path.length; i++) {
    const ch = path.charCodeAt(i);
    if (ch === 92 || ch === 47) {
      lastSep = i;
    }
  }
  if (lastSep < 0) return ['', path];
  return [path.substring(0, lastSep), path.substring(lastSep + 1)];
}

/**
 * Build a folder tree from the rows in a report. Each node carries
 * aggregate counts (per-category, total) over its entire subtree.
 *
 * The synthetic root has `path = ''`. Top-level folders are its children.
 * Rows whose `filenameAndPath` has no separator at all hang directly off
 * the root.
 *
 * Pure function — no Angular dependencies, easy to unit-test.
 */
export function buildFolderTree(rows: readonly Row[]): FolderNode {
  const root: MutableNode = newMutableNode('', '');
  const byPath = new Map<string, MutableNode>();
  byPath.set('', root);

  for (const row of rows) {
    const [folderPath] = splitFolderAndName(row.filenameAndPath);
    const node = ensurePath(root, byPath, folderPath);
    node.directFileCount += 1;

    // Walk up from `node` to the root, accumulating counts.
    let cursor: MutableNode | undefined = node;
    while (cursor) {
      cursor.totalFileCount += 1;
      cursor.totalSize += row.fileSize;
      cursor.categoryCounts[row.category] += 1;
      cursor = cursor.parent;
    }
  }

  // Sort children lexicographically at every level.
  sortDeep(root);
  return freeze(root);
}

interface MutableNode {
  path: string;
  name: string;
  parent?: MutableNode;
  children: Map<string, MutableNode>;
  directFileCount: number;
  totalFileCount: number;
  totalSize: number;
  categoryCounts: Record<Category, number>;
}

function newMutableNode(path: string, name: string): MutableNode {
  const counts = {} as Record<Category, number>;
  for (const c of ALL_CATEGORIES) counts[c] = 0;
  return {
    path,
    name,
    children: new Map(),
    directFileCount: 0,
    totalFileCount: 0,
    totalSize: 0,
    categoryCounts: counts,
  };
}

function ensurePath(
  root: MutableNode,
  byPath: Map<string, MutableNode>,
  folderPath: string,
): MutableNode {
  const existing = byPath.get(folderPath);
  if (existing) return existing;
  if (folderPath === '') return root;

  const [parentPath, name] = splitFolderAndName(folderPath);
  const parent = ensurePath(root, byPath, parentPath);
  const node = newMutableNode(folderPath, name);
  node.parent = parent;
  parent.children.set(name, node);
  byPath.set(folderPath, node);
  return node;
}

function sortDeep(node: MutableNode): void {
  // Map preserves insertion order in JS; rebuild with sorted entries.
  const sorted = Array.from(node.children.entries()).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'accent' }),
  );
  node.children = new Map(sorted);
  for (const child of node.children.values()) sortDeep(child);
}

function freeze(node: MutableNode): FolderNode {
  const children = Array.from(node.children.values()).map(freeze);
  return {
    path: node.path,
    name: node.name,
    children,
    directFileCount: node.directFileCount,
    totalFileCount: node.totalFileCount,
    totalSize: node.totalSize,
    categoryCounts: node.categoryCounts,
  };
}

/** Find a node by exact path. Returns undefined if not present. */
export function findNode(root: FolderNode, path: string): FolderNode | undefined {
  if (root.path === path) return root;
  for (const child of root.children) {
    if (path === child.path) return child;
    if (path.startsWith(child.path) && isSeparatorAt(path, child.path.length)) {
      return findNode(child, path);
    }
  }
  return undefined;
}

function isSeparatorAt(s: string, i: number): boolean {
  if (i >= s.length) return false;
  const ch = s.charCodeAt(i);
  return ch === 92 || ch === 47;
}
