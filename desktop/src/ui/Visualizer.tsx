import { useEffect, useRef } from 'react'
import { store } from '../state/store'

const BARS = 72
const LOW = 40
const HIGH = 16000

/** Насколько быстро полоса догоняет звук: подъём — заметно, спад — медленнее, без рывков. */
const ATTACK = 0.28
const RELEASE = 0.07

/**
 * Спектр звука: полосы по частотам от 40 Гц до 16 кГц на логарифмической шкале — так бас и
 * верх занимают честную долю ширины, как в студийных анализаторах. Полосы и поднимаются, и
 * опадают плавно, а соседние чуть сглажены между собой — движение «дышит», а не дёргается.
 */
export function Visualizer({ className = '' }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const levels = new Float32Array(BARS)
    let data = new Uint8Array(new ArrayBuffer(0))
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const { size, sampleRate, read } = store.spectrum
      if (data.length !== size) data = new Uint8Array(new ArrayBuffer(size))
      const live = size > 0 && read(data)
      const ratio = window.devicePixelRatio || 1
      const width = element.clientWidth
      const height = element.clientHeight
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio)
        element.height = Math.round(height * ratio)
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      const nyquist = sampleRate / 2
      const gap = 3
      const barWidth = (width - gap * (BARS - 1)) / BARS
      for (let bar = 0; bar < BARS; bar++) {
        let target = 0
        if (live) {
          const from = LOW * (HIGH / LOW) ** (bar / BARS)
          const to = LOW * (HIGH / LOW) ** ((bar + 1) / BARS)
          const start = Math.floor((from / nyquist) * size)
          const end = Math.max(start + 1, Math.ceil((to / nyquist) * size))
          let peak = 0
          let sum = 0
          let count = 0
          for (let bin = start; bin < end && bin < size; bin++) {
            peak = Math.max(peak, data[bin]!)
            sum += data[bin]!
            count++
          }
          // Голый пик скачет от кадра к кадру; смесь пика и среднего стоит спокойнее.
          target = (peak * 0.6 + (sum / Math.max(count, 1)) * 0.4) / 255
        }
        const level = levels[bar]!
        levels[bar] = level + (target - level) * (target > level ? ATTACK : RELEASE)
        // Соседние полосы чуть подтягивают друг друга: силуэт спектра без зубцов.
        const smooth = ((levels[bar - 1] ?? levels[bar]!) + levels[bar]! * 2 + (levels[bar + 1] ?? levels[bar]!)) / 4
        const barHeight = Math.max(2, smooth ** 1.3 * height)
        const x = bar * (barWidth + gap)
        const gradient = context.createLinearGradient(0, height - barHeight, 0, height)
        gradient.addColorStop(0, 'rgba(255,255,255,0.85)')
        gradient.addColorStop(1, 'rgba(255,255,255,0.15)')
        context.fillStyle = gradient
        context.beginPath()
        context.roundRect(x, height - barHeight, barWidth, barHeight, Math.min(barWidth / 2, 3))
        context.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvas} className={className} aria-hidden />
}
