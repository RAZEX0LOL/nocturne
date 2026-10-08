import { isMac, isWindows } from './native'
import { isDesktop } from './platform'
import { store, type AccentMode, type CoverPalette } from './state/store'
import { customAccent, resolveTheme, type Accent, type ResolvedTheme } from './core/colors'

/**
 * Тема и цвет акцента окна.
 *
 * Тема: тёмная, OLED-чёрная, светлая или «как в системе» — тогда она меняется вместе с системой
 * без перезапуска. Вместе с темой переключается и сама рамка окна: заголовок Windows, Mica и
 * стекло Mac (setTheme), иначе светлое окно было бы с тёмным заголовком.
 *
 * Акцент: системный (Windows, Mac), из обложки играющего трека, фирменный фиолетовый или свой.
 * В светлой теме акцент темнее — светлая пастель на белом не читается.
 */

const BRAND_DARK: Accent = { fill: '#a78bfa', text: '#c4b5fd', onFill: '#0b0b10' }
const BRAND_LIGHT: Accent = { fill: '#7c3aed', text: '#6d28d9', onFill: '#ffffff' }

interface SystemAccent {
  dark: Accent
  light: Accent
}

let systemAccent: SystemAccent | undefined

const macAccentSupported = typeof CSS !== 'undefined' && CSS.supports('color', '-apple-system-control-accent')
const darkQuery = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')

/** Акцент Windows приходит из Rust при запуске и при смене цвета в «Параметрах». */
export function setSystemAccent(colors: { fill: string; text: string; fillLight?: string; textLight?: string }) {
  systemAccent = {
    dark: { fill: colors.fill, text: colors.text, onFill: '#000000' },
    light: { fill: colors.fillLight ?? colors.fill, text: colors.textLight ?? colors.text, onFill: '#ffffff' },
  }
  apply()
}

function resolveAccent(mode: AccentMode, palette: CoverPalette | undefined, custom: string, theme: ResolvedTheme): Accent | 'mac-system' {
  const light = theme === 'light'
  if (mode === 'custom') return customAccent(custom, theme)
  if (mode === 'cover' && palette) {
    // Из обложки приходит светлая пастель: в светлой теме она темнеет, чтобы не теряться на белом.
    return light
      ? { fill: `color-mix(in srgb, ${palette.accent} 55%, black)`, text: `color-mix(in srgb, ${palette.accent} 45%, black)`, onFill: '#ffffff' }
      : { fill: palette.accent, text: palette.accent, onFill: '#000000' }
  }
  if (mode === 'brand') return light ? BRAND_LIGHT : BRAND_DARK
  if (isWindows && systemAccent) return light ? systemAccent.light : systemAccent.dark
  // На Mac системный акцент знает только сам WebKit: цвет задаётся в CSS, а не отсюда.
  // Где WebKit этого не умеет (превью в Chrome), остаётся системный синий из CSS.
  if (isMac && macAccentSupported) return 'mac-system'
  if (isMac) return light ? { fill: '#007aff', text: '#0066d6', onFill: '#ffffff' } : { fill: '#0a84ff', text: '#409cff', onFill: '#ffffff' }
  return light ? BRAND_LIGHT : BRAND_DARK
}

/** «Острые» и «круглые» углы; «как в системе» — токены платформы из styles.css без изменений. */
const CORNERS: Record<'sharp' | 'normal' | 'round', [string, string, string] | undefined> = {
  sharp: ['2px', '3px', '4px'],
  normal: undefined,
  round: ['14px', '20px', '24px'],
}
const RADIUS_NAMES: Record<string, 0 | 1 | 2> = { '--radius-control': 0, '--radius-card': 1, '--radius-overlay': 2 }

let shownAccent = ''
let shownTheme = ''

async function applyWindowTheme(theme: ResolvedTheme) {
  if (!isDesktop()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTheme(theme === 'light' ? 'light' : 'dark')
  } catch {
    // Старая система без смены темы окна — интерфейс всё равно перекрашен.
  }
}

function apply() {
  const { settings, palette } = store.snapshot()
  const root = document.documentElement
  const theme = resolveTheme(settings.theme, darkQuery?.matches ?? true)
  if (theme !== shownTheme) {
    shownTheme = theme
    root.dataset.theme = theme
    void applyWindowTheme(theme)
  }

  // Масштаб, плотность и размер обложек — переменные и классы на корне: их читают стили.
  root.style.zoom = String(settings.uiScale)
  // Углы — поверх токенов платформы: инлайн-переменные на корне сильнее любых правил в CSS.
  const radius = CORNERS[settings.corners]
  for (const [name, value] of Object.entries(RADIUS_NAMES)) {
    if (radius) root.style.setProperty(name, radius[value])
    else root.style.removeProperty(name)
  }
  root.classList.toggle('font-rounded', settings.fontStyle === 'rounded' && isMac)
  root.classList.toggle('compact', settings.density === 'compact')
  root.style.setProperty('--card', `${settings.cardSize}px`)

  const accent = resolveAccent(settings.accent, palette, settings.accentColor, theme)
  const key = typeof accent === 'string' ? `${accent}|${theme}` : `${accent.fill}|${accent.text}|${accent.onFill}`
  if (key === shownAccent) return
  shownAccent = key
  root.classList.toggle('mac-system-accent', accent === 'mac-system')
  for (const name of ['--accent', '--accent-text', '--on-accent']) root.style.removeProperty(name)
  if (typeof accent === 'string') return
  root.style.setProperty('--accent', accent.fill)
  root.style.setProperty('--accent-text', accent.text)
  root.style.setProperty('--on-accent', accent.onFill)
}

export function startTheme() {
  store.subscribe(apply)
  // «Как в системе»: переключили тему в системе — окно следует сразу.
  darkQuery?.addEventListener('change', apply)
  apply()
}

/** Подписи вариантов: на Linux системного акцента нет — там это просто фирменный цвет. */
export const accentModes: AccentMode[] = isWindows || isMac ? ['system', 'cover', 'brand', 'custom'] : ['cover', 'brand', 'custom']

/** Готовые цвета для «своего» акцента — как палитра в «Параметрах» Windows и «Настройках» Mac. */
export const ACCENT_SWATCHES = ['#f472b6', '#fb7185', '#f97316', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#e2e8f0']
