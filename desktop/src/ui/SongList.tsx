import type { Song } from '../core/models'
import { isLocalId } from '../core/source'
import { store, useStore } from '../state/store'
import { popupMenu } from '../shell'
import { Icon } from './Icon'
import { t } from '../i18n'

export function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * Список треков: клик запускает воспроизведение с этого места, справа — действия.
 * Без сети нескачанные треки видны, но приглушены: понятно, что есть, и что сейчас недоступно.
 */
export function SongList({
  songs,
  numbered = false,
  showAlbum = false,
  onRemove,
  removeLabel = t('Удалить'),
}: {
  songs: Song[]
  numbered?: boolean
  showAlbum?: boolean
  onRemove?: (song: Song) => void
  removeLabel?: string
}) {
  const { queue, starredIds, playing, downloads, downloading, client, offline } = useStore()
  const currentId = queue?.current?.song.id
  const online = !!client && !offline

  if (!songs.length) return <p className="px-1 text-sm text-secondary">{t('Здесь пока пусто.')}</p>

  const menuFor = (song: Song) => {
    const starred = starredIds.has(song.id)
    const local = isLocalId(song.id)
    const downloaded = !!downloads[song.id]
    const playable = store.isPlayable(song)
    return popupMenu([
      playable && { text: t('Сыграть следующим'), action: () => store.playNext([song]) },
      playable && { text: t('В конец очереди'), action: () => store.append([song]) },
      !local && online && 'separator',
      !local && online && {
        text: starred ? t('Убрать из избранного') : t('В избранное'),
        action: () => void store.toggleStar(song),
      },
      !local && online && !downloaded && {
        text: t('Скачать для прослушивания без сети'),
        enabled: !downloading[song.id],
        action: () => void store.download([song]),
      },
      onRemove && 'separator',
      onRemove && { text: removeLabel, action: () => onRemove(song) },
    ])
  }

  return (
    <ol className="card overflow-hidden p-1">
      {songs.map((song, index) => {
        const current = song.id === currentId
        const starred = starredIds.has(song.id)
        const local = isLocalId(song.id)
        const downloaded = !!downloads[song.id]
        const playable = store.isPlayable(song)
        return (
          <li
            key={`${song.id}-${index}`}
            onContextMenu={(event) => {
              event.preventDefault()
              void menuFor(song)
            }}
            className={`list-row group flex items-center rounded-[var(--radius-control)] ${current ? 'bg-surface' : ''} ${playable ? '' : 'opacity-40'}`}
          >
            <button
              onClick={() => void store.play(songs, index)}
              className="flex min-w-0 flex-1 items-center gap-4 px-3 py-2 text-left"
              title={playable ? undefined : t('Трек не скачан — недоступен без сети')}
            >
              <span className={`grid w-6 place-items-end text-sm tabular-nums ${current ? 'text-accent-text' : 'text-secondary'}`}>
                {current ? <Icon name={playing ? 'volume' : 'note'} size={14} /> : numbered ? song.track ?? index + 1 : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${current ? 'text-accent-text' : ''}`}>{song.title}</span>
                <span className="block truncate text-xs text-secondary">
                  {song.artist ?? t('Неизвестный исполнитель')}
                  {showAlbum && song.album ? ` · ${song.album}` : ''}
                </span>
              </span>
              {downloading[song.id] && <span className="text-xs text-secondary">{t('Скачиваю…')}</span>}
              {downloaded && (
                <span className="text-secondary" title={t('Скачано')}>
                  <Icon name="download" size={12} />
                </span>
              )}
              <span className="w-10 text-right text-xs tabular-nums text-secondary">{formatTime(song.duration)}</span>
            </button>
            <div className="flex items-center gap-0.5 pr-1">
              {!local && online && (
                <button
                  onClick={() => void store.toggleStar(song)}
                  className={`icon-btn h-8 w-8 ${starred ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-pressed={starred}
                  title={starred ? t('Убрать из избранного') : t('В избранное')}
                  aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
                >
                  <Icon name={starred ? 'heartFilled' : 'heart'} size={14} />
                </button>
              )}
              <button
                onClick={() => void menuFor(song)}
                className="icon-btn h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title={t('Ещё')}
                aria-label={t('Ещё')}
              >
                <Icon name="more" size={14} />
              </button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
