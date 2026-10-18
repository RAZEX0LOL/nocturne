import { store, useStore, useTransport } from '../state/store'
import { Icon } from './Icon'
import { Slider } from './Slider'
import { t } from '../i18n'

export function time(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * Кнопки управления: перемешивание, назад, играть, вперёд, повтор. Одни и те же в нижней панели
 * и в полноэкранном плеере — там они просто крупнее.
 */
export function Transport({ large = false }: { large?: boolean }) {
  const { queue, playing, buffering } = useStore()
  if (!queue) return null
  // Включённый режим заметен сразу: подложка и точка под значком, на полном экране — белые.
  const side = (active: boolean) =>
    large
      ? `toggle-btn relative grid h-12 w-12 place-items-center rounded-full transition-colors ${active ? 'is-on bg-white/20 text-white' : 'text-white/60 hover:text-white'}`
      : 'icon-btn toggle-btn'
  const skip = large ? 'icon-btn h-14 w-14 text-white' : 'icon-btn text-primary'
  const iconSize = large ? 22 : 16
  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-1'}`}>
      <button
        onClick={() => store.setShuffle(!queue.shuffle)}
        className={side(queue.shuffle)}
        aria-pressed={queue.shuffle}
        title={queue.shuffle ? t('Перемешивание: вкл.') : t('Перемешивание: откл.')}
        aria-label={t('Перемешивать')}
      >
        <Icon name="shuffle" size={large ? 18 : 16} />
      </button>
      <button onClick={() => void store.previous()} className={skip} title={t('Предыдущий трек')} aria-label={t('Предыдущий трек')}>
        <Icon name="previous" size={iconSize} />
      </button>
      <button
        onClick={() => store.toggle()}
        className={`grid place-items-center rounded-full transition-transform active:scale-95 ${
          large ? 'h-16 w-16 bg-white text-black shadow-xl hover:scale-105' : 'btn-accent mx-1 h-10 w-10'
        }`}
        title={playing ? t('Пауза') : t('Воспроизвести')}
        aria-label={playing ? t('Пауза') : t('Воспроизвести')}
      >
        <Icon name={playing ? 'pause' : 'play'} size={large ? 24 : 16} className={buffering ? 'animate-pulse' : ''} />
      </button>
      <button onClick={() => void store.advance()} className={skip} title={t('Следующий трек')} aria-label={t('Следующий трек')}>
        <Icon name="next" size={iconSize} />
      </button>
      <button
        onClick={() => store.cycleRepeat()}
        className={side(queue.repeatMode !== 'off')}
        aria-pressed={queue.repeatMode !== 'off'}
        title={queue.repeatMode === 'one' ? t('Повтор: один трек') : queue.repeatMode === 'all' ? t('Повтор: все') : t('Повтор: откл.')}
        aria-label={t('Режим повтора')}
      >
        <Icon name={queue.repeatMode === 'one' ? 'repeatOne' : 'repeat'} size={large ? 18 : 16} />
      </button>
    </div>
  )
}

/** Перемотка с прошедшим и общим временем по краям. */
export function SeekBar({ onDark = false, className = '' }: { onDark?: boolean; className?: string }) {
  const { queue } = useStore()
  const { position, duration } = useTransport()
  const song = queue?.current?.song
  const total = duration || song?.duration || 0
  const label = `w-10 text-xs tabular-nums ${onDark ? 'text-white/70' : 'text-secondary'}`
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className={`${label} text-right`}>{time(position)}</span>
      <Slider
        value={Math.min(position, total)}
        max={Math.max(total, 1)}
        step={0.5}
        onChange={(value) => store.seek(value)}
        label={t('Перемотка')}
        className={`flex-1 ${onDark ? 'slider-on-dark' : ''}`}
      />
      <span className={label}>{time(total)}</span>
    </div>
  )
}
