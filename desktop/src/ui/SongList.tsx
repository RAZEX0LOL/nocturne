import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../core/models'
import { isLocalId } from '../core/source'
import { store, useStore } from '../state/store'
import { popupMenu, type MenuEntry } from '../shell'
import { askText } from './Dialogs'
import { beginDrag, registerDrop, useDrag, type DragPayload } from './drag'
import { Icon } from './Icon'
import { t } from '../i18n'

export function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

type SortKey = 'title' | 'album' | 'rating' | 'duration'
type Sort = { key: SortKey; descending: boolean } | undefined

/** Звёзды оценки прямо в строке: клик по той же звезде снимает оценку. */
function Rating({ song }: { song: Song }) {
  useStore()
  const rating = store.ratingOf(song)
  return (
    <span className="flex items-center" onDoubleClick={(event) => event.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          onClick={(event) => {
            event.stopPropagation()
            void store.setRating([song], rating === value ? 0 : value)
          }}
          className={`grid h-6 w-4 place-items-center ${value <= rating ? 'text-accent-text' : 'text-secondary/40 opacity-0 group-hover:opacity-100'}`}
          aria-label={t('Оценка {n}', { n: value })}
          title={t('Оценка {n}', { n: value })}
        >
          <Icon name={value <= rating ? 'starFilled' : 'star'} size={11} />
        </button>
      ))}
    </span>
  )
}

/** Меню для выделенных треков: всё, что можно с ними сделать, в одном месте — как в Feishin. */
export function songMenu(songs: Song[], options: { onRemove?: () => void; removeLabel?: string; playAll?: () => void } = {}): MenuEntry[] {
  const state = store.snapshot()
  const online = !!state.client && !state.offline
  const playable = songs.filter((song) => store.isPlayable(song))
  const server = songs.filter((song) => !isLocalId(song.id))
  const single = songs.length === 1 ? songs[0] : undefined
  const many = songs.length > 1
  const allStarred = server.length > 0 && server.every((song) => state.starredIds.has(song.id))
  const rating = single ? store.ratingOf(single) : 0
  return [
    playable.length > 0 && {
      text: many ? t('Играть выбранные ({n})', { n: playable.length }) : t('Играть'),
      action: () => (options.playAll ? options.playAll() : void store.play(playable, 0)),
    },
    playable.length > 0 && { text: t('Сыграть следующим'), action: () => store.playNext(playable) },
    playable.length > 0 && { text: t('В конец очереди'), action: () => store.append(playable) },
    'separator',
    online &&
      server.length > 0 && {
        text: t('Добавить в плейлист'),
        items: [
          {
            text: t('Новый плейлист…'),
            action: () =>
              void askText(t('Новый плейлист'), { label: t('Название'), confirm: t('Создать') }).then(
                (name) => name && void store.createPlaylist(name, server),
              ),
          },
          state.playlists.length > 0 && 'separator',
          ...state.playlists.map((playlist) => ({ text: playlist.name, action: () => void store.addToPlaylist(playlist, server) })),
        ],
      },
    online && single && !isLocalId(single.id) && { text: t('Микс по треку'), action: () => void store.playMix(single) },
    !!single?.albumId && { text: t('Перейти к альбому'), action: () => store.openAlbumOf(single) },
    !!single?.artistId && { text: t('Перейти к исполнителю'), action: () => store.openArtistOf(single) },
    online && single && !isLocalId(single.id) && { text: t('Поделиться ссылкой'), action: () => void store.share(single.id, single.title) },
    'separator',
    online &&
      server.length > 0 && {
        text: allStarred ? t('Убрать из избранного') : t('В избранное'),
        action: () => {
          for (const song of server) if (state.starredIds.has(song.id) === allStarred) void store.toggleStar(song)
        },
      },
    online &&
      server.length > 0 && {
        text: t('Оценка'),
        items: [
          ...[5, 4, 3, 2, 1].map((value) => ({
            text: `${'★'.repeat(value)}${'☆'.repeat(5 - value)}${rating === value ? '  ✓' : ''}`,
            action: () => void store.setRating(server, value),
          })),
          'separator' as const,
          { text: t('Без оценки'), action: () => void store.setRating(server, 0) },
        ],
      },
    online &&
      server.some((song) => !state.downloads[song.id]) && {
        text: t('Скачать для прослушивания без сети'),
        action: () => void store.download(server),
      },
    options.onRemove && 'separator',
    options.onRemove && { text: options.removeLabel ?? t('Удалить'), action: options.onRemove },
  ]
}

/**
 * Таблица треков, как в нативных плеерах: клик выделяет, двойной клик играет, Shift и Ctrl (⌘ на Mac)
 * выделяют несколько, правый клик — меню для всего выделенного, строки перетаскиваются в плейлисты,
 * в очередь и — в плейлисте — меняют порядок. Заголовки колонок сортируют список.
 */
export function SongList({
  songs,
  numbered = false,
  showAlbum = false,
  onRemove,
  removeLabel = t('Удалить'),
  listKey,
  onReorder,
  onDropSongs,
}: {
  songs: Song[]
  numbered?: boolean
  showAlbum?: boolean
  /** Удаление выделенного: треки и их позиции в исходном списке. */
  onRemove?: (songs: Song[], indexes: number[]) => void
  removeLabel?: string
  /** Имя списка для перетаскивания внутри него: без него строки можно только унести. */
  listKey?: string
  onReorder?: (from: number[], to: number) => void
  onDropSongs?: (songs: Song[], insertAt?: number) => void
}) {
  const { queue, starredIds, playing, downloads, downloading, client, offline } = useStore()
  const currentId = queue?.current?.song.id
  const online = !!client && !offline
  const [sort, setSort] = useState<Sort>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const anchor = useRef<number | undefined>(undefined)
  const drag = useDrag()

  // Строки в показанном порядке, с позицией в исходном списке: сортировка не меняет сам список.
  // Колонка номера по самому длинному номеру: «145» не влезал в 24 px и съезжал влево от кнопки ▶.
  const numberDigits = String(numbered ? Math.max(0, ...songs.map((song, index) => song.track ?? index + 1)) : songs.length).length
  const numberWidth = `${Math.max(2, numberDigits) + 1}ch`

  const rows = useMemo(() => {
    const indexed = songs.map((song, index) => ({ song, index }))
    if (!sort) return indexed
    const value = (song: Song): string | number => {
      switch (sort.key) {
        case 'title': return song.title.toLocaleLowerCase()
        case 'album': return (song.album ?? '').toLocaleLowerCase()
        case 'rating': return store.ratingOf(song)
        case 'duration': return song.duration ?? 0
      }
    }
    const sorted = [...indexed].sort((a, b) => {
      const left = value(a.song)
      const right = value(b.song)
      const order = typeof left === 'number' ? left - (right as number) : left.localeCompare(right as string, 'ru')
      return order || a.index - b.index
    })
    return sort.descending ? sorted.reverse() : sorted
  }, [songs, sort])

  // Список сменился (другой альбом, плейлист обновился) — старое выделение ни к чему.
  useEffect(() => {
    setSelected(new Set())
    anchor.current = undefined
  }, [songs])

  const reorderable = !!onReorder && !sort
  useEffect(() => {
    if (!listKey) return
    return registerDrop(listKey, (payload: DragPayload, insertAt?: number) => {
      if (payload.source?.list === listKey) {
        if (reorderable && insertAt !== undefined) onReorder?.(payload.source.indexes, insertAt)
        return
      }
      onDropSongs?.(payload.songs, insertAt)
    })
  }, [listKey, reorderable, onReorder, onDropSongs])

  if (!songs.length) return <p className="px-1 text-secondary">{t('Здесь пока пусто.')}</p>

  const selectedRows = rows.filter((_, position) => selected.has(position))
  const selectedSongs = selectedRows.map((row) => row.song)
  const playFrom = (position: number) => void store.play(rows.map((row) => row.song), position)

  const select = (position: number, event: React.MouseEvent | React.KeyboardEvent) => {
    const toggle = event.metaKey || event.ctrlKey
    if (event.shiftKey && anchor.current !== undefined) {
      const [from, to] = [Math.min(anchor.current, position), Math.max(anchor.current, position)]
      const range = new Set(toggle ? selected : [])
      for (let index = from; index <= to; index++) range.add(index)
      setSelected(range)
      return
    }
    anchor.current = position
    if (toggle) {
      const next = new Set(selected)
      if (next.has(position)) next.delete(position)
      else next.add(position)
      setSelected(next)
    } else setSelected(new Set([position]))
  }

  const remove = onRemove && (() => onRemove(selectedSongs, selectedRows.map((row) => row.index)))

  const openMenu = (position: number) => {
    const chosen = selected.has(position) ? selectedRows : [rows[position]!]
    if (!selected.has(position)) {
      setSelected(new Set([position]))
      anchor.current = position
    }
    const chosenSongs = chosen.map((row) => row.song)
    void popupMenu(
      songMenu(chosenSongs, {
        removeLabel,
        onRemove: onRemove && (() => onRemove(chosenSongs, chosen.map((row) => row.index))),
        playAll: chosen.length === 1 ? () => playFrom(position) : undefined,
      }),
    )
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      event.stopPropagation()
      setSelected(new Set(rows.map((_, position) => position)))
    } else if (event.key === 'Enter' && selected.size) {
      event.preventDefault()
      if (selected.size === 1) playFrom([...selected][0]!)
      else void store.play(selectedSongs, 0)
    } else if ((event.key === 'Delete' || (event.key === 'Backspace' && mod)) && selected.size && remove) {
      event.preventDefault()
      event.stopPropagation()
      remove()
    } else if (event.key === 'Escape' && selected.size) {
      event.stopPropagation()
      setSelected(new Set())
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !mod) {
      event.preventDefault()
      const last = anchor.current ?? -1
      const next = Math.min(Math.max(last + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
      if (event.shiftKey && anchor.current !== undefined) {
        setSelected(new Set([...selected, next]))
        anchor.current = next
      } else {
        anchor.current = next
        setSelected(new Set([next]))
      }
      document.querySelector(`[data-song-row="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  const header = (key: SortKey | undefined, label: string, className: string) => (
    <button
      disabled={!key}
      onClick={() =>
        key &&
        setSort(sort?.key !== key ? { key, descending: false } : sort.descending ? undefined : { key, descending: true })
      }
      className={`flex items-center gap-1 truncate text-left text-xs font-medium text-secondary enabled:hover:text-primary ${className}`}
    >
      {label}
      {key && sort?.key === key && <Icon name="chevronDown" size={10} className={sort.descending ? '' : 'rotate-180'} />}
    </button>
  )

  const dropHere = (position: number) => drag?.target === listKey && reorderable && drag?.insertAt === position

  return (
    <div className="song-table card overflow-hidden p-1" tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-multiselectable>
      <div className="flex items-center gap-4 border-b border-stroke px-3 pb-1.5 pt-1">
        <span className="shrink-0 text-center text-xs text-secondary" style={{ width: numberWidth }}>#</span>
        {header('title', t('Название'), 'min-w-0 flex-1')}
        {showAlbum && header('album', t('Альбом'), 'hidden w-[24%] min-w-0 md:flex')}
        {online && header('rating', t('Оценка'), 'w-[88px]')}
        {header('duration', t('Время'), 'w-12 justify-end')}
        <span className="w-[68px]" />
      </div>
      <ol>
        {rows.map(({ song, index }, position) => {
          const current = song.id === currentId
          const starred = starredIds.has(song.id)
          const local = isLocalId(song.id)
          const downloaded = !!downloads[song.id]
          const playable = store.isPlayable(song)
          const isSelected = selected.has(position)
          return (
            <li
              key={`${song.id}-${index}`}
              data-song-row={position}
              {...(listKey ? { 'data-drop-row': position, 'data-drop-list': listKey } : {})}
              aria-selected={isSelected}
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button')) return
                beginDrag(event, () => {
                  const chosen = isSelected ? selectedRows : [rows[position]!]
                  return {
                    songs: chosen.map((row) => row.song),
                    source: listKey ? { list: listKey, indexes: chosen.map((row) => row.index) } : undefined,
                  }
                })
              }}
              onClick={(event) => select(position, event)}
              onDoubleClick={() => playable && playFrom(position)}
              onContextMenu={(event) => {
                event.preventDefault()
                openMenu(position)
              }}
              className={`song-row list-row group relative flex items-center gap-4 rounded-[var(--radius-control)] px-3 py-1.5 ${
                isSelected ? 'is-selected' : current ? 'bg-surface' : ''
              } ${playable ? '' : 'opacity-40'} ${dropHere(position) ? 'drop-before' : ''} ${
                dropHere(position + 1) && position === rows.length - 1 ? 'drop-after' : ''
              }`}
              title={playable ? undefined : t('Трек не скачан — недоступен без сети')}
            >
              <span className="relative grid shrink-0 place-items-center text-sm tabular-nums" style={{ width: numberWidth }}>
                <span className={`group-hover:invisible ${current ? 'text-accent-text' : 'text-secondary'}`}>
                  {current ? <Icon name={playing ? 'volume' : 'note'} size={14} /> : numbered ? song.track ?? index + 1 : position + 1}
                </span>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    if (playable) playFrom(position)
                  }}
                  className="invisible absolute inset-0 grid place-items-center text-primary group-hover:visible"
                  aria-label={t('Играть «{title}»', { title: song.title })}
                  tabIndex={-1}
                >
                  <Icon name="play" size={12} />
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${current ? 'text-accent-text' : ''}`}>{song.title}</span>
                <span className="block truncate text-xs text-secondary">
                  {song.artistId ? (
                    <button
                      className="hover:text-primary hover:underline"
                      onClick={(event) => {
                        event.stopPropagation()
                        store.openArtistOf(song)
                      }}
                      tabIndex={-1}
                    >
                      {song.artist}
                    </button>
                  ) : (
                    (song.artist ?? t('Неизвестный исполнитель'))
                  )}
                  {showAlbum && song.album ? <span className="md:hidden">{` · ${song.album}`}</span> : ''}
                </span>
              </span>
              {showAlbum && (
                <span className="hidden w-[24%] min-w-0 truncate text-sm text-secondary md:block">
                  {song.albumId ? (
                    <button
                      className="truncate hover:text-primary hover:underline"
                      onClick={(event) => {
                        event.stopPropagation()
                        store.openAlbumOf(song)
                      }}
                      tabIndex={-1}
                    >
                      {song.album}
                    </button>
                  ) : (
                    song.album
                  )}
                </span>
              )}
              {online && <span className="w-[88px]">{!local && <Rating song={song} />}</span>}
              <span className="flex w-12 items-center justify-end gap-1.5 text-xs tabular-nums text-secondary">
                {downloading[song.id] && <span className="animate-pulse">…</span>}
                {downloaded && (
                  <span title={t('Скачано')}>
                    <Icon name="download" size={11} />
                  </span>
                )}
                {formatTime(song.duration)}
              </span>
              <span className="flex w-[68px] items-center justify-end gap-0.5">
                {!local && online && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void store.toggleStar(song)
                    }}
                    className={`icon-btn h-8 w-8 ${starred ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                    aria-pressed={starred}
                    title={starred ? t('Убрать из избранного') : t('В избранное')}
                    aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
                  >
                    <Icon name={starred ? 'heartFilled' : 'heart'} size={14} />
                  </button>
                )}
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    openMenu(position)
                  }}
                  className="icon-btn h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title={t('Ещё')}
                  aria-label={t('Ещё')}
                >
                  <Icon name="more" size={14} />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      {selected.size > 1 && (
        <div className="px-3 pb-1 pt-2 text-xs text-secondary">
          {t('Выбрано: {n}', { n: selected.size })} · {formatTime(selectedSongs.reduce((sum, song) => sum + (song.duration ?? 0), 0))}
        </div>
      )}
    </div>
  )
}
