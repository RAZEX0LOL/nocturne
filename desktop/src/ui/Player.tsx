import { useEffect, useRef, useState } from 'react'
import { store, useStore } from '../state/store'
import { popupMenu } from '../shell'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { Slider } from './Slider'
import { t } from '../i18n'

export type Panel = 'queue' | 'lyrics' | null

function time(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * Нижняя панель, как у «Медиаплеера» Windows: слева — что играет, в центре — управление
 * и перемотка, справа — громкость и боковые панели.
 */
export function Player({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const { queue, playing, buffering, position, duration, settings, starredIds, client, offline } = useStore()
  // Громкость до выключения звука: кнопка возвращает её, а не 100 %.
  const unmuted = useRef(1)
  const song = queue?.current?.song
  if (!song) return null
  const starred = starredIds.has(song.id)
  const canStar = !!client && !offline && !song.id.startsWith('local:')
  const total = duration || song.duration || 0
  const muted = settings.volume === 0

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
        <Cover id={song.coverArt} size={56} rounded="rounded-[var(--radius-card)]" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{song.title}</div>
          <div className="truncate text-xs text-secondary">{song.artist ?? t('Неизвестный исполнитель')}</div>
        </div>
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => store.setShuffle(!queue.shuffle)}
            className="icon-btn"
            aria-pressed={queue.shuffle}
            title={queue.shuffle ? t('Перемешивание: вкл.') : t('Перемешивание: откл.')}
            aria-label={t('Перемешивать')}
          >
            <Icon name="shuffle" />
          </button>
          <button onClick={() => void store.previous()} className="icon-btn text-primary" title={t('Предыдущий трек')} aria-label={t('Предыдущий трек')}>
            <Icon name="previous" />
          </button>
          <button
            onClick={() => store.toggle()}
            className="btn-accent mx-1 grid h-10 w-10 place-items-center rounded-full transition-colors"
            title={playing ? t('Пауза') : t('Воспроизвести')}
            aria-label={playing ? t('Пауза') : t('Воспроизвести')}
          >
            <Icon name={playing ? 'pause' : 'play'} size={16} className={buffering ? 'animate-pulse' : ''} />
          </button>
          <button onClick={() => void store.advance()} className="icon-btn text-primary" title={t('Следующий трек')} aria-label={t('Следующий трек')}>
            <Icon name="next" />
          </button>
          <button
            onClick={() => store.cycleRepeat()}
            className="icon-btn"
            aria-pressed={queue.repeatMode !== 'off'}
            title={
              queue.repeatMode === 'one' ? t('Повтор: один трек') : queue.repeatMode === 'all' ? t('Повтор: все') : t('Повтор: откл.')
            }
            aria-label={t('Режим повтора')}
          >
            <Icon name={queue.repeatMode === 'one' ? 'repeatOne' : 'repeat'} />
          </button>
        </div>
        <div className="flex w-full max-w-2xl items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-secondary">{time(position)}</span>
          <Slider
            value={Math.min(position, total)}
            max={Math.max(total, 1)}
            step={0.5}
            onChange={(value) => store.seek(value)}
            label={t('Перемотка')}
            className="flex-1"
          />
          <span className="w-10 text-xs tabular-nums text-secondary">{time(total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <SleepTimerButton />
        <button
          onClick={() => onPanel(panel === 'lyrics' ? null : 'lyrics')}
          className="icon-btn"
          aria-pressed={panel === 'lyrics'}
          aria-label={t('Текст песни')}
          title={t('Текст песни')}
        >
          <Icon name="lyrics" />
        </button>
        <button
          onClick={() => onPanel(panel === 'queue' ? null : 'queue')}
          className="icon-btn"
          aria-pressed={panel === 'queue'}
          aria-label={t('Очередь')}
          title={t('Очередь')}
        >
          <Icon name="queue" />
        </button>
        <button onClick={toggleMute} className="icon-btn" title={muted ? t('Включить звук') : t('Выключить звук')} aria-label={muted ? t('Включить звук') : t('Выключить звук')}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
        <Slider value={settings.volume} max={1} step={0.01} onChange={(volume) => store.update({ volume })} label={t('Громкость')} className="w-24" />
      </div>
    </footer>
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
