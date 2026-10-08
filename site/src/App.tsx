import { useEffect, useState, type ReactNode } from 'react'
import { PLATFORMS, detectPlatform, downloadUrl, loadRelease, megabytes, type Platform, type PlatformId, type ReleaseInfo } from './downloads'

/** Логотип — те же пять полосок звука, что на экране входа в приложении. */
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {[
        [4, 13, 6],
        [10, 8, 16],
        [16, 3, 26],
        [22, 8, 16],
        [28, 13, 6],
      ].map(([x, y, h]) => (
        <rect key={x} x={x! - 1.6} y={y} width="3.2" height={h} rx="1.6" fill="#a78bfa" />
      ))}
    </svg>
  )
}

function Section({ id, eyebrow, title, lead, children }: { id: string; eyebrow: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
      {lead && <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p>}
      <div className="mt-12">{children}</div>
    </section>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-night/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-extrabold tracking-[0.25em]">
          <Logo />
          <span className="text-sm">NOCTURNE</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#features" className="hover:text-ink">Возможности</a>
          <a href="#screens" className="hover:text-ink">Скриншоты</a>
          <a href="#download" className="hover:text-ink">Скачать</a>
          <a href="#faq" className="hover:text-ink">Вопросы</a>
        </nav>
        <a href="#download" className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-night hover:bg-[#b9a3fb]">
          Скачать
        </a>
      </div>
    </header>
  )
}

function Hero({ main, release }: { main?: Platform; release: ReleaseInfo }) {
  const href = main && downloadUrl(main)
  return (
    <div id="top" className="glow overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        <div className="rise mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {release.version ? `Версия ${release.version}` : 'Mac · Windows · iPhone · Android'}
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
            Твоя музыка.
            <br />
            <span className="bg-gradient-to-r from-[#c4b5fd] via-accent to-[#e3c7a0] bg-clip-text text-transparent">Твоё пространство.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            Nocturne — плеер для своего сервера Navidrome. Красивый, быстрый и родной на каждой системе: начни слушать на компьютере
            и продолжи с того же места на телефоне.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {main && href ? (
              <a href={href} className="w-full rounded-2xl bg-accent px-7 py-4 text-base font-bold text-night shadow-[0_10px_40px_-10px_rgb(167_139_250/0.7)] hover:bg-[#b9a3fb] sm:w-auto">
                {main.id === 'ios' ? 'Установить через TestFlight' : `Скачать для ${main.name}`}
              </a>
            ) : (
              <a href="#download" className="w-full rounded-2xl bg-accent px-7 py-4 text-base font-bold text-night hover:bg-[#b9a3fb] sm:w-auto">
                Скачать
              </a>
            )}
            <a href="#download" className="w-full rounded-2xl border border-line bg-panel/60 px-7 py-4 text-base font-semibold hover:border-accent/60 sm:w-auto">
              Все платформы
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">Бесплатно · без рекламы · без аккаунтов, кроме твоего сервера</p>
        </div>

        {/* Компьютер и телефон рядом — один и тот же трек играет и там, и там. */}
        <div className="rise relative mx-auto mt-16 max-w-5xl pb-10 [animation-delay:150ms]">
          <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]">
            <div className="flex h-8 items-center gap-2 border-b border-line bg-[#1c1c24] px-4">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <img src="/shots/desktop-nowplaying.webp" alt="Nocturne на Mac: полноэкранный плеер с синхронным текстом песни" width={1600} height={1000} className="block w-full" />
          </div>
          <Phone src="/shots/ios-player.webp" alt="Nocturne на iPhone: плеер" className="absolute -bottom-2 right-2 w-[24%] min-w-[110px] sm:right-[-2%]" />
        </div>
      </div>
    </div>
  )
}

function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-[2.2rem] border border-line bg-black p-[3%] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block w-full rounded-[1.8rem]" width={640} height={1391} />
    </div>
  )
}

const FEATURES: Array<{ title: string; text: string; icon: string }> = [
  { icon: '↔', title: 'Продолжи на другом устройстве', text: 'Очередь и место в треке сохраняются на сервере. Выключил музыку на компьютере — телефон предложит продолжить с той же секунды.' },
  { icon: '♪', title: 'Тексты, которые идут за песней', text: 'Синхронный текст подсвечивает строку и сам листается. Нет у сервера — найдётся в открытой базе LRCLIB, даже для треков с кривыми тегами.' },
  { icon: '∞', title: 'Музыка не кончается', text: 'Альбом закончился — дальше играет похожее, как радио по последнему треку. Без пауз между треками и с плавным переходом.' },
  { icon: '⇩', title: 'Офлайн', text: 'Скачай альбомы и плейлисты — они играют в метро и в самолёте. Без сервера тоже можно: слушай файлы с компьютера или телефона.' },
  { icon: '≋', title: 'Звук под себя', text: 'Эквалайзер с пресетами, выравнивание громкости ReplayGain, скорость от 0,5× до 2× и таймер сна, который гасит звук плавно.' },
  { icon: '◐', title: 'Оформление', text: 'Тёмная, светлая и OLED-чёрная темы, цвет акцента из обложки, размер текста, форма углов — подстрой интерфейс под себя.' },
  { icon: '⌘', title: 'Родной на каждой системе', text: 'На Mac — значки SF Symbols и стекло, на Windows — Mica и медиаклавиши, на телефоне — шторка, виджеты и экран блокировки.' },
  { icon: '↻', title: 'Обновляется сам', text: 'Новая версия ставится поверх старой: настройки, загрузки и вход на сервер остаются. На iPhone — через TestFlight.' },
]

function Features() {
  return (
    <Section
      id="features"
      eyebrow="Возможности"
      title="Всё, что нужно от плеера — и ничего лишнего"
      lead="Nocturne подключается к Navidrome (и любому Subsonic-совместимому серверу) и превращает домашнюю медиатеку в музыкальный сервис, который принадлежит тебе."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="card rounded-2xl p-6">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-xl text-accent" aria-hidden="true">
              {feature.icon}
            </div>
            <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{feature.text}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

const SCREEN_TABS: Array<{ id: 'desktop' | 'iphone' | 'android'; label: string }> = [
  { id: 'desktop', label: 'Компьютер' },
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
]

function Screens() {
  const [tab, setTab] = useState<(typeof SCREEN_TABS)[number]['id']>('desktop')
  return (
    <Section id="screens" eyebrow="Скриншоты" title="Один плеер — три характера" lead="Интерфейс подстраивается под систему, а возможности везде одинаковые.">
      <div role="tablist" aria-label="Платформа" className="inline-flex rounded-full border border-line bg-panel p-1">
        {SCREEN_TABS.map((one) => (
          <button
            key={one.id}
            role="tab"
            aria-selected={tab === one.id}
            onClick={() => setTab(one.id)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === one.id ? 'bg-accent text-night' : 'text-muted hover:text-ink'}`}
          >
            {one.label}
          </button>
        ))}
      </div>
      <div className="mt-10">
        {tab === 'desktop' && (
          <div className="grid gap-6 md:grid-cols-2">
            {[
              ['desktop-home', 'Главная: недавно слушал, новинки и любимое'],
              ['desktop-album', 'Альбом: оценки, загрузка и очередь'],
              ['desktop-nowplaying', 'Полноэкранный плеер с текстом и визуализатором'],
              ['desktop-settings-light', 'Светлая тема и настройки оформления'],
            ].map(([name, caption]) => (
              <figure key={name}>
                <img src={`/shots/${name}.webp`} alt={caption} loading="lazy" width={1600} height={1000} className="w-full rounded-xl border border-line" />
                <figcaption className="mt-3 text-sm text-muted">{caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {tab !== 'desktop' && (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {(tab === 'iphone'
              ? [
                  ['ios-home', 'Главная'],
                  ['ios-player', 'Плеер'],
                  ['ios-lyrics', 'Текст песни'],
                  ['ios-search', 'Поиск'],
                ]
              : [
                  ['android-home', 'Главная'],
                  ['android-player', 'Плеер'],
                  ['android-lyrics', 'Текст песни'],
                ]
            ).map(([name, caption]) => (
              <figure key={name}>
                <Phone src={`/shots/${name}.webp`} alt={caption!} />
                <figcaption className="mt-3 text-center text-sm text-muted">{caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

function PlatformIcon({ id }: { id: PlatformId }) {
  const paths: Record<PlatformId, ReactNode> = {
    mac: <path d="M16.4 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8C7.5 7.6 6 8.5 5.2 10c-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7 1.4 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.4-.9-2.4-3.9ZM14.2 6c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.8 1 .1 2.1-.5 2.8-1.3Z" />,
    ios: <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v15h8V4H8Zm4 16.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />,
    windows: <path d="M3 5.5 10.4 4.5v7H3v-6Zm8.4-1.2L21 3v8.5h-9.6V4.3ZM3 12.5h7.4v7L3 18.5v-6Zm8.4 0H21V21l-9.6-1.3v-7.2Z" />,
    android: <path d="M7 9h10v8a1 1 0 0 1-1 1h-1v3h-2v-3h-2v3H9v-3H8a1 1 0 0 1-1-1V9Zm-2.5 0h1v6h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm14 0h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1V9ZM8.2 4.2l.9-.5 1 1.8A5 5 0 0 1 12 5c.7 0 1.3.1 1.9.4l1-1.7.9.5-1 1.6A4.4 4.4 0 0 1 17 8H7a4.4 4.4 0 0 1 2.2-2.2l-1-1.6ZM10 6.5a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Zm4 0a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Z" />,
    linux: <path d="M12 2c2.2 0 3.4 1.9 3.4 4.4 0 1.5.6 2.7 1.6 4 1.4 1.8 2.5 3.8 2.5 5.9 0 1.1-.6 1.6-1.4 1.8-.3 1.8-1.7 3.4-3.6 3.4-1 0-1.6-.5-2.5-.5s-1.5.5-2.5.5c-1.9 0-3.3-1.6-3.6-3.4-.8-.2-1.4-.7-1.4-1.8 0-2.1 1.1-4.1 2.5-5.9 1-1.3 1.6-2.5 1.6-4C8.6 3.9 9.8 2 12 2Zm-1.5 4.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Zm3 0a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6ZM12 9.2c-.8 0-1.6.4-1.6.8s.8.9 1.6.9 1.6-.5 1.6-.9-.8-.8-1.6-.8Z" />,
  }
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
      {paths[id]}
    </svg>
  )
}

function Download({ main, release }: { main?: PlatformId; release: ReleaseInfo }) {
  return (
    <Section id="download" eyebrow="Скачать" title="Поставь на все свои устройства" lead={release.version ? `Сейчас актуальна версия ${release.version}. Дальше приложение обновится само.` : 'Дальше приложение обновится само.'}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const href = downloadUrl(platform)
          const size = release.sizes[platform.id]
          const highlighted = platform.id === main
          return (
            <article key={platform.id} className={`card flex flex-col rounded-2xl p-6 ${highlighted ? 'ring-2 ring-accent/70' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-ink">
                  <PlatformIcon id={platform.id} />
                </span>
                <div>
                  <h3 className="text-lg font-bold">{platform.name}</h3>
                  <p className="text-sm text-muted">{platform.detail}</p>
                </div>
                {highlighted && <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">Твоя система</span>}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{platform.note}</p>
              {href ? (
                <a href={href} className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-bold ${highlighted ? 'bg-accent text-night hover:bg-[#b9a3fb]' : 'border border-line hover:border-accent/60'}`}>
                  {platform.action}
                  {size ? <span className="font-medium opacity-70"> · {megabytes(size)}</span> : null}
                </a>
              ) : (
                <span className="mt-6 rounded-xl border border-dashed border-line px-4 py-3 text-center text-sm font-semibold text-muted">{platform.action}</span>
              )}
            </article>
          )
        })}
      </div>
      <p className="mt-6 text-sm text-muted">
        Все файлы — на{' '}
        <a className="text-accent underline-offset-4 hover:underline" href="https://github.com/RAZEX0LOL/nocturne-releases/releases/tag/updates">
          GitHub
        </a>
        . Каждое обновление подписано: приложение не поставит файл, который подменили по дороге.
      </p>
    </Section>
  )
}

const FAQ: Array<[string, ReactNode]> = [
  [
    'Что такое Navidrome и зачем он нужен?',
    <>
      Navidrome — бесплатный сервер для своей музыкальной коллекции: ставится на домашний компьютер, NAS или VPS и раздаёт музыку по сети.
      Nocturne — плеер к нему. Подойдёт и любой другой сервер с API Subsonic.{' '}
      <a className="text-accent underline-offset-4 hover:underline" href="https://www.navidrome.org/docs/installation/">
        Как поставить Navidrome
      </a>
    </>,
  ],
  ['Можно без сервера?', 'Да. На компьютере и Android можно слушать свои файлы прямо с устройства — сервер не нужен. На iPhone есть демоверсия, чтобы посмотреть плеер.'],
  ['Как подключиться?', 'Открой приложение, введи адрес сервера, логин и пароль Navidrome. Пароль хранится в системном хранилище — Связке ключей, Keystore или менеджере учётных данных Windows.'],
  ['Как приходят обновления?', 'Приложение само проверяет новую версию, скачивает её и ставит поверх — настройки, загрузки и вход остаются. На Android система один раз попросит разрешить установку из Nocturne. На iPhone обновления приходят через TestFlight.'],
  ['Почему macOS или Windows предупреждают при первом запуске?', 'Сборки пока не подписаны сертификатами Apple и Microsoft — это платно. На Mac: правый клик по приложению → «Открыть». На Windows: «Подробнее» → «Выполнить в любом случае». Нужно один раз.'],
  ['Сколько стоит?', 'Нисколько. Без рекламы, без подписок и без сбора данных: приложение общается только с твоим сервером (и с LRCLIB, если ты сам включишь поиск текстов).'],
]

function Faq() {
  return (
    <Section id="faq" eyebrow="Вопросы" title="Частые вопросы">
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {FAQ.map(([question, answer]) => (
          <details key={question} className="group bg-panel/40 open:bg-panel/80">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left font-semibold">
              {question}
              <span className="text-xl text-muted transition group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="px-6 pb-6 text-[15px] leading-relaxed text-muted">{answer}</div>
          </details>
        ))}
      </div>
    </Section>
  )
}

export function App() {
  const [release, setRelease] = useState<ReleaseInfo>({ sizes: {} })
  const [platform] = useState(detectPlatform)
  useEffect(() => {
    loadRelease().then(setRelease, () => undefined)
  }, [])
  const main = PLATFORMS.find((one) => one.id === platform && downloadUrl(one))
  return (
    <>
      <Header />
      <main>
        <Hero main={main} release={release} />
        <Features />
        <Screens />
        <Download main={main?.id} release={release} />
        <Faq />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
            <span>Nocturne — плеер для Navidrome</span>
          </div>
          <span>Сделано для своей музыки · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </>
  )
}
