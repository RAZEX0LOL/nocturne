import { isMac, isWindows } from './native'
import { store, type AccentMode, type CoverPalette } from './state/store'

/**
 * Цвет акцента окна. Три источника, как на iPhone, плюс системный:
 * - «Как в системе» — цвет из «Параметров» Windows или из «Системных настроек» Mac;
 * - «Из обложки» — яркий цвет играющего трека, меняется вместе с треком;
 * - «Nocturne» — фирменный фиолетовый.
 * Цвет текста на заливке подбирается под акцент: тёмный на светлых, белый на системном синем Mac.
 */

interface Accent {
  fill: string
  text: string
  onFill: string
}

const BRAND: Accent = { fill: '#a78bfa', text: '#c4b5fd', onFill: '#0b0b10' }

let systemAccent: Accent | undefined

const macAccentSupported = typeof CSS !== 'undefined' && CSS.supports('color', '-apple-system-control-accent')

/** Акцент Windows приходит из Rust при запуске и при смене цвета в «Параметрах». */
export function setSystemAccent(fill: string, text: string) {
  systemAccent = { fill, text, onFill: '#000000' }
  apply()
}

function resolve(mode: AccentMode, palette: CoverPalette | undefined): Accent | 'mac-system' {
  if (mode === 'cover' && palette) return { fill: palette.accent, text: palette.accent, onFill: '#000000' }
  if (mode === 'brand') return BRAND
  if (isWindows && systemAccent) return systemAccent
  // На Mac системный акцент знает только сам WebKit: цвет задаётся в CSS, а не отсюда.
  // Где WebKit этого не умеет (превью в Chrome), остаётся системный синий из CSS.
  if (isMac && macAccentSupported) return 'mac-system'
  return BRAND
}

let shown = ''

function apply() {
  const { settings, palette } = store.snapshot()
  const accent = resolve(settings.accent, palette)
  const key = typeof accent === 'string' ? accent : `${accent.fill}|${accent.text}|${accent.onFill}`
  if (key === shown) return
  shown = key
  const root = document.documentElement
  root.classList.toggle('mac-system-accent', accent === 'mac-system')
  for (const name of ['--accent', '--accent-text', '--on-accent']) root.style.removeProperty(name)
  if (typeof accent === 'string') return
  root.style.setProperty('--accent', accent.fill)
  root.style.setProperty('--accent-text', accent.text)
  root.style.setProperty('--on-accent', accent.onFill)
}

export function startTheme() {
  store.subscribe(apply)
  apply()
}

/** Подписи вариантов: на Linux системного акцента нет — там это просто фирменный цвет. */
export const accentModes: AccentMode[] = isWindows || isMac ? ['system', 'cover', 'brand'] : ['cover', 'brand']
