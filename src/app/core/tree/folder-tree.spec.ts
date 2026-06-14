import { describe, it, expect } from 'vitest';

import { Row } from '../models/report';
import { buildFolderTree, findNode, splitFolderAndName } from './folder-tree';

function r(
  path: string,
  size: number,
  cat: Row['category'],
  src: Row['source'] = 'Base',
  gid = 1,
): Row {
  return {
    filenameAndPath: path,
    fileSize: size,
    fileSha512Hash: 'H',
    category: cat,
    source: src,
    groupId: gid,
  };
}

describe('splitFolderAndName', () => {
  it('splits Windows path', () => {
    expect(splitFolderAndName('C:\\a\\b\\foo.txt')).toEqual([
      'C:\\a\\b',
      'foo.txt',
    ]);
  });
  it('splits POSIX path', () => {
    expect(splitFolderAndName('/a/b/foo.txt')).toEqual(['/a/b', 'foo.txt']);
  });
  it('handles bare filename', () => {
    expect(splitFolderAndName('foo.txt')).toEqual(['', 'foo.txt']);
  });
});

describe('buildFolderTree', () => {
  it('aggregates counts and sizes recursively', () => {
    const rows: Row[] = [
      r('C:\\a\\b\\one.txt', 100, 'Duplicate'),
      r('C:\\a\\b\\two.txt', 200, 'Unique'),
      r('C:\\a\\c\\three.txt', 50, 'Missing'),
    ];
    const tree = buildFolderTree(rows);
    expect(tree.path).toBe('');
    expect(tree.totalFileCount).toBe(3);
    expect(tree.totalSize).toBe(350);

    const a = findNode(tree, 'C:\\a')!;
    expect(a).toBeDefined();
    expect(a.totalFileCount).toBe(3);
    expect(a.totalSize).toBe(350);
    expect(a.categoryCounts.Duplicate).toBe(1);
    expect(a.categoryCounts.Unique).toBe(1);
    expect(a.categoryCounts.Missing).toBe(1);

    const ab = findNode(tree, 'C:\\a\\b')!;
    expect(ab.totalFileCount).toBe(2);
    expect(ab.totalSize).toBe(300);
    expect(ab.directFileCount).toBe(2);
  });

  it('sorts children alphabetically (case-insensitive)', () => {
    const rows: Row[] = [
      r('root\\Zeta\\f.txt', 1, 'Unique'),
      r('root\\alpha\\f.txt', 1, 'Unique'),
      r('root\\Beta\\f.txt', 1, 'Unique'),
    ];
    const tree = buildFolderTree(rows);
    const root = findNode(tree, 'root')!;
    expect(root.children.map((c) => c.name)).toEqual(['alpha', 'Beta', 'Zeta']);
  });

  it('handles bare-filename rows under synthetic root', () => {
    const rows: Row[] = [r('lonely.txt', 9, 'Unique')];
    const tree = buildFolderTree(rows);
    expect(tree.directFileCount).toBe(1);
    expect(tree.totalFileCount).toBe(1);
  });
});
