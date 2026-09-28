import type { StreamQuality } from './client'

/** Одно прослушивание — одна отметка. Правила проверяются shared/cases/scrobbles.json. */
export interface ScrobblePlay {
  id: string
  /** Время начала прослушивания: по нему сервер строит историю. */
  time: number
}

const same = (a: ScrobblePlay, b: ScrobblePlay) => a.id === b.id && a.time === b.time

/** Повторную отметку того же прослушивания не добавляем: сервер засчитал бы его дважды. */
export function keepScrobble(queue: ScrobblePlay[], play: ScrobblePlay): ScrobblePlay[] {
  return queue.some((one) => same(one, play)) ? queue : [...queue, play]
}

export function orderedScrobbles(queue: ScrobblePlay[]): ScrobblePlay[] {
  return [...queue].sort((a, b) => a.time - b.time)
}

export function remainingScrobbles(queue: ScrobblePlay[], sent: ScrobblePlay[]): ScrobblePlay[] {
  return queue.filter((one) => !sent.some((done) => same(one, done)))
}

/** Дорогая сеть — мобильная: там по умолчанию экономнее. На десктопе профиль один. */
export function qualityForNetwork(expensive: boolean, wifi: StreamQuality, cellular: StreamQuality): StreamQuality {
  return expensive ? cellular : wifi
}
