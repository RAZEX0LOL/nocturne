import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Credentials, NavidromeClient, streamParameters, type StreamQuality } from './client'
import { MusicError, type Song } from './models'
import { PlaybackQueue, type RepeatMode } from './queue'
import { replayGainVolume, type ReplayGainMode } from './replaygain'
import { chooseSource, offlinePreparation } from './source'
import { recoverListening, claimListening, type ListeningSession, keepScrobble, orderedScrobbles, qualityForNetwork, remainingScrobbles, type ScrobblePlay } from './scrobbles'

/**
 * Общий контракт из shared/cases. Те же файлы исполняют iOS и Android,
 * поэтому расхождение в поведении видно как одинаково названный провал.
 */
const casesFolder = join(import.meta.dir, '../../../shared/cases')
const load = (file: string) => JSON.parse(readFileSync(join(casesFolder, file), 'utf8'))

describe('credentials', () => {
  for (const item of load('credentials.json').cases) {
    test(item.name, () => {
      if (!item.valid) {
        expect(() => new Credentials(item.server, item.username, item.password)).toThrow(MusicError)
        return
      }
      const credentials = new Credentials(item.server, item.username, item.password)
      if ('insecure' in item) expect(credentials.isInsecure).toBe(item.insecure)
      if ('account' in item) expect(credentials.account).toBe(item.account)
    })
  }
})

describe('requests', () => {
  const file = load('requests.json')

  for (const item of file.cases) {
    test(item.name, async () => {
      const client = new NavidromeClient(new Credentials(item.server, item.username, item.password))
      const repeated: Array<[string, string]> = (item.repeated ?? []).map((one: any) => [one.name, one.value])
      const address = await client.url(item.endpoint, item.parameters ?? {}, repeated, item.salt)
      const url = new URL(address)
      const expected = item.expect

      if (expected.path) expect(decodeURIComponent(url.pathname)).toBe(expected.path)
      for (const [key, value] of Object.entries(expected.query ?? {})) {
        expect(url.searchParams.get(key)).toBe(value as string)
      }
      if (expected.clientNameStartsWith) {
        expect(url.searchParams.get('c')).toStartWith(expected.clientNameStartsWith)
      }
      for (const key of expected.absentParameters ?? []) expect(url.searchParams.get(key)).toBeNull()
      for (const text of expected.absentSubstrings ?? []) expect(address).not.toContain(text)
      for (const [key, values] of Object.entries(expected.repeated ?? {})) {
        expect(url.searchParams.getAll(key)).toEqual(values as string[])
      }
    })
  }

  for (const item of file.streamQuality) {
    test(item.name, () => {
      expect(streamParameters[item.quality as StreamQuality]).toEqual(item.parameters)
    })
  }

  test(file.freshSalt.name, async () => {
    const client = new NavidromeClient(new Credentials(file.freshSalt.server, file.freshSalt.username, file.freshSalt.password))
    expect(await client.url(file.freshSalt.endpoint)).not.toBe(await client.url(file.freshSalt.endpoint))
  })
})

describe('decode', () => {
  for (const item of load('decode.json').cases) {
    test(item.name, () => {
      if (!item.accept) {
        let thrown: unknown
        expect(() => {
          try {
            NavidromeClient.decode(item.json)
          } catch (error) {
            thrown = error
            throw error
          }
        }).toThrow(MusicError)
        for (const text of item.errorMustNotContain ?? []) {
          expect((thrown as MusicError).message).not.toContain(text)
        }
        return
      }
      const response = NavidromeClient.decode(item.json)
      const albums = response.albumList2?.album
      const songs = response.album?.song
      for (const [key, value] of Object.entries(item.expect ?? {})) {
        switch (key) {
          case 'firstAlbumName': expect(albums?.[0]?.name).toBe(value as string); break
          case 'firstAlbumArtist': expect(albums?.[0]?.artist).toBeUndefined(); break
          case 'albumCount': expect(albums?.length ?? 0).toBe(value as number); break
          case 'firstSongDuration': expect(songs?.[0]?.duration).toBe(value as number); break
          case 'firstStarredSongId': expect(response.starred2?.song?.[0]?.id).toBe(value as string); break
          case 'firstGenreValue': expect(response.genres?.genre?.[0]?.value).toBe(value as string); break
          case 'firstLyricStart': expect(response.lyricsList?.structuredLyrics?.[0]?.line?.[0]?.start).toBe(value as number); break
          case 'firstRadioStreamUrl': expect(response.internetRadioStations?.internetRadioStation?.[0]?.streamUrl).toBe(value as string); break
          case 'firstShareUrl': expect(response.shares?.share?.[0]?.url).toBe(value as string); break
          case 'firstSongTrackGain': expect(songs?.[0]?.replayGain?.trackGain).toBe(value as number); break
          case 'firstSongRating': expect(songs?.[0]?.userRating).toBe(value as number); break
          default: throw new Error(`неизвестная проверка ${key}`)
        }
      }
    })
  }
})

describe('replaygain', () => {
  const file = load('replaygain.json')
  for (const item of file.cases) {
    test(item.name, () => {
      const song: Song = { id: 's', title: 'S', replayGain: item.replayGain ?? undefined }
      expect(replayGainVolume(item.mode as ReplayGainMode, song)).toBeCloseTo(item.expected, 2)
    })
  }
})

describe('quality', () => {
  for (const item of load('quality.json').cases) {
    test(item.name, () => {
      expect(qualityForNetwork(item.expensive, item.wifi, item.cellular)).toBe(item.expected)
    })
  }
})

describe('scrobbles', () => {
  const file = load('scrobbles.json')
  for (const item of file.cases) {
    test(item.name, () => {
      const queue = (item.keep as ScrobblePlay[]).reduce(keepScrobble, [] as ScrobblePlay[])
      expect(orderedScrobbles(queue)).toEqual(item.expected)
    })
  }
  for (const item of file.afterSending) {
    test(item.name, () => {
      expect(remainingScrobbles(item.kept, item.sent)).toEqual(item.remaining)
    })
  }
})

describe('queue', () => {
  for (const item of load('queue.json').cases) {
    test(item.name, () => {
      const songs: Song[] = item.songs.map((id: string) => ({ id, title: id }))
      let queue = new PlaybackQueue(songs, item.startAt ?? 0, item.shuffle ?? false)
      const remembered: Record<string, string | undefined> = {}

      for (const step of item.steps ?? []) {
        switch (step.op) {
          case 'roundTrip': queue = PlaybackQueue.restore(JSON.parse(JSON.stringify(queue.snapshot()))); break
          case 'jump': queue.jump(step.pos); break
          case 'jumpNext': {
            const next = queue.nextPosition(false)
            expect(next).not.toBeNull()
            queue.jump(next!)
            break
          }
          case 'jumpPrevious': {
            const previous = queue.previousPosition()
            expect(previous).not.toBeNull()
            queue.jump(previous!)
            break
          }
          case 'setShuffle': queue.setShuffle(step.enabled); break
          case 'setRepeat': queue.repeatMode = step.mode as RepeatMode; break
          case 'insertNext': queue.insertNext(step.songs.map((id: string) => ({ id, title: id }))); break
          case 'append': queue.append(step.songs.map((id: string) => ({ id, title: id }))); break
          case 'removeAt': queue.remove(queue.items[step.pos]!.id); break
          case 'removeCurrent': queue.remove(queue.current!.id); break
          case 'moveUpcoming': queue.moveUpcoming(step.from, step.to); break
          case 'remember':
            remembered[step.as] = step.atCurrent ? queue.current?.song.id : queue.items[step.atPosition]?.song.id
            break
          case undefined: break
          default: throw new Error(`неизвестная операция ${step.op}`)
        }

        for (const [key, value] of Object.entries(step.expect ?? {})) {
          switch (key) {
            case 'comment': break
            case 'currentId': expect(queue.current?.song.id).toBe(value as string); break
            case 'position': expect(queue.position).toBe(value as number); break
            case 'count': expect(queue.items.length).toBe(value as number); break
            case 'itemIds': expect(queue.items.map((entry) => entry.song.id)).toEqual(value as string[]); break
            case 'upcomingIds': expect(queue.upcoming.map((entry) => entry.song.id)).toEqual(value as string[]); break
            case 'nextPositionAutomatic': expect(queue.nextPosition(true)).toBe(value as number | null); break
            case 'nextPositionManual': expect(queue.nextPosition(false)).toBe(value as number | null); break
            case 'isPermutationOfNatural':
              expect(new Set(queue.items.map((entry) => entry.song.id))).toEqual(new Set(queue.natural.map((entry) => entry.song.id)))
              break
            case 'currentIsFirst': expect(queue.position).toBe(0); break
            case 'currentIdIsRemembered': expect(queue.current?.song.id).toBe(remembered[value as string]); break
            default: throw new Error(`неизвестная проверка ${key}`)
          }
        }
      }
    })
  }
})

describe('retries', () => {
  for (const item of load('retries.json').cases) {
    test(item.name, async () => {
      let attempts = 0
      const original = globalThis.fetch
      globalThis.fetch = (async () => {
        attempts += 1
        if (attempts > item.failures) return new Response('{"subsonic-response":{"status":"ok"}}', { status: 200 })
        switch (item.failure) {
          case 'network': throw new TypeError('network error')
          case 'auth': return new Response('{"subsonic-response":{"status":"failed","error":{"code":40}}}', { status: 200 })
          default: return new Response('', { status: 500 })
        }
      }) as unknown as typeof fetch
      try {
        // Паузы в тесте нулевые: проверяем число попыток, а не терпение.
        const client = new NavidromeClient(new Credentials('https://host', 'test', 'test-only'), [0, 0])
        const outcome = await (item.endpoint === 'scrobble' ? client.scrobble('s1', 1000) : client.ping()).then(() => true).catch((error) => {
          expect(error).toBeInstanceOf(MusicError)
          return false
        })
        expect(outcome).toBe(item.succeeds)
        expect(attempts).toBe(item.attempts)
      } finally {
        globalThis.fetch = original
      }
    })
  }
})

describe('source', () => {
  for (const item of load('source.json').cases) {
    test(item.name, () => {
      const availability = { local: new Set<string>(item.local), downloaded: new Set<string>(item.downloaded), online: item.online }
      expect(chooseSource(item.id, availability)).toBe(item.expected)
    })
  }
})

describe('listening lifecycle', () => {
  for (const item of load('lifecycle.json').cases) {
    test(item.name, () => {
      let session: ListeningSession | undefined
      const marks: string[] = []
      const pending: ScrobblePlay[] = []
      for (const event of item.events) {
        if (event.op === 'start') session = { ...event, submitted: false }
        else if (event.op === 'restart') { session = JSON.parse(JSON.stringify(session)) as ListeningSession; recoverListening(session, pending) }
        else if ((event.op === 'check' || event.op === 'queueOnly') && session) {
          const mark = claimListening(event.op === 'queueOnly' ? { ...session } : session, event.account, event.duration, event.position)
          if (mark) { pending.push(mark); marks.push(`${mark.account}:${mark.playId}:${mark.time}`) }
        }
      }
      expect(marks).toEqual(item.expected)
    })
  }
})

describe('offline preparation', () => {
  for (const item of load('preparation.json').cases) test(item.name, () => {
    expect(offlinePreparation(item.songs, item.enabled, item.online, item.unmetered).map((song: { id: string }) => song.id)).toEqual(item.expected)
  })
})
