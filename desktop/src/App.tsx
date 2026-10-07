import { useEffect, useRef, useState } from 'react'
import { store, useStore, type View } from './state/store'
import { Connect } from './ui/Connect'
import { Icon, type IconName } from './ui/Icon'
import { InfoBar } from './ui/InfoBar'
import { Player, type Panel } from './ui/Player'
import { NowPlaying } from './ui/NowPlaying'
import { openMiniPlayer } from './shell'
import { LyricsPanel } from './ui/LyricsPanel'
import { QueuePanel } from './ui/QueuePanel'
import { SettingsView } from './ui/SettingsView'
import { SidebarPlaylists } from './ui/SidebarPlaylists'
import { DialogHost } from './ui/Dialogs'
import { DragGhost } from './ui/DragGhost'
import { SmartEditor } from './ui/SmartEditor'
import {
  DownloadsView,
  LocalView,
  AlbumsView,
  AlbumView,
  ArtistsView,
  ArtistView,
  FavoritesView,
  GenresView,
  GenreView,
  HomeView,
  RadioView,
  PlaylistsView,
  PlaylistView,
  SearchView,
} from './ui/Views'
import { t } from './i18n'

interface Section {
  view: View
  /** Русское название как ключ: перевод берётся при показе, иначе смена языка не доходит до меню. */
  label: string
  icon: IconName
}

const HOME: Section = { view: { kind: 'home' }, label: 'Главная', icon: 'home' }
const SEARCH: Section = { view: { kind: 'search' }, label: 'Поиск', icon: 'search' }
const LOCAL: Section = { view: { kind: 'local' }, label: 'На компьютере', icon: 'computer' }
const DOWNLOADS: Section = { view: { kind: 'downloads' }, label: 'Загрузки', icon: 'download' }
const SERVER: Section[] = [
  { view: { kind: 'albums' }, label: 'Альбомы', icon: 'album' },
  { view: { kind: 'artists' }, label: 'Артисты', icon: 'artist' },
  { view: { kind: 'playlists' }, label: 'Плейлисты', icon: 'playlist' },
  { view: { kind: 'favorites' }, label: 'Избранное', icon: 'heart' },
  { view: { kind: 'genres' }, label: 'Жанры', icon: 'genre' },
  { view: { kind: 'radio' }, label: 'Радио', icon: 'radio' },
]

/** Без сервера — только своя музыка; без связи — то, что на диске; иначе всё. */
function sectionsFor(serverless: boolean, offline: boolean): Section[] {
  if (serverless) return [LOCAL, SEARCH]
  if (offline) return [HOME, LOCAL, DOWNLOADS, SEARCH]
  return [HOME, SEARCH, LOCAL, DOWNLOADS, ...SERVER]
}

/** Раздел, к которому относится открытая страница: по нему подсвечивается пункт меню. */
const sectionOf: Record<View['kind'], View['kind']> = {
  home: 'home',
  local: 'local',
  downloads: 'downloads',
  search: 'search',
  albums: 'albums',
  album: 'albums',
  artists: 'artists',
  artist: 'artists',
  playlists: 'playlists',
  playlist: 'playlists',
  favorites: 'favorites',
  genres: 'genres',
  genre: 'genres',
  radio: 'radio',
  smart: 'playlists',
}

function Content({ view }: { view: View }) {
  switch (view.kind) {
    case 'home': return <HomeView />
    case 'local': return <LocalView />
    case 'downloads': return <DownloadsView />
    case 'search': return <SearchView />
    case 'albums': return <AlbumsView />
    case 'album': return <AlbumView album={view.album} />
    case 'artists': return <ArtistsView />
    case 'artist': return <ArtistView artist={view.artist} />
    case 'playlists': return <PlaylistsView />
    case 'playlist': return <PlaylistView playlist={view.playlist} />
    case 'favorites': return <FavoritesView />
    case 'genres': return <GenresView />
    case 'genre': return <GenreView genre={view.genre} />
    case 'radio': return <RadioView />
    case 'smart': return <SmartEditor id={view.id} />
  }
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element?.tagName === 'INPUT' || element?.tagName === 'SELECT' || element?.tagName === 'TEXTAREA'
}

export function App() {
  const { status, error, notice, view, history, serverless, offline, dragging } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [nowPlaying, setNowPlaying] = useState(false)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    void store.restore()
    // Проверяем обновление один раз при запуске: чаще незачем, приложение не сервис.
    void store.checkForUpdate()
  }, [])

  // Новая страница открывается сверху, а не с прокруткой предыдущей.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [view, settingsOpen])

  const goBack = () => {
    if (settingsOpen) setSettingsOpen(false)
    else store.back()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      // Escape закрывает настройки и боковую панель — и из поля ввода тоже.
      if (event.key === 'Escape') {
        if (nowPlaying) setNowPlaying(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (panel) setPanel(null)
        return
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSettingsOpen(false)
        store.section({ kind: 'search' })
        return
      }
      if (isTyping(event.target)) return
      const volume = store.snapshot().settings.volume
      // Пробел — пауза; Ctrl+←/→ — соседний трек, Ctrl+↑/↓ — громкость;
      // Alt+← и Backspace — назад, как в проводнике.
      if (event.code === 'Space') {
        event.preventDefault()
        store.toggle()
      } else if (mod && event.key === 'ArrowRight') {
        event.preventDefault()
        void store.advance()
      } else if (mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        void store.previous()
      } else if (mod && event.key === 'ArrowUp') {
        event.preventDefault()
        store.update({ volume: Math.min(1, volume + 0.05) })
      } else if (mod && event.key === 'ArrowDown') {
        event.preventDefault()
        store.update({ volume: Math.max(0, volume - 0.05) })
      } else if ((event.altKey && event.key === 'ArrowLeft') || event.key === 'Backspace') {
        event.preventDefault()
        goBack()
      } else if (mod && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
    }
    // Боковая кнопка мыши «назад» — привычка каждого, у кого мышь с боковыми кнопками.
    const onMouse = (event: MouseEvent) => {
      if (event.button !== 3) return
      event.preventDefault()
      goBack()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  })

  if (status === 'connecting') {
    return <div className="grid h-full place-items-center text-secondary">{t('Загружаю…')}</div>
  }
  if (status === 'signed-out')
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Connect />
        </div>
        <UpdateBanner />
      </div>
    )

  const active = settingsOpen ? undefined : sectionOf[view.kind]
  const canGoBack = settingsOpen || history.length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-60 shrink-0 flex-col gap-0.5 px-1.5 pb-2 pt-1">
          <div className="titlebar-space" data-tauri-drag-region />
          <div className="flex h-12 items-center gap-1 px-1" data-tauri-drag-region>
            <button onClick={goBack} disabled={!canGoBack} className="icon-btn" title={t('Назад')} aria-label={t('Назад')}>
              <Icon name="back" />
            </button>
            <span className="px-2 text-xs font-semibold tracking-[0.2em] text-secondary">NOCTURNE</span>
          </div>
          <div className="sidebar-scroll -mx-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5">
          {sectionsFor(serverless, offline).map((section) => (
            <button
              key={section.view.kind}
              onClick={() => {
                setSettingsOpen(false)
                store.section(section.view)
              }}
              className="nav-item"
              aria-current={active === section.view.kind ? 'page' : undefined}
            >
              <Icon name={section.icon} />
              {t(section.label)}
            </button>
          ))}
          {!serverless && !offline && <SidebarPlaylists onNavigate={() => setSettingsOpen(false)} />}
          </div>
          {!serverless && (
            <button onClick={() => void (offline ? store.reconnect() : store.refresh())} className="nav-item">
              <Icon name="refresh" />
              {offline ? t('Проверить связь') : t('Обновить')}
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} className="nav-item" aria-current={settingsOpen ? 'page' : undefined}>
            <Icon name="settings" />
            {t('Настройки')}
          </button>
        </nav>

        <main ref={main} className="content-layer relative min-w-0 flex-1 overflow-y-auto">
          {/* На Mac заголовка окна нет: за верхнюю полосу содержимого окно тоже перетаскивается. */}
          <div className="titlebar-space sticky top-0 z-10 -mb-7" data-tauri-drag-region />
          <div
            key={settingsOpen ? 'settings' : JSON.stringify(view)}
            className="page-enter mx-auto max-w-[1400px] space-y-4 px-9 pb-8 pt-7"
          >
            {settingsOpen ? <SettingsView /> : <Content view={view} />}
          </div>
        </main>

        {panel === 'queue' && <QueuePanel onClose={() => setPanel(null)} />}
        {panel === 'lyrics' && <LyricsPanel onClose={() => setPanel(null)} />}
      </div>

      {error && (
        <div className="px-3 pb-2">
          <InfoBar severity="error" title={t('Ошибка')} message={error} onClose={() => store.dismissError()} />
        </div>
      )}
      {notice && (
        <div className="flyout pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2 px-4 py-2.5 text-sm">{notice}</div>
      )}
      <UpdateBanner />
      <RemoteQueueBanner />

      <Player panel={panel} onPanel={setPanel} onExpand={() => setNowPlaying(true)} onMini={() => void openMiniPlayer()} />
      {nowPlaying && <NowPlaying onClose={() => setNowPlaying(false)} onMini={() => void openMiniPlayer()} />}
      {dragging && <DropOverlay />}
      <DragGhost />
      <DialogHost />
    </div>
  )
}

/** Подсказка поверх окна, пока над ним держат файлы из проводника. */
function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/40 p-8">
      <div className="flyout flex flex-col items-center gap-3 px-10 py-8 text-center">
        <Icon name="add" size={32} className="text-accent-text" />
        <div className="section-title">{t('Отпусти, чтобы добавить')}</div>
        <div className="text-sm text-secondary">{t('Файлы и папки скопируются в папку музыки на компьютере.')}</div>
      </div>
    </div>
  )
}

/** Очередь с другого устройства: «Продолжить» подхватывает трек и место, где остановились там. */
function RemoteQueueBanner() {
  const { remoteQueue } = useStore()
  if (!remoteQueue) return null
  const song = remoteQueue.songs.find((one) => one.id === remoteQueue.currentId) ?? remoteQueue.songs[0]
  const at = remoteQueue.position
  const time = `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`
  return (
    <div className="px-3 pb-2">
      <InfoBar
        severity="info"
        title={
          remoteQueue.changedBy === 'Nocturne' || remoteQueue.changedBy === 'NocturneAndroid'
            ? t('Играло на телефоне')
            : remoteQueue.changedBy === 'NocturneDesktop'
              ? t('Играло на другом компьютере')
              : t('Играло на другом устройстве')
        }
        message={song ? t('«{title}» — {artist}, с {time}', { title: song.title, artist: song.artist ?? t('Неизвестный исполнитель'), time }) : undefined}
        onClose={() => store.dismissRemoteQueue()}
        action={
          <button onClick={() => void store.acceptRemoteQueue()} className="btn btn-accent">
            {t('Продолжить')}
          </button>
        }
      />
    </div>
  )
}

/** Предложение обновиться. Видно на любом экране: обновление не зависит от того, подключён ли сервер. */
function UpdateBanner() {
  const { update } = useStore()
  if (!update) return null
  return (
    <div className="px-3 pb-2">
      <InfoBar
        severity="info"
        title={t('Доступно обновление')}
        message={t('Вышла версия {version}', { version: update.version })}
        onClose={() => store.dismissUpdate()}
        action={
          <button onClick={() => void store.installUpdate()} className="btn btn-accent">
            {t('Установить')}
          </button>
        }
      />
    </div>
  )
}
