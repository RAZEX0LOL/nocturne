import { useEffect, useState } from 'react'
import { coverUrl, useStore } from '../state/store'

/** Обложка: адрес подписывается токеном, поэтому получается асинхронно и кешируется в памяти. */
const cache = new Map<string, string>()

export function Cover({ id, size = 180, rounded = 'rounded-xl' }: { id?: string; size?: number; rounded?: string }) {
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
        className={`flex items-center justify-center bg-surface-strong text-secondary ${rounded}`}
        style={{ width: size, height: size }}
      >
        ♪
      </div>
    )
  }
  return <img src={url} alt="" width={size} height={size} className={`object-cover ${rounded}`} style={{ width: size, height: size }} />
}
