import { describe, it, expect } from 'vitest';

import { Row } from '../models/report';
import { filterAndPage } from './row-filter';

function r(
  path: string,
  cat: Row['category'],
  src: Row['source'] = 'Base',
  size = 1,
  hash = 'ABCDEF12',
): Row {
  return {
    filenameAndPath: path,
    fileSize: size,
    fileSha512Hash: hash,
    category: cat,
    source: src,
    groupId: 1,
  };
}

const ROWS: Row[] = [
  r('C:\\a\\one.txt', 'Duplicate', 'Base'),
  r('C:\\a\\b\\two.txt', 'Moved', 'Base'),
  r('C:\\a\\b\\three.txt', 'Unique', 'Base', 1, '55667788'),
  r('D:\\x\\foo.txt', 'Duplicate', 'Second'),
];

describe('filterAndPage', () => {
  it('filters by exact folder', () => {
    const out = filterAndPage(ROWS, { folder: 'C:\\a', limit: 100 });
    expect(out.total).toBe(1);
    expect(out.rows[0].filenameAndPath).toBe('C:\\a\\one.txt');
  });

  it('filters by folder including descendants', () => {
    const out = filterAndPage(ROWS, {
      folder: 'C:\\a',
      includeDescendants: true,
      limit: 100,
    });
    expect(out.total).toBe(3);
  });

  it('filters by category', () => {
    const out = filterAndPage(ROWS, { categories: ['Unique'], limit: 100 });
    expect(out.total).toBe(1);
    expect(out.rows[0].category).toBe('Unique');
  });

  it('filters by case-insensitive text', () => {
    const out = filterAndPage(ROWS, { text: 'THREE', limit: 100 });
    expect(out.total).toBe(1);
  });

  it('filters by hash prefix (>=8 chars)', () => {
    const out = filterAndPage(ROWS, { hash: 'abcdef12', limit: 100 });
    expect(out.total).toBe(3);
  });

  it('paginates', () => {
    const out = filterAndPage(ROWS, { offset: 1, limit: 2 });
    expect(out.total).toBe(4);
    expect(out.rows.length).toBe(2);
    expect(out.offset).toBe(1);
  });

  it('filters by source', () => {
    const out = filterAndPage(ROWS, { sources: ['Second'], limit: 100 });
    expect(out.total).toBe(1);
  });
});
