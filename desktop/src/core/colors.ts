/** Цвета темы без привязки к окну: их проверяют тесты (colors.test.ts). */

export interface Accent {
  fill: string
  text: string
  onFill: string
}

export type ThemeMode = 'system' | 'dark' | 'black' | 'light'
export type ResolvedTheme = 'dark' | 'black' | 'light'

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}

/** Яркость цвета по WCAG: на светлом акценте текст тёмный, на тёмном — белый. */
export function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return 0.5
  const channel = (offset: number) => {
    const value = parseInt(match[1]!.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Свой цвет: на заливке — контрастный текст, для надписей — сдвиг к фону темы, чтобы читалось. */
export function customAccent(color: string, theme: ResolvedTheme): Accent {
  const light = theme === 'light'
  return {
    fill: color,
    text: light ? `color-mix(in srgb, ${color} 75%, black)` : `color-mix(in srgb, ${color} 80%, white)`,
    onFill: luminance(color) > 0.45 ? '#000000' : '#ffffff',
  }
}

