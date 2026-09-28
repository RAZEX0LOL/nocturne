import type { Song } from '../core/models'
import { replayGainVolume, type ReplayGainMode } from '../core/replaygain'
import { debugLog } from '../debug'

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

/** Один проигрыватель: играющий и подготовленный меняются местами, поэтому их два. */
class Deck {
  readonly element = new Audio()
  /** Чей трек уже загружен в элемент; адрес потока каждый раз новый, поэтому помним id. */
  songID?: string

  constructor() {
    this.element.preload = 'auto'
    this.element.crossOrigin = 'anonymous'
  }

  hold(songID: string, url: string) {
    this.songID = songID
    this.element.src = url
    this.element.load()
  }

  release() {
    this.songID = undefined
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
  }
}

/**
 * Звук: обычный <audio> как источник, дальше цепочка Web Audio —
 * эквалайзер из семи фильтров и общий регулятор, через который делаются плавные переходы.
 *
 * Элементов два: пока играет один, следующий трек уже качается во второй, и переход
 * между треками не ждёт сети.
 */
export class AudioEngine {
  private readonly decks = [new Deck(), new Deck()]
  private active = 0
  private context?: AudioContext
  private filters: BiquadFilterNode[] = []
  private gainNode?: GainNode
  private analyser?: AnalyserNode
  /** Громкость самого трека после выравнивания: фейды множатся на неё. */
  private trackVolume = 1
  private fadeSeconds = 0
  private volume = 1
  private eq: EqSettings = { enabled: false, gains: [...EQ_PRESETS.flat!] }
  /** Пауза поставлена нами (кнопкой, клавишей, концом очереди), а не движком окна. */
  private pausedOnPurpose = true

  onEnded?: () => void
  onTimeUpdate?: (position: number, duration: number) => void
  onStateChange?: (playing: boolean, buffering: boolean) => void
  onError?: (message: string) => void

  constructor() {
    this.decks.forEach((deck, index) => this.listen(deck, index))
    document.addEventListener('visibilitychange', () => debugLog(`page ${document.visibilityState}`))
  }

  /** События интересны только от играющего элемента: второй в это время молча качает следующий трек. */
  private listen(deck: Deck, index: number) {
    const mine = () => this.active === index
    const element = deck.element
    element.addEventListener('ended', () => mine() && this.onEnded?.())
    element.addEventListener('timeupdate', () => {
      if (!mine()) return
      this.onTimeUpdate?.(element.currentTime, element.duration || 0)
      this.applyFade()
    })
    element.addEventListener('playing', () => {
      if (!mine()) return
      this.onStateChange?.(true, false)
      setTimeout(() => this.logLevel(), 1500)
    })
    element.addEventListener('pause', () => {
      if (!mine()) return
      // Движок окна может сам остановить звук — например, когда окно свернули. Музыка при этом
      // должна продолжаться, поэтому чужую паузу снимаем сразу же.
      if (!this.pausedOnPurpose && !element.ended) {
        debugLog('unexpected pause, resuming')
        void element.play().catch(() => this.onStateChange?.(false, false))
        return
      }
      this.onStateChange?.(false, false)
    })
    element.addEventListener('waiting', () => mine() && this.onStateChange?.(!element.paused, true))
    for (const name of ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'ended', 'error']) {
      element.addEventListener(name, () =>
        debugLog(`audio${index} ${name} t=${element.currentTime.toFixed(1)} ctx=${this.context?.state ?? '-'}`),
      )
    }
    element.addEventListener('error', () => {
      if (!mine()) return
      this.onError?.('Не удалось воспроизвести трек. Проверь связь с сервером.')
    })
  }

  private get deck() {
    return this.decks[this.active]!
  }

  private get spare() {
    return this.decks[1 - this.active]!
  }

  private get element() {
    return this.deck.element
  }

  /**
   * Граф Web Audio строится при первом запуске: до жеста пользователя браузер держит
   * AudioContext усыплённым, и создавать его раньше бессмысленно.
   */
  private ensureGraph() {
    if (this.context) return
    const context = new AudioContext()
    this.filters = EQ_BANDS.map((frequency, index) => {
      const filter = context.createBiquadFilter()
      filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1.1
      filter.gain.value = 0
      return filter
    })
    const gain = context.createGain()
    // Анализатор ничего не меняет в звуке: по нему отладочный журнал видит, что сигнал реально идёт,
    // а не тишина от источника, который Web Audio счёл чужим.
    const analyser = context.createAnalyser()
    this.analyser = analyser
    const chain: AudioNode[] = [...this.filters, gain, analyser]
    chain.forEach((node, index) => chain[index + 1] && node.connect(chain[index + 1]!))
    analyser.connect(context.destination)
    // Оба элемента идут через одну и ту же цепочку: эквалайзер и фейды одинаковы, кто бы ни играл.
    for (const deck of this.decks) context.createMediaElementSource(deck.element).connect(this.filters[0]!)
    context.onstatechange = () => debugLog(`context ${context.state}`)
    this.context = context
    this.gainNode = gain
    this.applyEq()
  }

  async load(url: string, song: Song, mode: ReplayGainMode, autoplay: boolean) {
    this.pausedOnPurpose = true
    if (this.spare.songID === song.id) {
      // Трек уже скачан во второй элемент — играем его, а не начинаем загрузку заново.
      debugLog(`swap to prepared deck ${1 - this.active}`)
      this.deck.release()
      this.active = 1 - this.active
    } else {
      this.deck.hold(song.id, url)
    }
    this.trackVolume = replayGainVolume(mode, song)
    this.setVolume(this.volume)
    if (autoplay) await this.play()
    else this.setGain(this.trackVolume)
  }

  /** Готовит следующий трек заранее; повторный вызов с тем же треком ничего не делает. */
  prepare(url: string, songID: string) {
    if (this.spare.songID === songID || this.deck.songID === songID) return
    debugLog(`prepare next in deck ${1 - this.active}`)
    this.spare.hold(songID, url)
  }

  async play() {
    this.pausedOnPurpose = false
    this.ensureGraph()
    if (this.context?.state === 'suspended') await this.context.resume()
    try {
      await this.element.play()
    } catch {
      this.onError?.('Не удалось начать воспроизведение.')
    }
  }

  pause() {
    this.pausedOnPurpose = true
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
    this.volume = Math.min(Math.max(volume, 0), 1)
    // Подготовленный элемент держим на той же громкости: иначе переход прозвучит скачком.
    for (const deck of this.decks) deck.element.volume = this.volume
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
    else this.element.volume = Math.min(Math.max(value * this.volume, 0), 1)
  }

  /** Уровень сигнала на выходе цепочки — только для отладочного журнала. */
  private logLevel() {
    const analyser = this.analyser
    if (!analyser || this.element.paused) return
    const samples = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    debugLog(`output level rms=${rms.toFixed(4)} src=${this.element.currentSrc.split(':')[0]}`)
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
