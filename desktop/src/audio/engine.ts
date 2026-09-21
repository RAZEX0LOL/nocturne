import type { Song } from '../core/models'
import { replayGainVolume, type ReplayGainMode } from '../core/replaygain'

/** Те же полосы, что в приложении на iPhone, чтобы настройки звучали одинаково. */
export const EQ_BANDS = [60, 150, 400, 1000, 2400, 6000, 15000] as const

export interface EqSettings {
  enabled: boolean
  gains: number[]
}

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0],
  bass: [6, 4, 1.5, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 2, 4, 6],
  vocal: [-2, -1, 1, 3, 3, 1, 0],
  loudness: [5, 3, 0, -1, 0, 3, 5],
}

/**
 * Звук: обычный <audio> как источник, дальше цепочка Web Audio —
 * эквалайзер из семи фильтров и общий регулятор, через который делаются плавные переходы.
 */
export class AudioEngine {
  private readonly element = new Audio()
  private context?: AudioContext
  private filters: BiquadFilterNode[] = []
  private gainNode?: GainNode
  /** Громкость самого трека после выравнивания: фейды множатся на неё. */
  private trackVolume = 1
  private fadeSeconds = 0
  private eq: EqSettings = { enabled: false, gains: [...EQ_PRESETS.flat!] }

  onEnded?: () => void
  onTimeUpdate?: (position: number, duration: number) => void
  onStateChange?: (playing: boolean, buffering: boolean) => void
  onError?: (message: string) => void

  constructor() {
    this.element.preload = 'auto'
    this.element.crossOrigin = 'anonymous'
    this.element.addEventListener('ended', () => this.onEnded?.())
    this.element.addEventListener('timeupdate', () => {
      this.onTimeUpdate?.(this.element.currentTime, this.element.duration || 0)
      this.applyFade()
    })
    this.element.addEventListener('playing', () => this.onStateChange?.(true, false))
    this.element.addEventListener('pause', () => this.onStateChange?.(false, false))
    this.element.addEventListener('waiting', () => this.onStateChange?.(!this.element.paused, true))
    this.element.addEventListener('error', () => {
      this.onError?.('Не удалось воспроизвести трек. Проверь связь с сервером.')
    })
  }

  /**
   * Граф Web Audio строится при первом запуске: до жеста пользователя браузер держит
   * AudioContext усыплённым, и создавать его раньше бессмысленно.
   */
  private ensureGraph() {
    if (this.context) return
    const context = new AudioContext()
    const source = context.createMediaElementSource(this.element)
    this.filters = EQ_BANDS.map((frequency, index) => {
      const filter = context.createBiquadFilter()
      filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1.1
      filter.gain.value = 0
      return filter
    })
    const gain = context.createGain()
    const chain: AudioNode[] = [source, ...this.filters, gain]
    chain.forEach((node, index) => chain[index + 1] && node.connect(chain[index + 1]!))
    gain.connect(context.destination)
    this.context = context
    this.gainNode = gain
    this.applyEq()
  }

  async load(url: string, song: Song, mode: ReplayGainMode, autoplay: boolean) {
    this.trackVolume = replayGainVolume(mode, song)
    this.element.src = url
    this.element.load()
    if (autoplay) await this.play()
    else this.setGain(this.trackVolume)
  }

  async play() {
    this.ensureGraph()
    if (this.context?.state === 'suspended') await this.context.resume()
    try {
      await this.element.play()
    } catch {
      this.onError?.('Не удалось начать воспроизведение.')
    }
  }

  pause() {
    this.element.pause()
  }

  seek(position: number) {
    if (Number.isFinite(position)) this.element.currentTime = position
  }

  get position() {
    return this.element.currentTime
  }

  get duration() {
    return this.element.duration || 0
  }

  get playing() {
    return !this.element.paused
  }

  /** Системная громкость окна; выравнивание по ReplayGain живёт отдельно, в узле усиления. */
  setVolume(volume: number) {
    this.element.volume = Math.min(Math.max(volume, 0), 1)
  }

  setFadeSeconds(seconds: number) {
    this.fadeSeconds = Math.max(0, seconds)
  }

  setEq(settings: EqSettings) {
    this.eq = settings
    this.applyEq()
  }

  private applyEq() {
    this.filters.forEach((filter, index) => {
      filter.gain.value = this.eq.enabled ? this.eq.gains[index] ?? 0 : 0
    })
  }

  private setGain(value: number) {
    if (this.gainNode) this.gainNode.gain.value = value
    else this.element.volume = Math.min(Math.max(value, 0), 1)
  }

  /** Затухание в конце и нарастание в начале — только если трек заметно длиннее самого перехода. */
  private applyFade() {
    const fade = this.fadeSeconds
    const duration = this.element.duration
    if (!fade || !Number.isFinite(duration) || duration < fade * 3) {
      this.setGain(this.trackVolume)
      return
    }
    const position = this.element.currentTime
    const remaining = duration - position
    const factor = position < fade ? position / fade : remaining < fade ? Math.max(remaining, 0) / fade : 1
    this.setGain(this.trackVolume * factor)
  }
}
