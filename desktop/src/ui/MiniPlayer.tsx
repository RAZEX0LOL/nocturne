import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Что мини-плеер получает от главного окна: звук играет там, здесь — только пульт. */
export interface MiniState {
  title?: string
  artist?: string
  cover?: string
  playing: boolean
  position: number
  duration: number
  colors: string[]
  accent?: string
}

async function send(action: 'toggle' | 'next' | 'previous') {
  const { emitTo } = await import('@tauri-apps/api/event')
  await emitTo('main', 'media-command', { action })
}

async function backToMain() {
  const { emitTo } = await import('@tauri-apps/api/event')
  await emitTo('main', 'mini-expand')
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

/**
 * Мини-плеер: маленькое окно поверх остальных с обложкой, названием и кнопками. Перетаскивается
 * за любое место, кроме кнопок; двойной клик или кнопка «развернуть» возвращают главное окно.
 */
export function MiniPlayer() {
  const [state, setState] = useState<MiniState>({ playing: false, position: 0, duration: 0, colors: [] })

  useEffect(() => {
    let stop: (() => void) | undefined
    void (async () => {
      const { listen, emitTo } = await import('@tauri-apps/api/event')
      stop = await listen<MiniState>('player-state', ({ payload }) => setState(payload))
      // Окно только что открылось — просим главное прислать состояние, не дожидаясь перемен.
      await emitTo('main', 'mini-ready')
    })()
    return () => stop?.()
  }, [])

  useEffect(() => {
    if (state.accent) document.documentElement.style.setProperty('--accent', state.accent)
  }, [state.accent])

  const progress = state.duration > 0 ? Math.min(state.position / state.duration, 1) : 0
  const [first, second] = state.colors

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => void backToMain()}
      className="relative flex h-full select-none items-center gap-3 overflow-hidden p-3 text-white"
      style={{
        background: `linear-gradient(135deg, ${first ?? '#2a2340'}, ${second ?? first ?? '#16161f'})`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/45" />
      {state.cover ? (
        <img src={state.cover} alt="" draggable={false} className="pointer-events-none relative h-[104px] w-[104px] shrink-0 rounded-lg object-cover shadow-lg" />
      ) : (
        <div className="pointer-events-none relative grid h-[104px] w-[104px] shrink-0 place-items-center rounded-lg bg-white/10">
          <Icon name="note" size={28} />
        </div>
      )}
      <div data-tauri-drag-region className="relative flex min-w-0 flex-1 flex-col justify-between self-stretch py-1">
        <div data-tauri-drag-region className="flex items-start gap-1">
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <div data-tauri-drag-region className="truncate text-sm font-semibold">{state.title ?? t('Ничего не играет.')}</div>
            <div data-tauri-drag-region className="truncate text-xs text-white/70">{state.artist ?? ''}</div>
          </div>
          <button onClick={() => void backToMain()} className="icon-btn h-7 w-7 text-white/70 hover:text-white" title={t('Развернуть')} aria-label={t('Развернуть')}>
            <Icon name="expand" size={12} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => void send('previous')} className="icon-btn h-9 w-9 text-white" title={t('Предыдущий трек')} aria-label={t('Предыдущий трек')}>
            <Icon name="previous" size={16} />
          </button>
          <button
            onClick={() => void send('toggle')}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition-transform active:scale-95"
            title={state.playing ? t('Пауза') : t('Воспроизвести')}
            aria-label={state.playing ? t('Пауза') : t('Воспроизвести')}
          >
            <Icon name={state.playing ? 'pause' : 'play'} size={16} />
          </button>
          <button onClick={() => void send('next')} className="icon-btn h-9 w-9 text-white" title={t('Следующий трек')} aria-label={t('Следующий трек')}>
            <Icon name="next" size={16} />
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
