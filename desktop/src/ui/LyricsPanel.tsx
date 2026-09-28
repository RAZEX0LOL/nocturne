import { useEffect, useRef } from 'react'
import { store, useStore } from '../state/store'
import { t } from '../i18n'

/**
 * Текст песни сбоку. Синхронизированный текст подсвечивает текущую строку и сам едет за ней,
 * а по строке можно перемотать — как в приложении на iPhone.
 */
export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const { queue, lyrics, position } = useStore()
  const song = queue?.current?.song
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void store.loadLyrics()
  }, [song?.id])

  const mine = lyrics?.songID === song?.id ? lyrics : undefined
  const lines = mine?.lines ?? []
  const synced = mine?.synced === true
  const now = position * 1000
  const active = synced ? lines.reduce((found, line, index) => ((line.start ?? Infinity) <= now ? index : found), -1) : -1

  // Активную строку держим в виду: иначе текст надо листать руками.
  useEffect(() => {
    if (active < 0) return
    container.current?.querySelector(`[data-line="${active}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [active])

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-surface-strong bg-surface/60">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="truncate font-semibold">{song?.title ?? t('Текст песни')}</h2>
        <button onClick={onClose} className="shrink-0 text-sm text-secondary hover:text-primary">
          {t('Скрыть')}
        </button>
      </div>
      <div ref={container} className="flex-1 overflow-y-auto px-4 pb-6">
        {!song ? (
          <p className="text-sm text-secondary">{t('Ничего не играет.')}</p>
        ) : lyrics?.songID !== song.id || lyrics.state === 'loading' ? (
          <p className="text-sm text-secondary">{t('Загружаем текст…')}</p>
        ) : lyrics.state === 'failed' ? (
          <div className="space-y-2">
            <p className="text-sm text-secondary">{t('Не удалось загрузить текст.')}</p>
            <button onClick={() => void store.loadLyrics()} className="text-sm text-accent">
              {t('Попробовать снова')}
            </button>
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-secondary">{t('Navidrome не нашёл текст для этого трека.')}</p>
        ) : (
          <div className={synced ? 'space-y-4' : 'space-y-1'}>
            {lines.map((line, index) => (
              <p
                key={index}
                data-line={index}
                onClick={() => synced && line.start !== undefined && store.seek(line.start / 1000)}
                className={`${synced ? 'cursor-pointer text-base font-medium' : 'text-sm'} ${
                  !synced || index === active ? 'text-primary' : 'text-secondary/60'
                }`}
              >
                {line.value || ' '}
              </p>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
