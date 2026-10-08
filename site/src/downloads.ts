/**
 * Ссылки на скачивание. Файлы с постоянными именами лежат в релизе «updates» публичного
 * репозитория: скрипты выпуска перезаписывают их при каждой новой версии, поэтому сайт
 * не нужно пересобирать — кнопки всегда ведут на последнюю сборку.
 */
const REPO = 'RAZEX0LOL/nocturne-releases'
const BASE = `https://github.com/${REPO}/releases/download/updates`

export type PlatformId = 'mac' | 'windows' | 'android' | 'ios' | 'linux'

export interface Platform {
  id: PlatformId
  name: string
  detail: string
  /** Файл в релизе; у iPhone — ссылка в TestFlight, у Linux — пока ничего. */
  file?: string
  href?: string
  action: string
  /** Что сделать при первой установке — то, на чём люди обычно спотыкаются. */
  note: string
}

export const PLATFORMS: Platform[] = [
  {
    id: 'mac',
    name: 'macOS',
    detail: 'Mac на Apple Silicon (M1 и новее)',
    file: 'Nocturne-mac.dmg',
    action: 'Скачать .dmg',
    note: 'Открой образ и перетащи Nocturne в «Программы». Приложение подписано и проверено Apple — откроется без предупреждений.',
  },
  {
    id: 'windows',
    name: 'Windows',
    detail: 'Windows 10 и 11, x64',
    file: 'Nocturne-windows-setup.exe',
    action: 'Скачать установщик',
    note: 'Если SmartScreen предупредит о новом приложении — «Подробнее» → «Выполнить в любом случае».',
  },
  {
    id: 'android',
    name: 'Android',
    detail: 'Android 8 и новее',
    file: 'Nocturne-android.apk',
    action: 'Скачать APK',
    note: 'Открой скачанный файл и разреши установку из браузера — это нужно один раз.',
  },
  {
    id: 'ios',
    name: 'iPhone и iPad',
    detail: 'iOS 17+, бета через TestFlight',
    href: 'https://testflight.apple.com/join/PHtXMJ1u',
    action: 'Открыть в TestFlight',
    note: 'Поставь TestFlight из App Store и открой ссылку на телефоне. Обновления придут через TestFlight.',
  },
  {
    id: 'linux',
    name: 'Linux',
    detail: 'AppImage и .deb',
    action: 'Скоро',
    note: 'Сборка для Linux готовится — появится здесь же.',
  },
]

export const downloadUrl = (platform: Platform) => (platform.file ? `${BASE}/${platform.file}` : platform.href)

/** Система посетителя — чтобы главная кнопка сразу вела куда нужно. */
export function detectPlatform(): PlatformId | undefined {
  const agent = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(agent)) return 'android'
  if (/Windows/.test(agent)) return 'windows'
  if (/Macintosh|Mac OS X/.test(agent)) return 'mac'
  if (/Linux/.test(agent)) return 'linux'
  return undefined
}

export interface Change {
  kind: 'new' | 'better' | 'fix'
  text: string
  platforms?: PlatformId[]
}

export interface ChangelogEntry {
  version: string
  date: string
  platforms: PlatformId[]
  summary: string
  changes: Change[]
}

export interface ReleaseInfo {
  version?: string
  sizes: Partial<Record<PlatformId, number>>
  /** Чейнджлог из описания релиза; нет — сайт показывает вшитую при сборке копию. */
  changelog?: ChangelogEntry[]
}

/** Скрипты выпуска кладут весь чейнджлог в описание релиза скрытым комментарием (scripts/changelog.ts). */
function changelogFrom(body: string | undefined): ChangelogEntry[] | undefined {
  const json = body && /<!-- nocturne-changelog (.*?) -->/s.exec(body)?.[1]
  if (!json) return undefined
  try {
    return JSON.parse(json) as ChangelogEntry[]
  } catch {
    return undefined
  }
}

/**
 * Версия и размеры файлов — из GitHub API (он, в отличие от самих файлов, отвечает браузеру
 * с CORS). Не ответил — кнопки всё равно работают, просто без версии.
 */
export async function loadRelease(): Promise<ReleaseInfo> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/updates`)
  if (!response.ok) return { sizes: {} }
  const release = (await response.json()) as { body?: string; assets: Array<{ name: string; size: number }> }
  const versions = release.assets
    .map((asset) => /^Nocturne-(\d+\.\d+\.\d+)\.apk$/.exec(asset.name)?.[1] ?? /^Nocturne_(\d+\.\d+\.\d+)_/.exec(asset.name)?.[1])
    .filter((version): version is string => !!version)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  const sizes: ReleaseInfo['sizes'] = {}
  for (const platform of PLATFORMS) {
    const asset = release.assets.find((one) => one.name === platform.file)
    if (asset) sizes[platform.id] = asset.size
  }
  return { version: versions[0], sizes, changelog: changelogFrom(release.body) }
}

export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes > 50 * 1024 * 1024 ? 0 : 1)} МБ`
