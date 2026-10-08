import { useEffect, useRef, useState } from 'react'
import { store, useStore, type PlayerButton } from '../state/store'
import { popupMenu } from '../shell'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { Slider } from './Slider'
import { SeekBar, Transport } from './Transport'
import { t } from '../i18n'

export type Panel = 'queue' | 'lyrics' | null

/**
 * Нижняя панель, как у «Медиаплеера» Windows: слева — что играет, в центре — управление
 * и перемотка, справа — громкость и боковые панели.
 */
export function Player({
  panel,
  onPanel,
  onExpand,
  onMini,
}: {
  panel: Panel
  onPanel: (panel: Panel) => void
  onExpand: () => void
  onMini: () => void
}) {
  const { queue, settings, starredIds, client, offline } = useStore()
  // Громкость до выключения звука: кнопка возвращает её, а не 100 %.
  const unmuted = useRef(1)
  const song = queue?.current?.song
  if (!song) return null
  const starred = starredIds.has(song.id)
  const canStar = !!client && !offline && !song.id.startsWith('local:') && !song.id.startsWith('radio:')
  const muted = settings.volume === 0
  const shown = (button: PlayerButton) => !settings.hiddenPlayerButtons.includes(button)

  const toggleMute = () => {
    if (muted) store.update({ volume: unmuted.current || 1 })
    else {
      unmuted.current = settings.volume
      store.update({ volume: 0 })
    }
  }

  return (
    <footer className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 border-t border-stroke px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onExpand} className="group relative shrink-0" title={t('Сейчас играет')} aria-label={t('Сейчас играет')}>
          <Cover id={song.coverArt} size={56} rounded="rounded-[var(--radius-card)]" />
          <span className="absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Icon name="expand" size={16} />
          </span>
        </button>
        <button onClick={onExpand} className="min-w-0 text-left">
          <div className="truncate font-semibold hover:underline">{song.title}</div>
          <div className="truncate text-xs text-secondary">{song.artist ?? t('Неизвестный исполнитель')}</div>
        </button>
        {canStar && (
          <button
            onClick={() => void store.toggleStar(song)}
            className="icon-btn"
            aria-pressed={starred}
            title={starred ? t('Убрать из избранного') : t('В избранное')}
            aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
          >
            <Icon name={starred ? 'heartFilled' : 'heart'} />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <Transport />
        <SeekBar className="w-full max-w-2xl" />
      </div>

      <div className="flex items-center justify-end gap-1">
        {shown('speed') && <SpeedButton />}
        {shown('sleep') && <SleepTimerButton />}
        {shown('mini') && (
          <button onClick={onMini} className="icon-btn" title={t('Мини-плеер')} aria-label={t('Мини-плеер')}>
            <Icon name="miniPlayer" />
          </button>
        )}
        {shown('lyrics') && (
        <button
          onClick={() => onPanel(panel === 'lyrics' ? null : 'lyrics')}
          className="icon-btn toggle-btn"
          aria-pressed={panel === 'lyrics'}
          aria-label={t('Текст песни')}
          title={t('Текст песни')}
        >
          <Icon name="lyrics" />
        </button>
        )}
        {shown('queue') && (
        <button
          onClick={() => onPanel(panel === 'queue' ? null : 'queue')}
          className="icon-btn toggle-btn"
          aria-pressed={panel === 'queue'}
          aria-label={t('Очередь')}
          title={t('Очередь')}
        >
          <Icon name="queue" />
        </button>
        )}
        <button onClick={toggleMute} className="icon-btn" title={muted ? t('Включить звук') : t('Выключить звук')} aria-label={muted ? t('Включить звук') : t('Выключить звук')}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
        <Slider value={settings.volume} max={1} step={0.01} onChange={(volume) => store.update({ volume })} label={t('Громкость')} className="w-24" />
      </div>
    </footer>
  )
}

/** Скорость воспроизведения — для аудиокниг и длинных миксов; не 1× — подсвечена. */
function SpeedButton() {
  const { settings } = useStore()
  const rate = settings.playbackRate
  const label = `${String(rate).replace('.', ',')}×`
  return (
    <button
      onClick={() =>
        void popupMenu(
          [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => ({
            text: `${String(value).replace('.', ',')}×${value === rate ? '  ✓' : ''}`,
            action: () => store.update({ playbackRate: value }),
          })),
        )
      }
      className={`icon-btn toggle-btn w-auto min-w-9 px-1.5 text-xs font-semibold tabular-nums`}
      aria-pressed={rate !== 1}
      title={t('Скорость: {rate}', { rate: label })}
      aria-label={t('Скорость: {rate}', { rate: label })}
    >
      {label}
    </button>
  )
}

/** Таймер сна: системное меню с теми же вариантами, что на телефоне, и обратный отсчёт на кнопке. */
function SleepTimerButton() {
  const { sleepAt, sleepAtTrackEnd } = useStore()
  const left = useCountdown(sleepAt)
  const active = sleepAt !== undefined || sleepAtTrackEnd

  const open = () =>
    void popupMenu([
      active && { text: t('Выключить таймер'), action: () => store.setSleepTimer(null) },
      active && 'separator',
      { text: t('В конце трека'), action: () => store.setSleepTimer(0) },
      ...[15, 30, 45, 60, 90].map((minutes) => ({ text: t('{n} мин', { n: minutes }), action: () => store.setSleepTimer(minutes) })),
    ])

  return (
    <button
      onClick={open}
      className={`icon-btn ${left ? 'w-auto gap-1.5 px-2' : ''}`}
      aria-pressed={active}
      aria-label={t('Таймер сна')}
      title={sleepAtTrackEnd ? t('Пауза в конце трека') : t('Таймер сна')}
    >
      <Icon name="sleep" />
      {left && <span className="text-xs tabular-nums">{left}</span>}
    </button>
  )
}

/** Сколько осталось до автоматической паузы; пересчитывается раз в секунду, только пока таймер идёт. */
function useCountdown(deadline: number | undefined) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (deadline === undefined) return
    const timer = setInterval(() => tick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [deadline])
  if (deadline === undefined) return undefined
  const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}
