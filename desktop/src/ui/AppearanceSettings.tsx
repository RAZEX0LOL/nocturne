import type { ReactNode } from 'react'
import { PLAYER_BUTTONS, SHELVES, store, useStore, type AccentMode, type PlayerButton, type Settings, type ShelfId } from '../state/store'
import { isMac } from '../native'
import { ACCENT_SWATCHES, accentModes } from '../theme'
import { Icon } from './Icon'
import { Slider } from './Slider'
import { t } from '../i18n'

/** Сегментный переключатель — как SegmentedControl в WinUI и NSSegmentedControl на Mac. */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className="segment"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="card settings-card flex-wrap">
      <div className="min-w-0 flex-1">
        <div>{title}</div>
        {description && <div className="text-xs text-secondary">{description}</div>}
      </div>
      {children}
    </div>
  )
}

const THEMES: Array<{ value: Settings['theme']; label: string; preview: [string, string, string] }> = [
  { value: 'system', label: 'Как в системе', preview: ['#f3f3f3', '#1f1f24', '#8b5cf6'] },
  { value: 'dark', label: 'Тёмная', preview: ['#1c1c22', '#2a2a33', '#a78bfa'] },
  { value: 'black', label: 'OLED-чёрная', preview: ['#000000', '#141418', '#a78bfa'] },
  { value: 'light', label: 'Светлая', preview: ['#f6f6f9', '#ffffff', '#7c3aed'] },
]

/** Плитка темы с мини-окном: фон, панель и полоска акцента — видно до выбора, как это будет. */
function ThemeTile({ theme, active }: { theme: (typeof THEMES)[number]; active: boolean }) {
  const [base, panel, accent] = theme.preview
  const split = theme.value === 'system'
  return (
    <button
      onClick={() => store.update({ theme: theme.value })}
      className={`theme-tile ${active ? 'is-active' : ''}`}
      role="radio"
      aria-checked={active}
      aria-label={t(theme.label)}
    >
      <span
        className="theme-preview"
        style={{ background: split ? `linear-gradient(135deg, ${base} 50%, ${panel} 50%)` : base }}
      >
        {!split && (
          <>
            <span className="absolute left-2 top-2 h-[calc(100%-16px)] w-[30%] rounded" style={{ background: panel }} />
            <span className="absolute bottom-3 right-3 h-2 w-[40%] rounded-full" style={{ background: accent }} />
            <span className="absolute right-3 top-3 h-2 w-[30%] rounded-full opacity-40" style={{ background: panel === '#ffffff' ? '#cfcfd8' : '#55556a' }} />
          </>
        )}
      </span>
      <span className="text-sm">{t(theme.label)}</span>
    </button>
  )
}

const SHELF_LABELS: Record<ShelfId, string> = {
  played: 'Недавно слушал',
  recent: 'Недавно добавленные',
  starred: 'Любимые треки',
  frequent: 'Часто слушаю',
  random: 'Случайные альбомы',
}

const SECTION_LABELS: Array<{ kind: string; label: string }> = [
  { kind: 'search', label: 'Поиск' },
  { kind: 'local', label: 'На компьютере' },
  { kind: 'downloads', label: 'Загрузки' },
  { kind: 'albums', label: 'Альбомы' },
  { kind: 'artists', label: 'Артисты' },
  { kind: 'playlists', label: 'Плейлисты' },
  { kind: 'favorites', label: 'Избранное' },
  { kind: 'genres', label: 'Жанры' },
  { kind: 'radio', label: 'Радио' },
]

/** Полки главной: включить, выключить и поменять местами — порядок на главной тот же, что здесь. */
function HomeShelves({ settings }: { settings: Settings }) {
  const shown = settings.homeShelves
  const all = [...shown, ...SHELVES.filter((id) => !shown.includes(id))]
  const move = (id: ShelfId, by: -1 | 1) => {
    const order = [...shown]
    const index = order.indexOf(id)
    const target = index + by
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    store.update({ homeShelves: order })
  }
  return (
    <div className="card divide-y divide-[var(--stroke)]">
      {all.map((id) => {
        const visible = shown.includes(id)
        const index = shown.indexOf(id)
        return (
          <div key={id} className="flex items-center gap-3 px-4 py-2" data-shelf={id}>
            <input
              type="checkbox"
              className="toggle"
              checked={visible}
              onChange={(event) =>
                store.update({ homeShelves: event.target.checked ? [...shown, id] : shown.filter((one) => one !== id) })
              }
              aria-label={t(SHELF_LABELS[id])}
            />
            <span className={`flex-1 ${visible ? '' : 'text-secondary'}`}>{t(SHELF_LABELS[id])}</span>
            <button className="icon-btn h-8 w-8" disabled={!visible || index === 0} onClick={() => move(id, -1)} aria-label={t('Выше')} title={t('Выше')}>
              <Icon name="chevronDown" size={12} className="rotate-180" />
            </button>
            <button
              className="icon-btn h-8 w-8"
              disabled={!visible || index === shown.length - 1}
              onClick={() => move(id, 1)}
              aria-label={t('Ниже')}
              title={t('Ниже')}
            >
              <Icon name="chevronDown" size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

const PLAYER_BUTTON_LABELS: Record<PlayerButton, string> = {
  speed: 'Скорость',
  sleep: 'Таймер сна',
  mini: 'Мини-плеер',
  lyrics: 'Текст песни',
  queue: 'Очередь',
}

const ACCENT_LABELS: Record<AccentMode, string> = { system: 'Системный', cover: 'Из обложки', brand: 'Nocturne', custom: 'Свой' }

/** «Оформление»: всё, что меняет вид, в одном месте и сразу видно. */
export function AppearanceSettings() {
  const { settings } = useStore()
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">{t('Тема')}</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label={t('Тема')}>
          {THEMES.map((theme) => (
            <ThemeTile key={theme.value} theme={theme} active={settings.theme === theme.value} />
          ))}
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Цвет акцента')}</h2>
        <Row title={t('Источник')} description={t('Кнопки, ползунки, выделение и полоска выбранного раздела.')}>
          <Segmented
            label={t('Цвет акцента')}
            value={settings.accent}
            options={accentModes.map((mode) => ({ value: mode, label: t(ACCENT_LABELS[mode]) }))}
            onChange={(accent) => store.update({ accent })}
          />
        </Row>
        {settings.accent === 'custom' && (
          <Row title={t('Свой цвет')}>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map((color) => (
                <button
                  key={color}
                  onClick={() => store.update({ accentColor: color })}
                  className={`swatch ${settings.accentColor === color ? 'is-active' : ''}`}
                  style={{ background: color }}
                  aria-label={color}
                  title={color}
                />
              ))}
              <label className="swatch swatch-picker" title={t('Любой цвет')}>
                <input type="color" value={settings.accentColor} onChange={(event) => store.update({ accentColor: event.target.value })} aria-label={t('Любой цвет')} />
              </label>
            </div>
          </Row>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Полноэкранный плеер')}</h2>
        <Row title={t('Фон')}>
          <Segmented
            label={t('Фон')}
            value={settings.playerBackground}
            options={[
              { value: 'living', label: t('Живой') },
              { value: 'blur', label: t('Размытая обложка') },
              { value: 'solid', label: t('Однотонный') },
            ]}
            onChange={(playerBackground) => store.update({ playerBackground })}
          />
        </Row>
        <Row title={t('Визуализатор')}>
          <Segmented
            label={t('Визуализатор')}
            value={settings.visualizer ? settings.visualizerStyle : 'off'}
            options={[
              { value: 'bars', label: t('Полосы') },
              { value: 'wave', label: t('Волна') },
              { value: 'off', label: t('Нет') },
            ]}
            onChange={(value) =>
              store.update(value === 'off' ? { visualizer: false } : { visualizer: true, visualizerStyle: value })
            }
          />
        </Row>
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Текст песни')}</h2>
        <Row title={t('Размер')}>
          <Segmented
            label={t('Размер текста песни')}
            value={settings.lyricsScale}
            options={[
              { value: 0.85, label: t('Мелкий') },
              { value: 1, label: t('Обычный') },
              { value: 1.2, label: t('Крупный') },
              { value: 1.45, label: t('Огромный') },
            ]}
            onChange={(lyricsScale) => store.update({ lyricsScale })}
          />
        </Row>
        <Row title={t('Выравнивание')}>
          <Segmented
            label={t('Выравнивание текста песни')}
            value={settings.lyricsAlign}
            options={[
              { value: 'left', label: t('По левому краю') },
              { value: 'center', label: t('По центру') },
            ]}
            onChange={(lyricsAlign) => store.update({ lyricsAlign })}
          />
        </Row>
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Форма')}</h2>
        <Row title={t('Углы')} description={t('Окна, карточки, кнопки и обложки.')}>
          <Segmented
            label={t('Углы')}
            value={settings.corners}
            options={[
              { value: 'sharp', label: t('Острые') },
              { value: 'normal', label: t('Как в системе') },
              { value: 'round', label: t('Круглые') },
            ]}
            onChange={(corners) => store.update({ corners })}
          />
        </Row>
        {isMac && (
          <Row title={t('Шрифт')}>
            <Segmented
              label={t('Шрифт')}
              value={settings.fontStyle}
              options={[
                { value: 'system', label: t('Системный') },
                { value: 'rounded', label: t('Скруглённый') },
              ]}
              onChange={(fontStyle) => store.update({ fontStyle })}
            />
          </Row>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Панель плеера')}</h2>
        <div className="card grid grid-cols-1 gap-x-6 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {PLAYER_BUTTONS.map((button) => {
            const hidden = settings.hiddenPlayerButtons.includes(button)
            return (
              <label key={button} className="flex items-center gap-3 py-2" data-player-button={button}>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={!hidden}
                  onChange={(event) =>
                    store.update({
                      hiddenPlayerButtons: event.target.checked
                        ? settings.hiddenPlayerButtons.filter((one) => one !== button)
                        : [...settings.hiddenPlayerButtons, button],
                    })
                  }
                  aria-label={t(PLAYER_BUTTON_LABELS[button])}
                />
                <span className={hidden ? 'text-secondary' : ''}>{t(PLAYER_BUTTON_LABELS[button])}</span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Размеры')}</h2>
        <Row title={t('Масштаб интерфейса')} description={t('Всё приложение крупнее или мельче, как масштаб в системе.')}>
          <Segmented
            label={t('Масштаб интерфейса')}
            value={settings.uiScale}
            options={[
              { value: 0.9, label: '90%' },
              { value: 1, label: '100%' },
              { value: 1.1, label: '110%' },
              { value: 1.25, label: '125%' },
            ]}
            onChange={(uiScale) => store.update({ uiScale })}
          />
        </Row>
        <Row title={t('Плотность списков')}>
          <Segmented
            label={t('Плотность списков')}
            value={settings.density}
            options={[
              { value: 'comfortable', label: t('Обычная') },
              { value: 'compact', label: t('Компактная') },
            ]}
            onChange={(density) => store.update({ density })}
          />
        </Row>
        <Row title={t('Размер обложек')} description={t('В сетках альбомов и на полках главной.')}>
          <span className="w-12 text-right text-sm tabular-nums text-secondary">{settings.cardSize}</span>
          <Slider value={settings.cardSize} min={128} max={256} step={8} onChange={(cardSize) => store.update({ cardSize })} label={t('Размер обложек')} className="w-48" />
        </Row>
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Главная')}</h2>
        <HomeShelves settings={settings} />
      </section>

      <section className="space-y-1">
        <h2 className="px-1 pb-1 text-sm font-semibold">{t('Боковое меню')}</h2>
        <div className="card grid grid-cols-1 gap-x-6 px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTION_LABELS.map(({ kind, label }) => {
            const hidden = settings.hiddenSections.includes(kind)
            return (
              <label key={kind} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="toggle"
                  checked={!hidden}
                  onChange={(event) =>
                    store.update({
                      hiddenSections: event.target.checked
                        ? settings.hiddenSections.filter((one) => one !== kind)
                        : [...settings.hiddenSections, kind],
                    })
                  }
                  aria-label={t(label)}
                />
                <span className={hidden ? 'text-secondary' : ''}>{t(label)}</span>
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}
