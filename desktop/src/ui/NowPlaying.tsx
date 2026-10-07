import { useEffect, useState } from 'react'
import { coverUrl, store, useStore } from '../state/store'
import { isDesktop } from '../platform'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { Lyrics } from './LyricsPanel'
import { UpcomingList } from './QueuePanel'
import { Slider } from './Slider'
import { SeekBar, Transport } from './Transport'
import { t } from '../i18n'

type Side = 'lyrics' | 'queue'

/** Большая обложка играющего трека: та же, что в списках, но в высоком разрешении для фона. */
function useBigCover(id: string | undefined) {
  const { client, offline } = useStore()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let cancelled = false
    setUrl(undefined)
    void coverUrl(id, offline ? undefined : client, 1200).then((address) => !cancelled && setUrl(address))
    return () => {
      cancelled = true
    }
  }, [id, client, offline])
  return url
}

/**
 * Живой фон: размытая обложка и три медленно плывущих пятна её цветов. Цвета считает Rust
 * (см. palette.rs), без них остаётся одна размытая обложка — тоже красиво.
 */
function LivingBackground({ cover }: { cover?: string }) {
  const { palette } = useStore()
  const colors = palette?.colors.length ? palette.colors : []
  const base = palette?.base ?? '#121218'
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: base }} aria-hidden>
      {cover && (
        <img src={cover} alt="" draggable={false} className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-[80px] saturate-150" />
      )}
      {colors.map((color, index) => (
        <div key={`${color}-${index}`} className={`blob blob-${index}`} style={{ background: color }} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 to-black/60" />
    </div>
  )
}

/**
 * Полноэкранный плеер «Сейчас играет»: крупная обложка, управление и текст песни на живом фоне
 * из цветов обложки. Открывается по клику на обложку в нижней панели, закрывается Esc.
 */
export function NowPlaying({ onClose, onMini }: { onClose: () => void; onMini: () => void }) {
  const { queue, settings } = useStore()
  const song = queue?.current?.song
  const cover = useBigCover(song?.coverArt)
  const [side, setSide] = useState<Side>('lyrics')
  const [fullscreen, setFullscreen] = useState(false)

  const shown = side

  // Текст грузится сразу при открытии и смене трека, даже если открыта очередь: переключение
  // на вкладку «Текст» должно показать его без ожидания.
  useEffect(() => {
    void store.loadLyrics()
  }, [song?.id])

  const toggleFullscreen = async () => {
    if (!isDesktop()) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const window = getCurrentWindow()
    const next = !(await window.isFullscreen())
    await window.setFullscreen(next)
    setFullscreen(next)
  }

  // Закрыли плеер — окно возвращается из полноэкранного режима.
  useEffect(
    () => () => {
      if (!isDesktop()) return
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setFullscreen(false)).catch(() => {})
    },
    [],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault()
        void toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!song) return null

  return (
    <div className="now-playing fixed inset-0 z-30 flex flex-col text-white" role="dialog" aria-label={t('Сейчас играет')}>
      <LivingBackground cover={cover} />

      <header data-tauri-drag-region className="relative flex items-center gap-2 px-5 pb-2 pt-4">
        <span className="titlebar-space w-16" data-tauri-drag-region />
        <button onClick={onClose} className="icon-btn text-white/80 hover:text-white" title={t('Свернуть плеер')} aria-label={t('Свернуть плеер')}>
          <Icon name="chevronDown" size={18} />
        </button>
        <div className="flex-1" data-tauri-drag-region />
        <div className="flex rounded-full bg-white/10 p-1 backdrop-blur" role="tablist">
          {(['lyrics', 'queue'] as Side[]).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={shown === value}
              onClick={() => setSide(value)}
              className={`rounded-full px-4 py-1 text-sm transition-colors ${shown === value ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white'}`}
            >
              {value === 'lyrics' ? t('Текст') : t('Очередь')}
            </button>
          ))}
        </div>
        <div className="flex-1" data-tauri-drag-region />
        <button onClick={onMini} className="icon-btn text-white/80 hover:text-white" title={t('Мини-плеер')} aria-label={t('Мини-плеер')}>
          <Icon name="miniPlayer" size={16} />
        </button>
        {isDesktop() && (
          <button
            onClick={() => void toggleFullscreen()}
            className="icon-btn text-white/80 hover:text-white"
            title={fullscreen ? t('Выйти из полноэкранного режима') : t('Во весь экран (F11)')}
            aria-label={fullscreen ? t('Выйти из полноэкранного режима') : t('Во весь экран (F11)')}
          >
            <Icon name={fullscreen ? 'collapse' : 'expand'} size={16} />
          </button>
        )}
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-10 px-10 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-16">
        <div className="flex min-h-0 flex-col items-center justify-center gap-6">
          <div key={song.coverArt} className="cover-pop aspect-square w-full max-w-[min(30rem,52vh)] overflow-hidden rounded-2xl shadow-[0_30px_80px_rgb(0_0_0/0.55)]">
            {cover ? (
              <img src={cover} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <Cover id={song.coverArt} size={480} fluid rounded="rounded-2xl" />
            )}
          </div>
          <div className="w-full max-w-[min(30rem,52vh)] space-y-4">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-2xl font-bold tracking-tight">{song.title}</div>
                <button
                  onClick={() => {
                    if (!song.artistId) return
                    onClose()
                    store.open({ kind: 'artist', artist: { id: song.artistId, name: song.artist ?? '' } })
                  }}
                  className="block max-w-full truncate text-left text-lg text-white/70 enabled:hover:text-white enabled:hover:underline"
                  disabled={!song.artistId}
                >
                  {song.artist ?? t('Неизвестный исполнитель')}
                  {song.album ? ` — ${song.album}` : ''}
                </button>
              </div>
            </div>
            <SeekBar onDark />
            <div className="flex justify-center">
              <Transport large />
            </div>
            <div className="flex items-center justify-center gap-3 text-white/70">
              <Icon name={settings.volume === 0 ? 'mute' : 'volume'} size={14} />
              <Slider
                value={settings.volume}
                max={1}
                step={0.01}
                onChange={(volume) => store.update({ volume })}
                label={t('Громкость')}
                className="slider-on-dark w-48"
              />
            </div>
          </div>
        </div>

        <div className={`${shown === 'lyrics' ? 'lyrics-fade' : ''} hidden min-h-0 overflow-y-auto pr-4 lg:block`}>
          {shown === 'lyrics' ? <Lyrics large /> : <div className="py-6"><UpcomingList onDark /></div>}
        </div>
      </div>
    </div>
  )
}
