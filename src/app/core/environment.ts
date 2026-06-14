/**
 * Best-effort runtime detection of the Tauri host. When the bundle runs
 * inside a Tauri window the global `__TAURI_INTERNALS__` is injected. In a
 * plain browser (e.g. `ng serve`) it is not, and we fall back to the mock
 * backend.
 */
export function isRunningInTauri(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__);
}
