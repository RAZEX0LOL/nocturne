import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Album } from '../core/models'
import { store } from '../state/store'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { t } from '../i18n'

/**
 * Карточка альбома: клик открывает альбом, круглая кнопка поверх обложки сразу его играет,
 * не открывая страницу — как в Feishin и Apple Music.
 */
export function AlbumCard({ album, width }: { album: Album; width?: number }) {
  return (
    <div className="group relative min-w-0 shrink-0 snap-start" style={width ? { width } : undefined}>
      <button
        onClick={() => store.open({ kind: 'album', album })}
        className="list-row block w-full min-w-0 space-y-2 rounded-[var(--radius-card)] p-2 text-left"
      >
        <span className="relative block">
          <Cover id={album.coverArt} size={200} fluid />
          <span className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] bg-black/0 transition-colors group-hover:bg-black/20" />
        </span>
        <span className="block truncate font-medium">{album.name}</span>
        <span className="block truncate text-xs text-secondary">
          {album.artist ?? t('Неизвестный исполнитель')}
          {album.year ? ` · ${album.year}` : ''}
        </span>
      </button>
      <button
        onClick={() => void store.playAlbum(album)}
        className="btn-accent absolute bottom-[4.25rem] right-4 grid h-11 w-11 translate-y-1 place-items-center rounded-full opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:opacity-100"
        title={t('Слушать')}
        aria-label={t('Слушать альбом {name}', { name: album.name })}
      >
        <Icon name="play" size={16} />
      </button>
    </div>
  )
}

/** Заготовка карточки, пока альбомы идут с сервера: страница не прыгает, когда они придут. */
export function AlbumCardSkeleton({ width }: { width?: number }) {
  return (
    <div className="shrink-0 space-y-2 p-2" style={width ? { width } : undefined}>
      <div className="skeleton aspect-square w-full rounded-[var(--radius-card)]" />
      <div className="skeleton h-3.5 w-3/4 rounded" />
      <div className="skeleton h-3 w-1/2 rounded" />
    </div>
  )
}

export function SongListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card space-y-1 p-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-3 py-2.5">
          <div className="skeleton h-3.5 w-6 rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 rounded" style={{ width: `${40 + ((index * 37) % 35)}%` }} />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
          <div className="skeleton h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  )
}

/**
 * Полка-карусель: заголовок, прокрутка вбок стрелками (как в Apple Music) или колесом с Shift.
 * Стрелки видны, только когда есть куда листать.
 */
export function Shelf({
  title,
  albums,
  loading = false,
  action,
}: {
  title: string
  albums: Album[]
  loading?: boolean
  action?: ReactNode
}) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = () => {
    const element = track.current
    if (!element) return
    setEdges({
      start: element.scrollLeft <= 4,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
    })
  }

  useEffect(() => {
    measure()
    const element = track.current
    if (!element) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [albums.length, loading])

  const scroll = (direction: 1 | -1) => {
    const element = track.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: 'smooth' })
  }

  if (!loading && !albums.length) return null
  // Ширина карточки — из настроек «Оформление»: размер обложки плюс поля.
  const width = store.snapshot().settings.cardSize + 8

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="section-title flex-1">{title}</h2>
        {action}
        <button onClick={() => scroll(-1)} disabled={edges.start} className="icon-btn h-8 w-8" aria-label={t('Назад')} title={t('Назад')}>
          <Icon name="chevronLeft" size={14} />
        </button>
        <button onClick={() => scroll(1)} disabled={edges.end} className="icon-btn h-8 w-8" aria-label={t('Вперёд')} title={t('Вперёд')}>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div ref={track} onScroll={measure} className="shelf -mx-2 flex snap-x snap-mandatory overflow-x-auto">
        {loading
          ? Array.from({ length: 8 }, (_, index) => <AlbumCardSkeleton key={index} width={width} />)
          : albums.map((album, index) => <AlbumCard key={`${album.id}-${index}`} album={album} width={width} />)}
      </div>
    </section>
  )
}
