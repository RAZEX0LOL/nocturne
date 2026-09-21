/**
 * Пароль хранится в системном хранилище через Rust-команды (Keychain на Mac, Credential Manager
 * на Windows, Secret Service на Linux). В обычном браузере — во время разработки — команд нет,
 * тогда учётные данные живут только в памяти вкладки и исчезают после перезагрузки.
 */

export interface StoredCredentials {
  server: string
  username: string
  password: string
}

const ACCOUNT_KEY = 'nocturne.account'

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

let memory: StoredCredentials | null = null

export async function saveCredentials(account: string, credentials: StoredCredentials) {
  localStorage.setItem(ACCOUNT_KEY, account)
  if (!inTauri()) {
    memory = credentials
    return
  }
  await invoke('save_credentials', { account, credentials })
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  // Пустой ключ — обычное дело при первом запуске: хранилище просто ответит, что записи нет.
  const account = localStorage.getItem(ACCOUNT_KEY) ?? ''
  if (!inTauri()) return memory
  try {
    return await invoke<StoredCredentials | null>('load_credentials', { account })
  } catch {
    return null
  }
}

export async function forgetCredentials() {
  const account = localStorage.getItem(ACCOUNT_KEY)
  localStorage.removeItem(ACCOUNT_KEY)
  memory = null
  if (account && inTauri()) {
    try {
      await invoke('delete_credentials', { account })
    } catch {
      // Нечего забывать — и хорошо.
    }
  }
}
