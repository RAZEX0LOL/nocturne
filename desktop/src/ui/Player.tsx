import { useEffect, useRef, useState } from 'react'
import { store, useStore } from '../state/store'
import { Cover } from './Cover'
import { t } from '../i18n'

export type Panel = 'queue' | 'lyrics' | null

function time(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/** Нижняя панель: обложка, название, перемотка и управление. */
export function Player({ panel, onPanel }: { panel: Panel; onPanel: (panel: Panel) => void }) {
  const { queue, playing, buffering, position, duration, settings, starredIds } = useStore()
  const song = queue?.current?.song
  if (!song) return null
  const starred = starredIds.has(song.id)

  const total = duration || song.duration || 0

  return (
    <footer className="flex items-center gap-4 border-t border-surface-strong bg-surface/95 px-5 py-3 backdrop-blur">
      <Cover id={song.coverArt} size={52} rounded="rounded-lg" />

      <div className="min-w-0 w-56">
        <div className="truncate text-sm font-medium">{song.title}</div>
        <div className="truncate text-xs text-secondary">{song.artist ?? t('Неизвестный исполнитель')}</div>
      </div>
      <button
        onClick={() => void store.toggleStar(song)}
        className={`px-1 text-lg ${starred ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
      >
        {starred ? '♥' : '♡'}
      </button>

      <div className="flex items-center gap-3">
        <button
          onClick={() => store.setShuffle(!queue.shuffle)}
          className={`px-2 text-lg ${queue.shuffle ? 'text-accent' : 'text-secondary'}`}
          title={t('Перемешивать')}
          aria-label={t('Перемешивать')}
        >
          ⇄
        </button>
        <button onClick={() => void store.previous()} className="px-2 text-xl" aria-label={t('Предыдущий трек')}>
          ⏮
        </button>
        <button
          onClick={() => store.toggle()}
          className="grid h-11 w-11 place-items-center rounded-full bg-accent text-xl text-base"
          aria-label={playing ? t('Пауза') : t('Воспроизвести')}
        >
          {buffering ? '…' : playing ? '❚❚' : '▶'}
        </button>
        <button onClick={() => void store.advance()} className="px-2 text-xl" aria-label={t('Следующий трек')}>
          ⏭
        </button>
        <button
          onClick={() => store.cycleRepeat()}
          className={`px-2 text-lg ${queue.repeatMode === 'off' ? 'text-secondary' : 'text-accent'}`}
          title={t('Повтор')}
          aria-label={t('Режим повтора')}
        >
          {queue.repeatMode === 'one' ? '🔂' : '🔁'}
        </button>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="w-10 text-right text-xs tabular-nums text-secondary">{time(position)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={0.5}
          value={Math.min(position, total)}
          onChange={(event) => store.seek(Number(event.target.value))}
          className="h-1 flex-1 accent-accent"
          aria-label={t('Перемотка')}
        />
        <span className="w-10 text-xs tabular-nums text-secondary">{time(total)}</span>
      </div>

      <SleepTimerMenu />
      <button
        onClick={() => onPanel(panel === 'lyrics' ? null : 'lyrics')}
        className={`px-2 text-lg ${panel === 'lyrics' ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label={t('Текст песни')}
        title={t('Текст песни')}
      >
        ❝
      </button>
      <button
        onClick={() => onPanel(panel === 'queue' ? null : 'queue')}
        className={`px-2 text-lg ${panel === 'queue' ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label={t('Очередь')}
        title={t('Очередь')}
      >
        ☰
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={settings.volume}
        onChange={(event) => store.update({ volume: Number(event.target.value) })}
        className="h-1 w-24 accent-accent"
        aria-label={t('Громкость')}
      />
    </footer>
  )
}

/** Таймер сна: те же варианты, что на телефоне, плюс обратный отсчёт на кнопке. */
function SleepTimerMenu() {
  const { sleepAt, sleepAtTrackEnd } = useStore()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const left = useCountdown(sleepAt)
  const active = sleepAt !== undefined || sleepAtTrackEnd

  // Меню закрывается по клику мимо: отдельной кнопки «закрыть» здесь быть не должно.
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const choose = (minutes: number | null) => {
    store.setSleepTimer(minutes)
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-2 text-sm ${active ? 'text-accent' : 'text-secondary hover:text-primary'}`}
        aria-label={t('Таймер сна')}
        title={t('Таймер сна')}
      >
        {left ?? (sleepAtTrackEnd ? '☾•' : '☾')}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-44 overflow-hidden rounded-lg border border-surface-strong bg-surface shadow-xl">
          {active && (
            <button onClick={() => choose(null)} className="block w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-surface-strong">
              {t('Выключить таймер')}
            </button>
          )}
          <button onClick={() => choose(0)} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-strong">
            {t('В конце трека')}
          </button>
          {[15, 30, 45, 60, 90].map((minutes) => (
            <button
              key={minutes}
              onClick={() => choose(minutes)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-strong"
            >
              {t('{n} мин', { n: minutes })}
            </button>
          ))}
        </div>
      )}
    </div>
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
