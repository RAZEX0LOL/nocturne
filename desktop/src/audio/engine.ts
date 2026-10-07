import type { Song } from '../core/models'
import { replayGainVolume, type ReplayGainMode } from '../core/replaygain'
import { debugLog } from '../debug'
import { t } from '../i18n'

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
  /** Своя громкость в Web Audio: выравнивание ReplayGain и кроссфейд, до общего эквалайзера. */
  level?: GainNode
  /** Громкость этого трека после выравнивания. */
  trackVolume = 1

  /**
   * `shared` — элемент идёт через Web Audio (эквалайзер, фейды), и ему нужен CORS. Интернет-радио
   * CORS обычно не отдаёт: такой поток через Web Audio звучал бы тишиной, поэтому для него — свой
   * элемент мимо эквалайзера.
   */
  constructor(shared = true) {
    this.element.preload = 'auto'
    if (shared) this.element.crossOrigin = 'anonymous'
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

/** Кривая равной мощности: в середине кроссфейда громкость не проваливается, как при линейной. */
export function crossfadeCurve(points: number, fadeIn: boolean, from = 1): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(points * 4))
  for (let index = 0; index < points; index++) {
    const progress = index / (points - 1)
    curve[index] = from * (fadeIn ? Math.sin((progress * Math.PI) / 2) : Math.cos((progress * Math.PI) / 2))
  }
  return curve
}

/**
 * Когда начинать следующий трек: с кроссфейдом — за его длительность до конца (не больше трети
 * трека); встык — в самый конец, а стык сглаживается микрокроссфейдом, чтобы не было щелчка.
 */
export function transitionPlan(fadeSeconds: number, duration: number, remaining: number) {
  if (fadeSeconds > 0) {
    const lead = Math.min(fadeSeconds, duration / 3)
    return remaining <= lead ? { delay: 0, overlap: Math.max(remaining, 0.05) } : undefined
  }
  // «Часы» тикают раз в 40 мс — точнее не попасть. Поэтому, когда до конца остаётся меньше
  // четверти секунды, ставим таймер ровно на момент окончания минус длину микрокроссфейда.
  if (remaining > AudioEngine.GAPLESS_WINDOW) return undefined
  return { delay: Math.max(remaining - AudioEngine.SEAM, 0), overlap: AudioEngine.SEAM }
}

/**
 * Звук: обычный <audio> как источник, дальше цепочка Web Audio —
 * у каждого элемента своя громкость (ReplayGain и кроссфейд), потом общий эквалайзер из семи фильтров.
 *
 * Элементов два: пока играет один, следующий трек уже качается во второй. Ближе к концу трека
 * второй элемент запускается заранее — с кроссфейдом или встык, без паузы между треками.
 */
export class AudioEngine {
  private readonly decks = [new Deck(), new Deck(), new Deck(false)]
  private active = 0
  private context?: AudioContext
  private filters: BiquadFilterNode[] = []
  private analyser?: AnalyserNode
  private fadeSeconds = 0
  /** Идёт переход: уходящий элемент ещё звучит (затихает), новый уже играет. */
  private transition?: { from: number; timer: ReturnType<typeof setTimeout> }
  /** Затухание в конце очереди уже запущено — следующего трека нет. */
  private fadingOut = false
  private clock?: ReturnType<typeof setInterval>

  /** За сколько секунд до конца ставить точный таймер стыка. */
  static readonly GAPLESS_WINDOW = 0.25
  /** Микрокроссфейд на стыке без паузы: убирает щелчок, на слух не заметен. */
  static readonly SEAM = 0.03
  private seamTimer?: ReturnType<typeof setTimeout>
  private static readonly TICK_MS = 40
  private volume = 1
  private eq: EqSettings = { enabled: false, gains: [...EQ_PRESETS.flat!] }
  /** Пауза поставлена нами (кнопкой, клавишей, концом очереди), а не движком окна. */
  private pausedOnPurpose = true

  onEnded?: () => void
  /**
   * Переход начался раньше конца трека: следующий уже звучит. Плеер должен сдвинуть очередь
   * и вызвать load() с этим же треком — элемент при этом не перезапускается.
   */
  onAdvance?: () => void
  /** Можно ли переходить к подготовленному треку сейчас (не стоит ли таймер сна «в конце трека»). */
  canAdvance?: (songID: string) => boolean
  onTimeUpdate?: (position: number, duration: number) => void
  onStateChange?: (playing: boolean, buffering: boolean) => void
  onError?: (message: string) => void

  constructor() {
    this.decks.forEach((deck, index) => this.listen(deck, index))
    // Сквозные тесты смотрят на элементы напрямую; в сборку это не попадает.
    if (import.meta.env.DEV) (window as any).__engine = this
    document.addEventListener('visibilitychange', () => debugLog(`page ${document.visibilityState}`))
  }

  /** События интересны только от играющего элемента: второй в это время молча качает следующий трек. */
  private listen(deck: Deck, index: number) {
    const mine = () => this.active === index
    const element = deck.element
    element.addEventListener('ended', () => {
      // Уходящий элемент доиграл под новым — отпускаем его, переход закончен.
      if (this.transition?.from === index) return this.finishTransition()
      if (mine()) this.onEnded?.()
    })
    element.addEventListener('timeupdate', () => {
      if (!mine()) return
      this.onTimeUpdate?.(element.currentTime, element.duration || 0)
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
      this.onError?.(t('Не удалось воспроизвести трек. Проверь связь с сервером.'))
    })
  }

  private get deck() {
    return this.decks[this.active]!
  }

  /** Второй из двух обычных элементов; радио (третий) в смене треков не участвует. */
  private get spare() {
    return this.decks[this.active === 0 ? 1 : 0]!
  }

  private static readonly RADIO = 2

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
    // Анализатор ничего не меняет в звуке: по нему отладочный журнал видит, что сигнал реально идёт,
    // а не тишина от источника, который Web Audio счёл чужим, — и по нему рисуется визуализатор.
    const analyser = context.createAnalyser()
    this.analyser = analyser
    const chain: AudioNode[] = [...this.filters, analyser]
    chain.forEach((node, index) => chain[index + 1] && node.connect(chain[index + 1]!))
    analyser.connect(context.destination)
    // Оба элемента идут в один эквалайзер, но каждый — через свою громкость: на кроссфейде
    // один затихает, другой нарастает.
    for (const deck of this.decks.slice(0, AudioEngine.RADIO)) {
      deck.level = context.createGain()
      deck.level.gain.value = deck.trackVolume
      context.createMediaElementSource(deck.element).connect(deck.level)
      deck.level.connect(this.filters[0]!)
    }
    context.onstatechange = () => debugLog(`context ${context.state}`)
    this.context = context
    this.applyEq()
  }

  async load(url: string, song: Song, mode: ReplayGainMode, autoplay: boolean) {
    // Переход уже запустил этот трек заранее — он играет, трогать его не нужно.
    if (this.transition && this.deck.songID === song.id && !this.element.paused) {
      this.deck.trackVolume = replayGainVolume(mode, song)
      return
    }
    this.finishTransition()
    this.fadingOut = false
    this.pausedOnPurpose = true
    const radio = song.id.startsWith('radio:')
    if (radio || this.active === AudioEngine.RADIO) {
      // Переход на радио или с него: прежний элемент замолкает, новый начинает с чистого листа.
      this.deck.release()
      this.active = radio ? AudioEngine.RADIO : 0
      this.deck.hold(song.id, url)
    } else if (this.spare.songID === song.id) {
      // Трек уже скачан во второй элемент — играем его, а не начинаем загрузку заново.
      debugLog(`swap to prepared deck ${1 - this.active}`)
      this.deck.release()
      this.active = 1 - this.active
    } else {
      this.deck.hold(song.id, url)
    }
    this.deck.trackVolume = replayGainVolume(mode, song)
    this.setLevel(this.deck, this.deck.trackVolume)
    this.setVolume(this.volume)
    if (autoplay) await this.play()
  }

  // MARK: - Переходы между треками

  /** Часы переходов идут, пока что-то играет: раз в 40 мс смотрят, сколько осталось до конца. */
  private startClock() {
    this.clock ??= setInterval(() => this.tick(), AudioEngine.TICK_MS)
  }

  private stopClock() {
    clearInterval(this.clock)
    this.clock = undefined
  }

  private tick() {
    const element = this.element
    if (!this.context || this.active === AudioEngine.RADIO || element.paused || this.transition) return
    const duration = element.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    const remaining = duration - element.currentTime
    const spare = this.spare
    const ready = !!spare.songID && spare.element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    if (ready && this.canAdvance?.(spare.songID!) !== false) {
      if (this.seamTimer) return
      const plan = transitionPlan(this.fadeSeconds, duration, remaining)
      if (!plan) return
      if (plan.delay === 0) this.startTransition(plan.overlap)
      else {
        this.seamTimer = setTimeout(() => {
          this.seamTimer = undefined
          if (!this.element.paused && !this.transition) this.startTransition(plan.overlap)
        }, plan.delay * 1000)
      }
      return
    }
    // Дальше играть нечего — с плавными переходами конец очереди затихает, а не обрывается.
    if (!spare.songID && this.fadeSeconds > 0 && !this.fadingOut && remaining <= Math.min(this.fadeSeconds, duration / 3)) {
      this.fadingOut = true
      this.rampLevel(this.deck, crossfadeCurve(64, false, this.deck.level?.gain.value ?? 1), remaining)
    }
  }

  /** Запускает подготовленный трек с кроссфейдом длиной `overlap` секунд (на стыке — микрокроссфейд). */
  private startTransition(overlap: number) {
    const from = this.active
    const outgoing = this.deck
    const incoming = this.spare
    debugLog(`transition ${overlap ? `crossfade ${overlap.toFixed(1)}s` : 'gapless'} → deck ${1 - from}`)
    incoming.element.currentTime = 0
    this.setLevel(incoming, 0)
    this.rampLevel(incoming, crossfadeCurve(64, true, incoming.trackVolume), overlap)
    this.rampLevel(outgoing, crossfadeCurve(64, false, outgoing.level?.gain.value ?? outgoing.trackVolume), overlap)
    void incoming.element.play().catch(() => this.onError?.(t('Не удалось начать воспроизведение.')))
    this.active = 1 - from
    if (import.meta.env.DEV) (window as any).__transitions = [...((window as any).__transitions ?? []), { at: performance.now(), overlap, outgoingLeft: outgoing.element.duration - outgoing.element.currentTime }]
    // Уходящий отпускается, когда доиграет; таймер — на случай, если «ended» не придёт.
    const timer = setTimeout(() => this.finishTransition(), (overlap + 1.5) * 1000)
    this.transition = { from, timer }
    this.onAdvance?.()
  }

  private finishTransition() {
    clearTimeout(this.seamTimer)
    this.seamTimer = undefined
    const transition = this.transition
    if (!transition) return
    this.transition = undefined
    clearTimeout(transition.timer)
    this.decks[transition.from]!.release()
    const pending = this.pendingPrepare
    this.pendingPrepare = undefined
    if (pending) this.prepare(pending.url, pending.song, pending.mode)
  }

  private setLevel(deck: Deck, value: number) {
    const level = deck.level
    if (!level || !this.context) return
    level.gain.cancelScheduledValues(this.context.currentTime)
    level.gain.value = value
  }

  private rampLevel(deck: Deck, curve: Float32Array<ArrayBuffer>, seconds: number) {
    const level = deck.level
    if (!level || !this.context) return
    const now = this.context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.value = curve[0]!
    level.gain.setValueCurveAtTime(curve, now + 0.005, Math.max(seconds, 0.05))
  }

  /**
   * Отпускает файл трека, если он загружен в один из элементов: на Windows открытый файл
   * не удалить. Если это играющий трек, звук останавливается — его файл сейчас исчезнет.
   */
  forget(songID: string) {
    for (const deck of this.decks) {
      if (deck.songID !== songID) continue
      if (deck === this.deck) this.pausedOnPurpose = true
      deck.release()
    }
  }

  /** Подготовка, отложенная до конца перехода: второй элемент ещё доигрывает уходящий трек. */
  private pendingPrepare?: { url: string; song: Song; mode: ReplayGainMode }

  /** Готовит следующий трек заранее; повторный вызов с тем же треком ничего не делает. */
  prepare(url: string, song: Song, mode: ReplayGainMode) {
    if (this.active === AudioEngine.RADIO || song.id.startsWith('radio:')) return
    if (this.transition) {
      this.pendingPrepare = { url, song, mode }
      return
    }
    // Громкость по ReplayGain известна заранее — кроссфейд нарастает сразу к нужному уровню.
    this.spare.trackVolume = replayGainVolume(mode, song)
    if (this.spare.songID === song.id || this.deck.songID === song.id) return
    debugLog(`prepare next in deck ${1 - this.active}`)
    this.spare.hold(song.id, url)
  }

  async play() {
    this.pausedOnPurpose = false
    this.ensureGraph()
    this.startClock()
    if (this.context?.state === 'suspended') await this.context.resume()
    try {
      await this.element.play()
    } catch {
      this.onError?.(t('Не удалось начать воспроизведение.'))
    }
  }

  pause() {
    this.pausedOnPurpose = true
    // Пауза посреди кроссфейда — уходящий трек больше не нужен, иначе он доиграл бы в тишине паузы.
    this.finishTransition()
    this.stopClock()
    this.element.pause()
  }

  seek(position: number) {
    if (!Number.isFinite(position)) return
    // Перемотали назад из затухания в конце очереди — громкость возвращается.
    if (this.fadingOut) {
      this.fadingOut = false
      this.setLevel(this.deck, this.deck.trackVolume)
    }
    this.element.currentTime = position
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

  /** Системная громкость окна; выравнивание по ReplayGain и кроссфейд живут отдельно, в узлах элементов. */
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


  /**
   * Спектр на выходе эквалайзера для визуализатора: громкость по частотам, 0–255.
   * Радио идёт мимо Web Audio, и для него спектра нет — тогда false.
   */
  readSpectrum(into: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || this.active === AudioEngine.RADIO || this.element.paused) return false
    this.analyser.getByteFrequencyData(into)
    return true
  }

  get spectrumSize() {
    return this.analyser?.frequencyBinCount ?? 0
  }

  get sampleRate() {
    return this.context?.sampleRate ?? 44100
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
}
