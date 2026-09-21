import { useEffect, useState } from 'react'
import { useStore } from '../state/store'

/** Обложка: адрес подписывается токеном, поэтому получается асинхронно и кешируется в памяти. */
const cache = new Map<string, string>()

export function Cover({ id, size = 180, rounded = 'rounded-xl' }: { id?: string; size?: number; rounded?: string }) {
  const { client } = useStore()
  const [url, setUrl] = useState<string | undefined>(id ? cache.get(id) : undefined)

  useEffect(() => {
    if (!id || !client || cache.has(id)) return
    let cancelled = false
    void client.cover(id, size > 200 ? 600 : 300).then((address) => {
      if (!address || cancelled) return
      cache.set(id, address)
      setUrl(address)
    })
    return () => {
      cancelled = true
    }
  }, [id, client, size])

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
