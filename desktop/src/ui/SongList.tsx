import type { Song } from '../core/models'
import { store, useStore } from '../state/store'

export function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * Список треков: клик запускает воспроизведение с этого места, справа — избранное и
 * действия с очередью. `numbered` — номер в альбоме, иначе порядковый.
 */
export function SongList({ songs, numbered = false, showAlbum = false }: { songs: Song[]; numbered?: boolean; showAlbum?: boolean }) {
  const { queue, starredIds, playing } = useStore()
  const currentId = queue?.current?.song.id

  if (!songs.length) return <p className="px-1 text-sm text-secondary">Здесь пока пусто.</p>

  return (
    <ol className="divide-y divide-surface-strong overflow-hidden rounded-xl bg-surface">
      {songs.map((song, index) => {
        const current = song.id === currentId
        const starred = starredIds.has(song.id)
        return (
          <li key={`${song.id}-${index}`} className="group flex items-center hover:bg-surface-strong">
            <button onClick={() => void store.play(songs, index)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-2.5 text-left">
              <span className={`w-6 text-right text-sm tabular-nums ${current ? 'text-accent' : 'text-secondary'}`}>
                {current ? (playing ? '♪' : '♫') : numbered ? song.track ?? index + 1 : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${current ? 'text-accent' : ''}`}>{song.title}</span>
                <span className="block truncate text-xs text-secondary">
                  {song.artist ?? 'Неизвестный исполнитель'}
                  {showAlbum && song.album ? ` · ${song.album}` : ''}
                </span>
              </span>
              <span className="text-xs tabular-nums text-secondary">{formatTime(song.duration)}</span>
            </button>
            <div className="flex items-center gap-1 pr-3">
              <button
                onClick={() => store.playNext([song])}
                className="rounded px-2 py-1 text-xs text-secondary opacity-0 hover:text-primary group-hover:opacity-100"
                title="Сыграть следующим"
              >
                ↳
              </button>
              <button
                onClick={() => store.append([song])}
                className="rounded px-2 py-1 text-xs text-secondary opacity-0 hover:text-primary group-hover:opacity-100"
                title="В конец очереди"
              >
                ＋
              </button>
              <button
                onClick={() => void store.toggleStar(song)}
                className={`rounded px-2 py-1 ${starred ? 'text-accent' : 'text-secondary opacity-0 group-hover:opacity-100'}`}
                title={starred ? 'Убрать из избранного' : 'В избранное'}
                aria-label={starred ? 'Убрать из избранного' : 'В избранное'}
              >
                {starred ? '♥' : '♡'}
              </button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
