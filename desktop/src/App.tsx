import { useEffect, useState } from 'react'
import { EQ_BANDS, EQ_PRESETS } from './audio/engine'
import { store, useStore } from './state/store'
import { Connect } from './ui/Connect'
import { Library } from './ui/Library'
import { Player } from './ui/Player'

export function App() {
  const { status, error, notice } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void store.restore()
  }, [])

  useEffect(() => {
    // Пробел ставит паузу, если человек не печатает в поле.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT') return
      if (event.code === 'Space') {
        event.preventDefault()
        store.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'connecting') {
    return <div className="grid h-full place-items-center text-secondary">Загружаю…</div>
  }
  if (status === 'signed-out') return <Connect />

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-surface-strong px-6 py-3">
        <span className="text-sm font-semibold tracking-widest text-secondary">NOCTURNE</span>
        <div className="flex items-center gap-3">
          <button onClick={() => void store.refresh()} className="text-sm text-secondary hover:text-primary">
            Обновить
          </button>
          <button onClick={() => setSettingsOpen(true)} className="text-sm text-secondary hover:text-primary">
            Настройки
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Library />
      </main>

      {error && (
        <div className="mx-6 mb-2 flex items-center justify-between rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={() => store.dismissError()}>×</button>
        </div>
      )}
      {notice && <div className="mx-6 mb-2 rounded-lg bg-surface-strong px-4 py-2 text-sm">{notice}</div>}

      <Player />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Settings({ onClose }: { onClose: () => void }) {
  const { settings } = useStore()

  return (
    <div className="fixed inset-0 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-lg space-y-6 rounded-2xl bg-surface p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Настройки</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary">
            Готово
          </button>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          Качество потока
          <select
            value={settings.quality}
            onChange={(event) => store.update({ quality: event.target.value as typeof settings.quality })}
            className="rounded-lg bg-surface-strong px-3 py-2"
          >
            <option value="original">Оригинал (без сжатия)</option>
            <option value="mp3High">Высокое · MP3 320</option>
            <option value="mp3Medium">Среднее · MP3 192</option>
            <option value="mp3Low">Экономное · MP3 128</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          Выравнивание громкости
          <select
            value={settings.replayGain}
            onChange={(event) => store.update({ replayGain: event.target.value as typeof settings.replayGain })}
            className="rounded-lg bg-surface-strong px-3 py-2"
          >
            <option value="off">Выключено</option>
            <option value="track">По треку</option>
            <option value="album">По альбому</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          Плавные переходы, сек
          <input
            type="number"
            min={0}
            max={12}
            step={1}
            value={settings.fadeSeconds}
            onChange={(event) => store.update({ fadeSeconds: Number(event.target.value) })}
            className="w-20 rounded-lg bg-surface-strong px-3 py-2"
          />
        </label>

        <section className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.eq.enabled}
              onChange={(event) => store.update({ eq: { ...settings.eq, enabled: event.target.checked } })}
            />
            Эквалайзер
          </label>

          <div className="flex gap-2">
            {Object.keys(EQ_PRESETS).map((preset) => (
              <button
                key={preset}
                onClick={() => store.update({ eq: { enabled: true, gains: [...EQ_PRESETS[preset]!] } })}
                className="rounded-lg bg-surface-strong px-3 py-1.5 text-xs"
              >
                {{ flat: 'Ровно', bass: 'Бас', treble: 'Верх', vocal: 'Вокал', loudness: 'Громко' }[preset] ?? preset}
              </button>
            ))}
          </div>

          <div className="flex items-end justify-between gap-2 pt-2">
            {EQ_BANDS.map((band, index) => (
              <div key={band} className="flex flex-col items-center gap-2">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={settings.eq.gains[index] ?? 0}
                  disabled={!settings.eq.enabled}
                  onChange={(event) => {
                    const gains = [...settings.eq.gains]
                    gains[index] = Number(event.target.value)
                    store.update({ eq: { ...settings.eq, gains } })
                  }}
                  className="h-24 accent-accent"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  aria-label={`${band} Гц`}
                />
                <span className="text-[10px] text-secondary">{band >= 1000 ? `${band / 1000}к` : band}</span>
              </div>
            ))}
          </div>
        </section>

        <button onClick={() => void store.disconnect()} className="text-sm text-red-400">
          Отключить сервер
        </button>
      </div>
    </div>
  )
}
