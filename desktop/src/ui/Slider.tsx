import type { CSSProperties } from 'react'

/**
 * Ползунок: заполненная часть — цвета акцента, как у системного. Обычный <input type="range">
 * этого не умеет, поэтому доля передаётся в CSS переменной --fill.
 */
export function Slider({
  value,
  min = 0,
  max,
  step,
  onChange,
  label,
  disabled,
  className = '',
  vertical = false,
}: {
  value: number
  min?: number
  max: number
  step: number
  onChange: (value: number) => void
  label: string
  disabled?: boolean
  className?: string
  vertical?: boolean
}) {
  const span = max - min || 1
  const fill = `${(Math.min(Math.max(value, min), max) - min) / span * 100}%`
  const style = { '--fill': fill, ...(vertical ? { writingMode: 'vertical-lr', direction: 'rtl' } : {}) } as CSSProperties
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`slider ${vertical ? 'slider-vertical' : ''} ${className}`}
      style={style}
      aria-label={label}
      title={label}
    />
  )
}
