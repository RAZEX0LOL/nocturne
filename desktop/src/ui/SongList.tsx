import type { Song } from '../core/models'
import { isLocalId } from '../core/source'
import { store, useStore } from '../state/store'
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

  return (
    <ol className="divide-y divide-surface-strong overflow-hidden rounded-xl bg-surface">
      {songs.map((song, index) => {
        const current = song.id === currentId
        const starred = starredIds.has(song.id)
        const local = isLocalId(song.id)
        const downloaded = !!downloads[song.id]
        const playable = store.isPlayable(song)
        const rowAction = 'rounded px-2 py-1 text-xs text-secondary opacity-0 hover:text-primary group-hover:opacity-100'
        return (
          <li key={`${song.id}-${index}`} className={`group flex items-center hover:bg-surface-strong ${playable ? '' : 'opacity-40'}`}>
            <button
              onClick={() => void store.play(songs, index)}
              className="flex min-w-0 flex-1 items-center gap-4 px-4 py-2.5 text-left"
              title={playable ? undefined : t('Трек не скачан — недоступен без сети')}
            >
              <span className={`w-6 text-right text-sm tabular-nums ${current ? 'text-accent' : 'text-secondary'}`}>
                {current ? (playing ? '♪' : '♫') : numbered ? song.track ?? index + 1 : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${current ? 'text-accent' : ''}`}>{song.title}</span>
                <span className="block truncate text-xs text-secondary">
                  {song.artist ?? t('Неизвестный исполнитель')}
                  {showAlbum && song.album ? ` · ${song.album}` : ''}
                </span>
              </span>
              {downloaded && <span className="text-xs text-secondary" title={t('Скачано')}>⤓</span>}
              <span className="w-10 text-right text-xs tabular-nums text-secondary">{formatTime(song.duration)}</span>
            </button>
            <div className="flex items-center gap-1 pr-3">
              {playable && (
                <>
                  <button onClick={() => store.playNext([song])} className={rowAction} title={t('Сыграть следующим')}>
                    ↳
                  </button>
                  <button onClick={() => store.append([song])} className={rowAction} title={t('В конец очереди')}>
                    ＋
                  </button>
                </>
              )}
              {!local && online && !downloaded && (
                <button
                  onClick={() => void store.download([song])}
                  className={downloading[song.id] ? 'rounded px-2 py-1 text-xs text-accent' : rowAction}
                  title={t('Скачать для прослушивания без сети')}
                  disabled={!!downloading[song.id]}
                >
                  {downloading[song.id] ? '…' : '↓'}
                </button>
              )}
              {onRemove && (
                <button onClick={() => onRemove(song)} className={rowAction} title={removeLabel} aria-label={removeLabel}>
                  ✕
                </button>
              )}
              {!local && online && (
                <button
                  onClick={() => void store.toggleStar(song)}
                  className={`rounded px-2 py-1 ${starred ? 'text-accent' : 'text-secondary opacity-0 group-hover:opacity-100'}`}
                  title={starred ? t('Убрать из избранного') : t('В избранное')}
                  aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
                >
                  {starred ? '♥' : '♡'}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
