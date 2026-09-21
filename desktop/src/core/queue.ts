import type { Song } from './models'

/** Очередь воспроизведения. Поведение описано в shared/spec/playback.md. */

export type RepeatMode = 'off' | 'all' | 'one'

export interface Entry {
  id: string
  song: Song
}

export class PlaybackQueue {
  private entries: Entry[]
  /** Порядок до перемешивания: по нему восстанавливается список при выключении shuffle. */
  private naturalEntries: Entry[]
  /** Треки, которые в самом деле играли: по ним работает «назад». */
  private history: string[] = []
  private counter = 0

  position: number
  repeatMode: RepeatMode = 'off'
  private shuffled = false

  constructor(songs: Song[], startAt: number, shuffle: boolean) {
    this.entries = songs.map((song, index) => ({ id: `${index}:${song.id}`, song }))
    this.naturalEntries = this.entries
    this.position = Math.min(Math.max(startAt, 0), Math.max(this.entries.length - 1, 0))
    if (shuffle) this.setShuffle(true)
  }

  get items(): Entry[] {
    return this.entries
  }

  get natural(): Entry[] {
    return this.naturalEntries
  }

  get current(): Entry | undefined {
    return this.entries[this.position]
  }

  get upcoming(): Entry[] {
    return this.position < this.entries.length ? this.entries.slice(this.position + 1) : []
  }

  get shuffle(): boolean {
    return this.shuffled
  }

  setShuffle(enabled: boolean) {
    if (enabled === this.shuffled) return
    const playing = this.current
    this.shuffled = enabled
    if (enabled) {
      const rest = this.entries.filter((entry) => entry.id !== playing?.id)
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[rest[i], rest[j]] = [rest[j]!, rest[i]!]
      }
      this.entries = playing ? [playing, ...rest] : rest
    } else {
      this.entries = this.naturalEntries
    }
    this.position = Math.max(this.entries.findIndex((entry) => entry.id === playing?.id), 0)
    this.history = []
  }

  /** `automatic` — трек кончился сам. Нажатие «вперёд» при повторе одного всё равно листает дальше. */
  nextPosition(automatic: boolean): number | null {
    if (automatic && this.repeatMode === 'one') return this.position
    if (this.position + 1 < this.entries.length) return this.position + 1
    return this.repeatMode === 'all' ? 0 : null
  }

  previousPosition(): number | null {
    const last = this.history[this.history.length - 1]
    if (last !== undefined) {
      const index = this.entries.findIndex((entry) => entry.id === last)
      if (index >= 0) return index
    }
    if (this.position - 1 >= 0) return this.position - 1
    return this.repeatMode === 'all' ? this.entries.length - 1 : null
  }

  jump(to: number) {
    if (to < 0 || to >= this.entries.length) return
    const leaving = this.current?.id
    if (this.history[this.history.length - 1] === this.entries[to]!.id) this.history.pop()
    else if (leaving !== undefined) this.history.push(leaving)
    this.position = to
  }

  insertNext(songs: Song[]) {
    const added = songs.map((song) => ({ id: this.newId(song), song }))
    this.entries = [...this.entries.slice(0, this.position + 1), ...added, ...this.entries.slice(this.position + 1)]
    if (!this.shuffled) this.naturalEntries = this.entries
  }

  append(songs: Song[]) {
    this.entries = [...this.entries, ...songs.map((song) => ({ id: this.newId(song), song }))]
    if (!this.shuffled) this.naturalEntries = this.entries
  }

  /** Играющий трек удалить нельзя: иначе непонятно, что должно зазвучать вместо него. */
  remove(id: string) {
    const index = this.entries.findIndex((entry) => entry.id === id)
    if (index < 0 || index === this.position) return
    this.entries = this.entries.filter((_, i) => i !== index)
    if (!this.shuffled) this.naturalEntries = this.entries
    if (index < this.position) this.position -= 1
    this.history = this.history.filter((entry) => entry !== id)
  }

  moveUpcoming(from: number[], to: number) {
    const base = this.position + 1
    if (base >= this.entries.length) return
    const tail = this.entries.slice(base)
    const moving = [...from].sort((a, b) => a - b).map((index) => tail[index]).filter(Boolean) as Entry[]
    const rest = tail.filter((entry) => !moving.includes(entry))
    rest.splice(Math.min(Math.max(to, 0), rest.length), 0, ...moving)
    this.entries = [...this.entries.slice(0, base), ...rest]
    if (!this.shuffled) this.naturalEntries = this.entries
  }

  private newId(song: Song) {
    return `n${this.counter++}:${song.id}`
  }
}
