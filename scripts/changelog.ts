#!/usr/bin/env bun
/**
 * Чейнджлог Nocturne (site/changelog.json) для скриптов выпуска.
 *
 *   bun scripts/changelog.ts check <версия> <платформа>   — есть ли запись; без неё выпускать нельзя
 *   bun scripts/changelog.ts notes <версия> <платформа>   — пункты строками «• …» для плашки обновления
 *   bun scripts/changelog.ts release-body                 — описание релиза «updates» на GitHub
 *   bun scripts/changelog.ts testflight <сборка>          — «Что тестировать» в TestFlight (нужны ASC_KEY_ID,
 *                                                           ASC_ISSUER_ID, ASC_KEY_PATH — как у release.sh)
 *
 * Описание релиза на GitHub — и для людей (Markdown), и для сайта: в скрытом комментарии лежит
 * тот же JSON. Сайт берёт его через API GitHub (он отвечает браузеру с CORS, сами файлы релиза — нет),
 * поэтому новая запись появляется на сайте без его пересборки.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PlatformId = 'mac' | 'windows' | 'linux' | 'android' | 'ios'
export interface Change {
  kind: 'new' | 'better' | 'fix'
  text: string
  platforms?: PlatformId[]
}
export interface Release {
  version: string
  date: string
  platforms: PlatformId[]
  summary: string
  changes: Change[]
}

const FILE = join(import.meta.dir, '..', 'site', 'changelog.json')
const KIND = { new: 'Новое', better: 'Лучше', fix: 'Исправлено' } as const
const PLATFORM = { mac: 'Mac', windows: 'Windows', linux: 'Linux', android: 'Android', ios: 'iPhone' } as const
export const MARKER = 'nocturne-changelog'

export function load(): Release[] {
  return (JSON.parse(readFileSync(FILE, 'utf8')) as { releases: Release[] }).releases
}

/** Пункты версии, которые касаются платформы. */
export function changesFor(release: Release, platform: PlatformId): Change[] {
  return release.changes.filter((change) => (change.platforms ?? release.platforms).includes(platform))
}

function find(version: string, platform: PlatformId): Release | undefined {
  const release = load().find((one) => one.version === version)
  return release && release.platforms.includes(platform) && changesFor(release, platform).length ? release : undefined
}

function markdown(releases: Release[]): string {
  const lines = ['Файлы, которые приложение Nocturne скачивает само, и установщики для первой установки.', '', 'Сайт: https://nocturne.razex.online', '']
  for (const release of releases.slice(0, 10)) {
    lines.push(`## ${release.version} — ${release.summary}`, `_${release.date} · ${release.platforms.map((one) => PLATFORM[one]).join(', ')}_`, '')
    for (const change of release.changes) {
      const only = change.platforms ? ` _(${change.platforms.map((one) => PLATFORM[one]).join(', ')})_` : ''
      lines.push(`- **${KIND[change.kind]}:** ${change.text}${only}`)
    }
    lines.push('')
  }
  // Для сайта — весь чейнджлог одной строкой: GitHub прячет HTML-комментарии при показе.
  lines.push(`<!-- ${MARKER} ${JSON.stringify(releases)} -->`)
  return lines.join('\n')
}

async function jwt(): Promise<string> {
  const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_PATH: path } = process.env
  if (!kid || !iss || !path) throw new Error('нужны ASC_KEY_ID, ASC_ISSUER_ID и ASC_KEY_PATH')
  const pem = readFileSync(path.replace(/^~/, process.env.HOME ?? ''), 'utf8')
  const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64')
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const encode = (value: object | Uint8Array) =>
    Buffer.from(value instanceof Uint8Array ? value : JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const body = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ iss, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })}`
  // WebCrypto подписывает ECDSA сразу в формате r||s — именно его и ждёт JWT.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body)))
  return `${body}.${encode(signature)}`
}

async function asc(token: string, method: string, path: string, body?: object) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? {} : ((await response.json()) as { data: any })
}

/** «Что тестировать» у сборки: ждёт, пока App Store Connect её покажет (после загрузки — минуты). */
async function testflight(build: string) {
  const release = find(`1.1.${build}`, 'ios')
  if (!release) throw new Error(`в site/changelog.json нет версии 1.1.${build} для iPhone`)
  const text = [release.summary, '', ...changesFor(release, 'ios').map((change) => `• ${change.text}`)].join('\n').slice(0, 4000)
  const app = process.env.ASC_APP_ID ?? '6814215090'
  for (let attempt = 0; attempt < 40; attempt++) {
    const token = await jwt()
    const builds = await asc(token, 'GET', `/v1/builds?filter[app]=${app}&filter[version]=${build}&limit=1`)
    const id = builds.data[0]?.id
    if (id) {
      const existing = await asc(token, 'GET', `/v1/builds/${id}/betaBuildLocalizations`)
      const localization = existing.data.find((one: any) => one.attributes.locale.startsWith('ru')) ?? existing.data[0]
      if (localization) {
        await asc(token, 'PATCH', `/v1/betaBuildLocalizations/${localization.id}`, {
          data: { type: 'betaBuildLocalizations', id: localization.id, attributes: { whatsNew: text } },
        })
      } else {
        await asc(token, 'POST', '/v1/betaBuildLocalizations', {
          data: { type: 'betaBuildLocalizations', attributes: { locale: 'ru', whatsNew: text }, relationships: { build: { data: { type: 'builds', id } } } },
        })
      }
      console.log(`TestFlight: «Что тестировать» у сборки ${build} заполнено`)
      return
    }
    await Bun.sleep(30_000)
  }
  throw new Error(`сборка ${build} так и не появилась в App Store Connect`)
}

if (import.meta.main) {
  const [command, first, second] = process.argv.slice(2)
  switch (command) {
    case 'check':
      if (!find(first!, second as PlatformId)) {
        console.error(
          `В site/changelog.json нет версии ${first} для «${second}». Сначала напиши, что в ней нового, закоммить — и выпускай.\n` +
            'Версия = 1.1.<число коммитов>: коммит с записью тоже считается.',
        )
        process.exit(1)
      }
      break
    case 'notes': {
      const release = find(first!, second as PlatformId)
      if (release) console.log(changesFor(release, second as PlatformId).map((change) => `• ${change.text}`).join('\n'))
      break
    }
    case 'release-body':
      console.log(markdown(load()))
      break
    case 'testflight':
      await testflight(first!)
      break
    default:
      console.error('команды: check | notes | release-body | testflight')
      process.exit(2)
  }
}
