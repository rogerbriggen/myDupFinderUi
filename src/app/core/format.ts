/** Format a byte count as a short human-readable string (1.2 MB, 540 KB, etc.). */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatHashShort(hash: string): string {
  if (!hash) return '';
  return hash.length <= 12 ? hash : hash.substring(0, 12);
}
