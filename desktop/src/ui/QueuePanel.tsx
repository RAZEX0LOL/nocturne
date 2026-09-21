import { store, useStore } from '../state/store'
import { Cover } from './Cover'
import { formatTime } from './SongList'

/** Очередь сбоку: что играет и что дальше; клик переключает, крестик убирает из очереди. */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue } = useStore()
  const current = queue?.current
  const upcoming = queue?.upcoming ?? []
  const base = (queue?.position ?? 0) + 1

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-surface-strong bg-surface/60">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold">Очередь</h2>
        <button onClick={onClose} className="text-sm text-secondary hover:text-primary">
          Скрыть
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {current && (
          <section className="space-y-2">
            <h3 className="px-1 text-xs uppercase tracking-wider text-secondary">Сейчас играет</h3>
            <div className="flex items-center gap-3 rounded-lg bg-surface-strong p-2">
              <Cover id={current.song.coverArt} size={40} rounded="rounded-md" />
              <div className="min-w-0">
                <div className="truncate text-sm text-accent">{current.song.title}</div>
                <div className="truncate text-xs text-secondary">{current.song.artist}</div>
              </div>
            </div>
          </section>
        )}
        <section className="space-y-1">
          <h3 className="px-1 text-xs uppercase tracking-wider text-secondary">{upcoming.length ? 'Дальше' : 'Дальше ничего нет'}</h3>
          {upcoming.map((entry, offset) => (
            <div key={entry.id} className="group flex items-center rounded-lg hover:bg-surface-strong">
              <button onClick={() => void store.select(base + offset)} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left">
                <Cover id={entry.song.coverArt} size={36} rounded="rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{entry.song.title}</span>
                  <span className="block truncate text-xs text-secondary">{entry.song.artist}</span>
                </span>
                <span className="text-xs tabular-nums text-secondary">{formatTime(entry.song.duration)}</span>
              </button>
              <button
                onClick={() => store.removeFromQueue(entry.id)}
                className="px-2 text-secondary opacity-0 hover:text-primary group-hover:opacity-100"
                aria-label="Убрать из очереди"
              >
                ×
              </button>
            </div>
          ))}
        </section>
      </div>
    </aside>
  )
}
