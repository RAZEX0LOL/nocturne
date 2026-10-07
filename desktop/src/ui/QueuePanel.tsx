import { store, useStore } from '../state/store'
import { Cover } from './Cover'
import { formatTime } from './SongList'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Очередь сбоку: что играет и что дальше; клик переключает, крестик убирает из очереди. */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue } = useStore()
  const current = queue?.current

  return (
    <aside className="content-layer flex w-80 shrink-0 flex-col border-l border-stroke">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-base font-semibold">{t('Очередь')}</h2>
        <button onClick={onClose} className="icon-btn shrink-0" title={t('Скрыть')} aria-label={t('Скрыть')}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {current && (
          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold text-secondary">{t('Сейчас играет')}</h3>
            <div className="card flex items-center gap-3 p-2">
              <Cover id={current.song.coverArt} size={40} rounded="rounded-[var(--radius-control)]" />
              <div className="min-w-0">
                <div className="truncate text-sm text-accent-text">{current.song.title}</div>
                <div className="truncate text-xs text-secondary">{current.song.artist}</div>
              </div>
            </div>
          </section>
        )}
        <UpcomingList />
      </div>
    </aside>
  )
}

/** Что играет дальше; клик переключает, крестик убирает из очереди. */
export function UpcomingList({ onDark = false }: { onDark?: boolean }) {
  const { queue } = useStore()
  const upcoming = queue?.upcoming ?? []
  const base = (queue?.position ?? 0) + 1
  const muted = onDark ? 'text-white/60' : 'text-secondary'
  return (
    <section className="space-y-1">
      <h3 className={`px-1 text-xs font-semibold ${muted}`}>{upcoming.length ? t('Дальше') : t('Дальше ничего нет')}</h3>
      {upcoming.map((entry, offset) => (
        <div key={entry.id} className="list-row group flex items-center rounded-[var(--radius-control)]">
          <button onClick={() => void store.select(base + offset)} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left">
            <Cover id={entry.song.coverArt} size={36} rounded="rounded-[var(--radius-control)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{entry.song.title}</span>
              <span className={`block truncate text-xs ${muted}`}>{entry.song.artist}</span>
            </span>
            <span className={`text-xs tabular-nums ${muted}`}>{formatTime(entry.song.duration)}</span>
          </button>
          <button
            onClick={() => store.removeFromQueue(entry.id)}
            className="icon-btn h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t('Убрать из очереди')}
            title={t('Убрать из очереди')}
          >
            <Icon name="close" size={10} />
          </button>
        </div>
      ))}
    </section>
  )
}
