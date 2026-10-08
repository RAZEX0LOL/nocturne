import { useEffect, useRef } from 'react'
import { store, useStore } from '../state/store'
import { Icon } from './Icon'
import { t } from '../i18n'

/**
 * Текст песни. Синхронизированный текст подсвечивает текущую строку и сам едет за ней,
 * а по строке можно перемотать — как в приложении на iPhone. Крупный вариант — для
 * полноэкранного плеера: строки как в «Музыке» Apple, прошедшие и будущие приглушены.
 */
export function Lyrics({ large = false }: { large?: boolean }) {
  const { queue, lyrics, position, settings } = useStore()
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

  const hint = large ? 'text-lg text-white/60' : 'text-sm text-secondary'
  if (!song) return <p className={hint}>{t('Ничего не играет.')}</p>
  if (lyrics?.songID !== song.id || lyrics.state === 'loading') return <p className={hint}>{t('Загружаем текст…')}</p>
  if (lyrics.state === 'failed')
    return (
      <div className="space-y-2">
        <p className={hint}>{t('Не удалось загрузить текст.')}</p>
        <button onClick={() => void store.loadLyrics()} className="btn">
          {t('Попробовать снова')}
        </button>
      </div>
    )
  // LRCLIB выключен — предлагаем включить прямо здесь, а не прятать это в настройках.
  const offerLrclib = !settings.lrclib && (
    <div className={large ? 'flex flex-col items-center gap-3' : 'space-y-2'}>
      <p className={large ? 'max-w-sm text-sm text-white/50' : 'text-xs text-secondary'}>
        {t('Navidrome не нашёл текст. Можно поискать в открытой базе lrclib.net — туда уйдут название и исполнитель.')}
      </p>
      <button
        className="btn"
        onClick={() => {
          store.update({ lrclib: true })
          void store.loadLyrics(true)
        }}
      >
        {t('Искать в LRCLIB')}
      </button>
    </div>
  )
  if (!lines.length)
    return large ? (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-[20vh] text-center text-white/60">
        <Icon name="lyrics" size={36} />
        <p className="text-lg">{t('Для этого трека нет текста')}</p>
        {offerLrclib}
      </div>
    ) : (
      <div className="space-y-3">
        <p className={hint}>{t('Navidrome не нашёл текст для этого трека.')}</p>
        {offerLrclib}
      </div>
    )

  const lineClass = (index: number) => {
    if (large) {
      const base = synced ? 'cursor-pointer text-[1.75em] leading-snug font-bold tracking-tight transition-all duration-300' : 'text-[1.25em] font-semibold'
      if (!synced || index === active) return `${base} text-white`
      // Прошедшие строки только тусклее: blur в WebKit под маской оставляет полоски по краю слоя.
      return `${base} ${index < active ? 'text-white/25' : 'text-white/35'} hover:text-white/60`
    }
    const base = synced ? 'cursor-pointer text-[1em] font-medium' : 'text-[0.875em]'
    return `${base} ${!synced || index === active ? 'text-primary' : 'text-secondary/50'}`
  }

  return (
    // Размер — в em от корня блока: настройка «размер текста» меняет одно число, а не каждую строку.
    <div
      ref={container}
      className={`${synced ? (large ? 'space-y-6 py-[30vh]' : 'space-y-4') : 'space-y-1'} ${settings.lyricsAlign === 'center' ? 'text-center' : ''}`}
      style={{ fontSize: `${settings.lyricsScale}rem` }}
    >
      {lines.map((line, index) => (
        <p
          key={index}
          data-line={index}
          onClick={() => synced && line.start !== undefined && store.seek(line.start / 1000)}
          className={lineClass(index)}
        >
          {line.value || ' '}
        </p>
      ))}
    </div>
  )
}

export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const { queue } = useStore()
  const song = queue?.current?.song
  return (
    <aside className="content-layer flex w-80 shrink-0 flex-col border-l border-stroke">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="truncate text-base font-semibold">{song?.title ?? t('Текст песни')}</h2>
        <button onClick={onClose} className="icon-btn shrink-0" title={t('Скрыть')} aria-label={t('Скрыть')}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <Lyrics />
      </div>
    </aside>
  )
}
