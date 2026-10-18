import type { StreamQuality } from './client'

/** Одно прослушивание — одна отметка. Правила проверяются shared/cases/scrobbles.json. */
export interface ScrobblePlay {
  id: string
  account?: string
  playId?: string
  /** Время начала прослушивания: по нему сервер строит историю. */
  time: number
}

const same = (a: ScrobblePlay, b: ScrobblePlay) => a.account === b.account && (a.playId && b.playId ? a.playId === b.playId : a.id === b.id && a.time === b.time)

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

export interface ListeningSession {
  account: string
  songId: string
  playId: string
  startedAt: number
  submitted: boolean
}

/** Пауза и перезапуск продолжают сеанс; новый трек создаёт новый playId. */
export function claimListening(session: ListeningSession, account: string, duration: number, position: number): ScrobblePlay | undefined {
  if (session.account !== account || session.submitted || !Number.isFinite(duration) || duration <= 30 || position < Math.min(duration / 2, 240)) return
  session.submitted = true
  return { account, id: session.songId, playId: session.playId, time: session.startedAt }
}

/** Авария между записью outbox и снимком не должна создавать новую отметку. */
export function recoverListening(session: ListeningSession, pending: ScrobblePlay[]) {
  session.submitted ||= pending.some((play) => play.account === session.account && play.playId === session.playId)
}
