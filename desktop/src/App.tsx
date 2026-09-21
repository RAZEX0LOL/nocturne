import { useEffect, useRef, useState } from 'react'
import { EQ_BANDS, EQ_PRESETS } from './audio/engine'
import { store, useStore, type View } from './state/store'
import { Connect } from './ui/Connect'
import { Player } from './ui/Player'
import { QueuePanel } from './ui/QueuePanel'
import {
  DownloadsView,
  LocalView,
  AlbumsView,
  AlbumView,
  ArtistsView,
  ArtistView,
  FavoritesView,
  HomeView,
  PlaylistsView,
  PlaylistView,
  SearchView,
} from './ui/Views'

interface Section {
  view: View
  label: string
  icon: string
}

const HOME: Section = { view: { kind: 'home' }, label: 'Главная', icon: '⌂' }
const SEARCH: Section = { view: { kind: 'search' }, label: 'Поиск', icon: '⌕' }
const LOCAL: Section = { view: { kind: 'local' }, label: 'На компьютере', icon: '▣' }
const DOWNLOADS: Section = { view: { kind: 'downloads' }, label: 'Загрузки', icon: '⤓' }
const SERVER: Section[] = [
  { view: { kind: 'albums' }, label: 'Альбомы', icon: '◫' },
  { view: { kind: 'artists' }, label: 'Артисты', icon: '♫' },
  { view: { kind: 'playlists' }, label: 'Плейлисты', icon: '≡' },
  { view: { kind: 'favorites' }, label: 'Избранное', icon: '♥' },
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
  }
}

export function App() {
  const { status, error, notice, view, history, serverless, offline } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    void store.restore()
  }, [])

  // Новая страница открывается сверху, а не с прокруткой предыдущей.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return
      // Пробел — пауза, Cmd/Ctrl+F — поиск, Alt+← — назад, как в браузере.
      if (event.code === 'Space') {
        event.preventDefault()
        store.toggle()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        store.section({ kind: 'search' })
      } else if (event.altKey && event.key === 'ArrowLeft') {
        store.back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'connecting') {
    return <div className="grid h-full place-items-center text-secondary">Загружаю…</div>
  }
  if (status === 'signed-out') return <Connect />

  const active = sectionOf[view.kind]

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-surface-strong p-3">
          <div className="px-3 pb-4 pt-1 text-sm font-semibold tracking-widest text-secondary">NOCTURNE</div>
          {sectionsFor(serverless, offline).map((section) => (
            <button
              key={section.view.kind}
              onClick={() => store.section(section.view)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                active === section.view.kind ? 'bg-surface-strong text-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              <span className="w-4 text-center">{section.icon}</span>
              {section.label}
            </button>
          ))}
          <div className="flex-1" />
          {!serverless && (
            <button
              onClick={() => void (offline ? store.reconnect() : store.refresh())}
              className="rounded-lg px-3 py-2 text-left text-sm text-secondary hover:text-primary"
            >
              ↻ {offline ? 'Проверить связь' : 'Обновить'}
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} className="rounded-lg px-3 py-2 text-left text-sm text-secondary hover:text-primary">
            ⚙ Настройки
          </button>
        </nav>

        <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-8">
            {history.length > 0 && (
              <button onClick={() => store.back()} className="text-sm text-secondary hover:text-primary">
                ← Назад
              </button>
            )}
            <Content view={view} />
          </div>
        </main>

        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>

      {error && (
        <div className="mx-6 mb-2 flex items-center justify-between rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={() => store.dismissError()} aria-label="Закрыть">×</button>
        </div>
      )}
      {notice && <div className="pointer-events-none fixed left-1/2 top-4 -translate-x-1/2 rounded-lg bg-surface-strong px-4 py-2 text-sm shadow-lg">{notice}</div>}

      <Player queueOpen={queueOpen} onToggleQueue={() => setQueueOpen(!queueOpen)} />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Settings({ onClose }: { onClose: () => void }) {
  const { settings, serverless, client } = useStore()

  return (
    <div className="fixed inset-0 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-lg space-y-6 rounded-2xl bg-surface p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Настройки</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary">
            Готово
          </button>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          Качество потока
          <select
            value={settings.quality}
            onChange={(event) => store.update({ quality: event.target.value as typeof settings.quality })}
            className="rounded-lg bg-surface-strong px-3 py-2"
          >
            <option value="original">Оригинал (без сжатия)</option>
            <option value="mp3High">Высокое · MP3 320</option>
            <option value="mp3Medium">Среднее · MP3 192</option>
            <option value="mp3Low">Экономное · MP3 128</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          Выравнивание громкости
          <select
            value={settings.replayGain}
            onChange={(event) => store.update({ replayGain: event.target.value as typeof settings.replayGain })}
            className="rounded-lg bg-surface-strong px-3 py-2"
          >
            <option value="off">Выключено</option>
            <option value="track">По треку</option>
            <option value="album">По альбому</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          Плавные переходы, сек
          <input
            type="number"
            min={0}
            max={12}
            step={1}
            value={settings.fadeSeconds}
            onChange={(event) => store.update({ fadeSeconds: Number(event.target.value) })}
            className="w-20 rounded-lg bg-surface-strong px-3 py-2"
          />
        </label>

        <section className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.eq.enabled}
              onChange={(event) => store.update({ eq: { ...settings.eq, enabled: event.target.checked } })}
            />
            Эквалайзер
          </label>

          <div className="flex gap-2">
            {Object.keys(EQ_PRESETS).map((preset) => (
              <button
                key={preset}
                onClick={() => store.update({ eq: { enabled: true, gains: [...EQ_PRESETS[preset]!] } })}
                className="rounded-lg bg-surface-strong px-3 py-1.5 text-xs"
              >
                {{ flat: 'Ровно', bass: 'Бас', treble: 'Верх', vocal: 'Вокал', loudness: 'Громко' }[preset] ?? preset}
              </button>
            ))}
          </div>

          <div className="flex items-end justify-between gap-2 pt-2">
            {EQ_BANDS.map((band, index) => (
              <div key={band} className="flex flex-col items-center gap-2">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={settings.eq.gains[index] ?? 0}
                  disabled={!settings.eq.enabled}
                  onChange={(event) => {
                    const gains = [...settings.eq.gains]
                    gains[index] = Number(event.target.value)
                    store.update({ eq: { ...settings.eq, gains } })
                  }}
                  className="h-24 accent-accent"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  aria-label={`${band} Гц`}
                />
                <span className="text-[10px] text-secondary">{band >= 1000 ? `${band / 1000}к` : band}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t border-surface-strong pt-4 text-sm">
          <h3 className="font-medium">Сервер</h3>
          {serverless || !client ? (
            <button onClick={() => { onClose(); store.showConnect() }} className="text-accent">
              Подключить Navidrome
            </button>
          ) : (
            <>
              <p className="text-secondary">{client.credentials.account}</p>
              <button onClick={() => { onClose(); void store.disconnect() }} className="text-red-400">
                Отключить сервер
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
