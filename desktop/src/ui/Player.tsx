import { store, useStore } from '../state/store'
import { Cover } from './Cover'

function time(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/** Нижняя панель: обложка, название, перемотка и управление. */
export function Player({ queueOpen, onToggleQueue }: { queueOpen: boolean; onToggleQueue: () => void }) {
  const { queue, playing, buffering, position, duration, settings, starredIds } = useStore()
  const song = queue?.current?.song
  if (!song) return null
  const starred = starredIds.has(song.id)

  const total = duration || song.duration || 0

  return (
    <footer className="flex items-center gap-4 border-t border-surface-strong bg-surface/95 px-5 py-3 backdrop-blur">
      <Cover id={song.coverArt} size={52} rounded="rounded-lg" />

      <div className="min-w-0 w-56">
        <div className="truncate text-sm font-medium">{song.title}</div>
        <div className="truncate text-xs text-secondary">{song.artist ?? 'Неизвестный исполнитель'}</div>
      </div>
      <button
        onClick={() => void store.toggleStar(song)}
        className={`px-1 text-lg ${starred ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label={starred ? 'Убрать из избранного' : 'В избранное'}
      >
        {starred ? '♥' : '♡'}
      </button>

      <div className="flex items-center gap-3">
        <button
          onClick={() => store.setShuffle(!queue.shuffle)}
          className={`px-2 text-lg ${queue.shuffle ? 'text-accent' : 'text-secondary'}`}
          title="Перемешивать"
          aria-label="Перемешивать"
        >
          ⇄
        </button>
        <button onClick={() => void store.previous()} className="px-2 text-xl" aria-label="Предыдущий трек">
          ⏮
        </button>
        <button
          onClick={() => store.toggle()}
          className="grid h-11 w-11 place-items-center rounded-full bg-accent text-xl text-base"
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          {buffering ? '…' : playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => void store.advance()} className="px-2 text-xl" aria-label="Следующий трек">
          ⏭
        </button>
        <button
          onClick={() => store.cycleRepeat()}
          className={`px-2 text-lg ${queue.repeatMode === 'off' ? 'text-secondary' : 'text-accent'}`}
          title="Повтор"
          aria-label="Режим повтора"
        >
          {queue.repeatMode === 'one' ? '🔂' : '🔁'}
        </button>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="w-10 text-right text-xs tabular-nums text-secondary">{time(position)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={0.5}
          value={Math.min(position, total)}
          onChange={(event) => store.seek(Number(event.target.value))}
          className="h-1 flex-1 accent-accent"
          aria-label="Перемотка"
        />
        <span className="w-10 text-xs tabular-nums text-secondary">{time(total)}</span>
      </div>

      <button
        onClick={onToggleQueue}
        className={`px-2 text-lg ${queueOpen ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label="Очередь"
        title="Очередь"
      >
        ☰
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={settings.volume}
        onChange={(event) => store.update({ volume: Number(event.target.value) })}
        className="h-1 w-24 accent-accent"
        aria-label="Громкость"
      />
    </footer>
  )
}
