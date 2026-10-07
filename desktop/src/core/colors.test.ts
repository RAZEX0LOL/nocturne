import { describe, expect, test } from 'bun:test'
import { customAccent, luminance, resolveTheme } from './colors'

describe('тема и свой акцент', () => {
  test('«как в системе» следует за системой, остальные — как выбраны', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('black', false)).toBe('black')
    expect(resolveTheme('light', true)).toBe('light')
  })

  test('яркость по WCAG: белый 1, чёрный 0, кривой цвет — середина', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(luminance('#000000')).toBeCloseTo(0)
    expect(luminance('not a color')).toBe(0.5)
  })

  test('текст на заливке контрастный: тёмный на жёлтом, белый на синем', () => {
    expect(customAccent('#facc15', 'dark').onFill).toBe('#000000')
    expect(customAccent('#1d4ed8', 'dark').onFill).toBe('#ffffff')
    expect(customAccent('#f472b6', 'light').text).toContain('black')
    expect(customAccent('#f472b6', 'dark').text).toContain('white')
  })
})
