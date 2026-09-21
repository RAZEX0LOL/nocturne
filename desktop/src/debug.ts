/** Отладочный журнал: в окне Tauri уходит в терминал через Rust, в браузере — в консоль. */
export function debugLog(line: string) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke('debug_log', { line })).catch(() => {})
  } else {
    console.debug(line)
  }
}
