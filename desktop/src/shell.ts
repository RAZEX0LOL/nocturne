import type { Song } from './core/models'
import { t } from './i18n'
import { isWindows } from './native'
import { isDesktop } from './platform'
import { store, type State } from './state/store'

/**
 * Связь окна с системой вокруг него: системный плеер Windows, кнопки в превью на панели задач,
 * цвет акцента, заголовок окна с текущим треком, перетаскивание файлов из проводника и
 * контекстные меню. Сам плеер об этом ничего не знает — здесь только подписка на его состояние.
 */

interface Accent {
  fill: string
  text: string
}

interface NativeStyle {
  platform: string
  mica: boolean
  accent?: Accent
}

type MediaAction = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek'

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

function applyAccent(accent: Accent) {
  const root = document.documentElement.style
  root.setProperty('--accent', accent.fill)
  root.setProperty('--accent-text', accent.text)
}

export async function startShell() {
  if (!isDesktop()) return
  const { listen } = await import('@tauri-apps/api/event')
  quietBrowserBehaviour()
  followTitle()
  void followDragDrop()
  if (!isWindows) return

  try {
    const style = await invoke<NativeStyle>('native_style')
    document.documentElement.classList.toggle('mica', style.mica)
    if (style.accent) applyAccent(style.accent)
  } catch {
    // Без сведений о системе остаётся непрозрачный фон и свой акцент — тоже нормально.
  }
  await listen<Accent>('accent-changed', (event) => applyAccent(event.payload))
  await listen<{ action: MediaAction; position?: number }>('media-command', ({ payload }) => {
    switch (payload.action) {
      case 'play': return store.resume()
      case 'pause': return store.pause()
      case 'toggle': return store.toggle()
      case 'next': return void store.advance()
      case 'previous': return void store.previous()
      case 'seek': return payload.position !== undefined && store.seek(payload.position)
    }
  })
  followPlayer()
}

// MARK: - Системный плеер и панель задач (Windows)

async function coverFor(song: Song, state: State): Promise<{ coverUrl?: string; coverPath?: string }> {
  const id = song.coverArt
  if (!id) return {}
  if (id.startsWith('file:')) return { coverPath: id.slice('file:'.length) }
  const saved = state.coverFiles[id]
  if (saved) return { coverPath: saved }
  if (state.offline || !state.client) return {}
  return { coverUrl: await state.client.cover(id, 512) }
}

function followPlayer() {
  let songId: string | undefined
  let stateKey = ''
  let lastPosition = 0
  let language = ''

  const sync = () => {
    const state = store.snapshot()
    const song = state.queue?.current?.song

    if (state.settings.language !== language) {
      language = state.settings.language
      void invoke('taskbar_labels', {
        previous: t('Предыдущий трек'),
        play: t('Воспроизвести'),
        pause: t('Пауза'),
        next: t('Следующий трек'),
      }).catch(() => {})
    }

    if (song && song.id !== songId) {
      songId = song.id
      void coverFor(song, state)
        .catch(() => ({}))
        .then((cover) =>
          invoke('media_metadata', { song: { title: song.title, artist: song.artist, album: song.album, ...cover } }),
        )
        .catch(() => {})
    }

    // Системе хватает отметки раз в пять секунд: дальше она сама двигает ползунок. Но перемотку
    // и паузу надо передать сразу, иначе плашка покажет не то место.
    const position = state.position
    const jumped = Math.abs(position - lastPosition) > 2
    lastPosition = position
    const key = `${state.playing}|${!!song}|${Math.floor(position / 5)}|${Math.round(state.duration)}`
    if (key === stateKey && !jumped) return
    stateKey = key
    void invoke('media_state', {
      playing: state.playing,
      active: !!song,
      position,
      duration: state.duration || song?.duration || 0,
    }).catch(() => {})
  }

  store.subscribe(sync)
  sync()
}

// MARK: - Заголовок окна

/** Название трека в заголовке видно на панели задач, в Alt+Tab и в превью окна. */
function followTitle() {
  let shown = ''
  store.subscribe(() => {
    const song = store.snapshot().queue?.current?.song
    const title = song ? `${song.title} — ${song.artist ?? t('Неизвестный исполнитель')}` : 'Nocturne'
    if (title === shown) return
    shown = title
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title)).catch(() => {})
  })
}

// MARK: - Перетаскивание из проводника

async function followDragDrop() {
  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  await getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'over') store.setDragging(true)
    else if (payload.type === 'leave') store.setDragging(false)
    else if (payload.type === 'drop') {
      store.setDragging(false)
      void store.importPaths(payload.paths)
    }
  })
}

// MARK: - Окно, а не страница

function isEditable(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
}

/**
 * Меню браузера («Назад», «Обновить», «Печать») по правому клику выдаёт веб-страницу. В полях
 * ввода системное меню правки остаётся: вставить адрес сервера правым кликом — обычное дело.
 * В отладочной сборке меню нужно ради инспектора.
 */
function quietBrowserBehaviour() {
  if (import.meta.env.DEV) return
  document.addEventListener('contextmenu', (event) => {
    if (!isEditable(event.target)) event.preventDefault()
  })
}

export type MenuEntry = { text: string; action: () => void; enabled?: boolean } | 'separator' | false | null | undefined

/** Системное контекстное меню — такое же, как у проводника, а не нарисованное страницей. */
export async function popupMenu(entries: MenuEntry[]) {
  if (!isDesktop()) return
  const { Menu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
  const items = await Promise.all(
    entries
      .filter((entry): entry is Exclude<MenuEntry, false | null | undefined> => !!entry)
      .map((entry) =>
        entry === 'separator'
          ? PredefinedMenuItem.new({ item: 'Separator' })
          : MenuItem.new({ text: entry.text, enabled: entry.enabled ?? true, action: entry.action }),
      ),
  )
  const menu = await Menu.new({ items })
  await menu.popup()
  // Выбор пункта доходит до окна чуть позже закрытия меню — освобождаем его не сразу.
  setTimeout(() => void menu.close().catch(() => {}), 2000)
}
