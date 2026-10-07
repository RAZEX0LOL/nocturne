import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album, Artist, Song } from '../core/models'
import { store, useStore, type View } from '../state/store'
import { modKey } from '../native'
import { Cover } from './Cover'
import { Icon, type IconName } from './Icon'
import { t } from '../i18n'

interface Command {
  id: string
  title: string
  subtitle?: string
  icon?: IconName
  cover?: string
  group: string
  run: () => void
}

const SECTIONS: Array<{ view: View; label: string; icon: IconName }> = [
  { view: { kind: 'home' }, label: 'Главная', icon: 'home' },
  { view: { kind: 'search' }, label: 'Поиск', icon: 'search' },
  { view: { kind: 'albums' }, label: 'Альбомы', icon: 'album' },
  { view: { kind: 'artists' }, label: 'Артисты', icon: 'artist' },
  { view: { kind: 'playlists' }, label: 'Плейлисты', icon: 'playlist' },
  { view: { kind: 'favorites' }, label: 'Избранное', icon: 'heart' },
  { view: { kind: 'genres' }, label: 'Жанры', icon: 'genre' },
  { view: { kind: 'radio' }, label: 'Радио', icon: 'radio' },
  { view: { kind: 'local' }, label: 'На компьютере', icon: 'computer' },
  { view: { kind: 'downloads' }, label: 'Загрузки', icon: 'download' },
]

/** Совпадение без учёта регистра по любому слову — «тем св» найдёт «Тема: светлая». */
export function matches(text: string, query: string): boolean {
  const haystack = text.toLocaleLowerCase()
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/**
 * Командная палитра (⌘K / Ctrl+K): любое действие, раздел, плейлист или найденный на сервере
 * трек, альбом, исполнитель — в одну строку, без мыши. Стрелки выбирают, Enter выполняет.
 */
export function CommandPalette({
  onClose,
  onNowPlaying,
  onMini,
  onSettings,
}: {
  onClose: () => void
  onNowPlaying: () => void
  onMini: () => void
  onSettings: () => void
}) {
  const { playlists, queue, playing, client, offline } = useStore()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ songs: Song[]; albums: Album[]; artists: Artist[] }>({ songs: [], albums: [], artists: [] })
  const [selected, setSelected] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  // Медиатеку спрашиваем, когда человек перестал печатать: сервер домашний, нечего его дёргать.
  useEffect(() => {
    if (query.trim().length < 2 || !client || offline) return setFound({ songs: [], albums: [], artists: [] })
    const timer = setTimeout(() => void client.search(query).then(setFound, () => {}), 220)
    return () => clearTimeout(timer)
  }, [query, client, offline])

  const commands = useMemo(() => {
    const go = (view: View) => () => {
      onClose()
      store.section(view)
    }
    const actions: Command[] = [
      queue?.current && { id: 'toggle', title: playing ? t('Пауза') : t('Воспроизвести'), icon: (playing ? 'pause' : 'play') as IconName, group: t('Плеер'), run: () => store.toggle() },
      queue?.current && { id: 'next', title: t('Следующий трек'), icon: 'next' as IconName, group: t('Плеер'), run: () => void store.advance() },
      queue?.current && { id: 'previous', title: t('Предыдущий трек'), icon: 'previous' as IconName, group: t('Плеер'), run: () => void store.previous() },
      queue && { id: 'shuffle', title: queue.shuffle ? t('Выключить перемешивание') : t('Перемешать очередь'), icon: 'shuffle' as IconName, group: t('Плеер'), run: () => store.setShuffle(!queue.shuffle) },
      queue && { id: 'repeat', title: t('Режим повтора'), icon: 'repeat' as IconName, group: t('Плеер'), run: () => store.cycleRepeat() },
      queue?.current && { id: 'now', title: t('Сейчас играет'), icon: 'expand' as IconName, group: t('Плеер'), run: () => (onClose(), onNowPlaying()) },
      { id: 'mini', title: t('Мини-плеер'), icon: 'miniPlayer' as IconName, group: t('Плеер'), run: () => (onClose(), onMini()) },
      ...(
        [
          ['dark', 'Тема: тёмная'],
          ['light', 'Тема: светлая'],
          ['black', 'Тема: OLED-чёрная'],
          ['system', 'Тема: как в системе'],
        ] as const
      ).map(([theme, label]) => ({ id: `theme-${theme}`, title: t(label), icon: 'settings' as IconName, group: t('Оформление'), run: () => store.update({ theme }) })),
      { id: 'settings', title: t('Настройки'), icon: 'settings' as IconName, group: t('Разделы'), run: () => (onClose(), onSettings()) },
      ...SECTIONS.map((section) => ({ id: `go-${section.view.kind}`, title: t(section.label), icon: section.icon, group: t('Разделы'), run: go(section.view) })),
      ...playlists.map((playlist) => ({
        id: `pl-${playlist.id}`,
        title: playlist.name,
        subtitle: t('Плейлист'),
        icon: 'playlist' as IconName,
        group: t('Плейлисты'),
        run: () => (onClose(), store.open({ kind: 'playlist', playlist })),
      })),
    ].filter(Boolean) as Command[]
    const local = query.trim() ? actions.filter((command) => matches(`${command.title} ${command.subtitle ?? ''}`, query)) : actions.slice(0, 12)
    const remote: Command[] = [
      ...found.artists.slice(0, 4).map((artist) => ({
        id: `ar-${artist.id}`,
        title: artist.name,
        subtitle: t('Исполнитель'),
        cover: artist.coverArt,
        group: t('Медиатека'),
        run: () => (onClose(), store.open({ kind: 'artist', artist })),
      })),
      ...found.albums.slice(0, 5).map((album) => ({
        id: `al-${album.id}`,
        title: album.name,
        subtitle: album.artist,
        cover: album.coverArt,
        group: t('Медиатека'),
        run: () => (onClose(), store.open({ kind: 'album', album })),
      })),
      ...found.songs.slice(0, 8).map((song, index, songs) => ({
        id: `s-${song.id}`,
        title: song.title,
        subtitle: song.artist,
        cover: song.coverArt,
        group: t('Треки'),
        run: () => (onClose(), void store.play(songs, index)),
      })),
    ]
    return [...local, ...remote]
  }, [query, found, playlists, queue, playing, onClose, onMini, onNowPlaying, onSettings])

  useEffect(() => setSelected(0), [query, found])
  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // Любая выполненная команда закрывает палитру — и та, что не открывает страницу (тема, пауза).
  const execute = (command?: Command) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((index) => Math.min(index + 1, commands.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(commands[selected])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        className="dialog-pop flyout flex h-fit max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={t('Командная палитра')}
      >
        <div className="flex items-center gap-3 border-b border-stroke px-4">
          <Icon name="search" size={16} className="text-secondary" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('Действие, раздел, трек, альбом…')}
            className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-secondary"
            aria-label={t('Командная палитра')}
          />
          <kbd className="rounded border border-stroke px-1.5 py-0.5 text-xs text-secondary">Esc</kbd>
        </div>
        <div ref={list} className="overflow-y-auto p-1.5" role="listbox">
          {!commands.length && <p className="px-3 py-6 text-center text-sm text-secondary">{t('Ничего не нашлось')}</p>}
          {commands.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : undefined
            lastGroup = command.group
            return (
              <div key={command.id}>
                {header && <div className="px-3 pb-1 pt-2 text-xs font-semibold text-secondary">{header}</div>}
                <button
                  data-index={index}
                  role="option"
                  aria-selected={index === selected}
                  onMouseMove={() => setSelected(index)}
                  onClick={() => execute(command)}
                  className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left ${index === selected ? 'palette-active' : ''}`}
                >
                  {command.cover !== undefined ? (
                    <Cover id={command.cover} size={28} rounded="rounded-[var(--radius-control)]" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center text-secondary">
                      <Icon name={command.icon ?? 'note'} size={14} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{command.title}</span>
                    {command.subtitle && <span className="block truncate text-xs text-secondary">{command.subtitle}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="border-t border-stroke px-4 py-2 text-xs text-secondary">
          {t('↑↓ — выбрать · Enter — выполнить · {mod}K — открыть отовсюду', { mod: modKey })}
        </div>
      </div>
    </div>
  )
}
