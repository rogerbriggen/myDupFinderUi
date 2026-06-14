import { describe, it, expect } from 'vitest';

import { IdenticalFolderPair, Row } from '../models/report';
import {
  buildFolderTree,
  computeIdenticalStatuses,
  findNode,
  splitFolderAndName,
} from './folder-tree';

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
    expect(splitFolderAndName('C:\\a\\b\\foo.txt')).toEqual(['C:\\a\\b', 'foo.txt']);
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

describe('computeIdenticalStatuses', () => {
  function pair(folderA: string, folderB: string): IdenticalFolderPair {
    return { folderA, folderB, fileCount: 1, totalSize: 1 };
  }

  it('returns an empty map when no pairs are provided', () => {
    const tree = buildFolderTree([r('C:\\a\\one.txt', 1, 'Unique')]);
    expect(computeIdenticalStatuses(tree, []).size).toBe(0);
  });

  it('marks an identical folder and its whole subtree green', () => {
    const rows: Row[] = [
      r('C:\\a\\b\\one.txt', 1, 'Duplicate'),
      r('C:\\a\\b\\sub\\two.txt', 1, 'Duplicate'),
    ];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [pair('C:\\a\\b', 'D:\\copy')]);
    expect(m.get('C:\\a\\b')).toBe('green');
    expect(m.get('C:\\a\\b\\sub')).toBe('green');
  });

  it('marks a parent yellow when only some descendants are green', () => {
    const rows: Row[] = [
      r('C:\\a\\b\\one.txt', 1, 'Duplicate'),
      r('C:\\a\\c\\two.txt', 1, 'Unique'),
    ];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [pair('C:\\a\\b', 'D:\\copy')]);
    expect(m.get('C:\\a\\b')).toBe('green');
    expect(m.get('C:\\a\\c')).toBe('red');
    expect(m.get('C:\\a')).toBe('yellow');
  });

  it('marks a parent green when every child is green', () => {
    const rows: Row[] = [
      r('C:\\a\\b\\one.txt', 1, 'Duplicate'),
      r('C:\\a\\c\\two.txt', 1, 'Duplicate'),
    ];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [
      pair('C:\\a\\b', 'D:\\x'),
      pair('C:\\a\\c', 'D:\\y'),
    ]);
    expect(m.get('C:\\a')).toBe('green');
  });

  it('downgrades a parent to yellow when it holds loose files alongside green children', () => {
    // C:\a\b is in an identical pair, but C:\a also has a loose file that has
    // no identical match of its own — so C:\a is not fully duplicated.
    const rows: Row[] = [
      r('C:\\a\\loose.txt', 1, 'Unique'),
      r('C:\\a\\b\\one.txt', 1, 'Duplicate'),
    ];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [pair('C:\\a\\b', 'D:\\copy')]);
    expect(m.get('C:\\a\\b')).toBe('green');
    expect(m.get('C:\\a')).toBe('yellow');
  });

  it('keeps a paired folder green even when it holds direct files', () => {
    // C:\a is the paired folder itself, so its direct files are part of the
    // match by definition — no downgrade.
    const rows: Row[] = [
      r('C:\\a\\one.txt', 1, 'Duplicate'),
      r('C:\\a\\b\\two.txt', 1, 'Duplicate'),
    ];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [pair('C:\\a', 'D:\\copy')]);
    expect(m.get('C:\\a')).toBe('green');
    expect(m.get('C:\\a\\b')).toBe('green');
  });

  it('marks a folder red when no descendant has an identical match', () => {
    const rows: Row[] = [r('C:\\a\\b\\one.txt', 1, 'Unique')];
    const tree = buildFolderTree(rows);
    const m = computeIdenticalStatuses(tree, [pair('Z:\\other', 'Z:\\other2')]);
    expect(m.get('C:\\a')).toBe('red');
    expect(m.get('C:\\a\\b')).toBe('red');
  });
});
