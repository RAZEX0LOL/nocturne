import { useEffect, useState } from 'react'
import { coverUrl, useStore } from '../state/store'
import { Icon } from './Icon'

/** Обложка: адрес подписывается токеном, поэтому получается асинхронно и кешируется в памяти. */
const cache = new Map<string, string>()

export function Cover({
  id,
  size = 180,
  rounded = 'rounded-[var(--radius-card)]',
  fluid = false,
}: {
  id?: string
  size?: number
  rounded?: string
  /** Во всю ширину плитки, квадратом: в сетке альбомов ширина колонки меняется вместе с окном. */
  fluid?: boolean
}) {
  const { client, offline } = useStore()
  const [url, setUrl] = useState<string | undefined>(id ? cache.get(id) : undefined)

  useEffect(() => {
    if (!id || cache.has(id)) return
    let cancelled = false
    // Свои обложки лежат на диске и доступны всегда, серверные — только при связи.
    void coverUrl(id, offline ? undefined : client, size > 200 ? 600 : 300).then((address) => {
      if (!address || cancelled) return
      cache.set(id, address)
      setUrl(address)
    })
    return () => {
      cancelled = true
    }
  }, [id, client, offline, size])

  if (!url) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-surface-strong text-secondary ${rounded} ${fluid ? 'aspect-square w-full' : ''}`}
        style={fluid ? undefined : { width: size, height: size }}
      >
        <Icon name="note" size={Math.max(14, Math.round(size / 4))} />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      width={size}
      height={size}
      className={`shrink-0 object-cover ${rounded} ${fluid ? 'aspect-square w-full' : ''}`}
      style={fluid ? undefined : { width: size, height: size }}
    />
  )
}
