import { useState, type ReactNode } from 'react'
import { Logo } from './Logo'
import { LanguageSwitch } from './LanguageSwitch'
import { t } from './i18n'

/** Блок с командой и кнопкой «Скопировать»: набирать такое руками никто не станет. */
function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-line bg-[#0e0e14]">
      <button
        onClick={() => {
          void navigator.clipboard.writeText(children).then(
            () => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            },
            () => undefined,
          )
        }}
        className="absolute right-2 top-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent/60 hover:text-ink"
      >
        {copied ? t('Скопировано') : t('Скопировать')}
      </button>
      <pre className="overflow-x-auto p-4 pr-28 text-[13px] leading-relaxed text-ink">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative border-l border-line pb-12 pl-8 last:border-transparent last:pb-0">
      <span className="absolute -left-[17px] top-0 grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-sm font-bold text-accent">
        {n}
      </span>
      <h2 className="text-2xl font-extrabold tracking-tight">{t(title)}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </li>
  )
}

const COMPOSE = (comment: string) => `services:
  navidrome:
    image: deluan/navidrome:latest
    restart: unless-stopped
    ports:
      - "4533:4533"
    environment:
      ND_LOGLEVEL: info
      # ${comment}
      ND_SCANSCHEDULE: 1m
    volumes:
      - ./data:/data
      - ./music:/music:ro`

export function Start() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-night/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 font-extrabold tracking-[0.25em]">
            <Logo />
            <span className="text-sm">NOCTURNE</span>
          </a>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <a href="/#download" className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-night hover:bg-[#b9a3fb]">
              {t('Скачать')}
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('С чего начать')}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('Свой музыкальный сервер за 10 минут')}</h1>
        <p className="mt-5 text-lg text-muted">
          {t('Nocturne — это плеер, а музыка живёт на твоём сервере Navidrome: на домашнем компьютере, NAS или VPS. Ставится он одной командой. Ниже — весь путь от пустой папки до музыки в телефоне.')}
        </p>
        <p className="mt-3 text-[15px] text-muted">
          {t('Нужен компьютер, который может быть включён, когда ты слушаешь музыку, и')}{' '}
          <a className="text-accent underline-offset-4 hover:underline" href="https://docs.docker.com/get-started/get-docker/">
            Docker
          </a>
          {t('. Подойдёт и домашний ПК, и мини-компьютер, и арендованный сервер.')}
        </p>

        <ol className="mt-14">
          <Step n={1} title="Создай папку и файл">
            <p>
              {t('Заведи папку, например')} <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">~/navidrome</code>
              {t(', и положи в неё файл')} <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">docker-compose.yml</code>
            </p>
            <Code>{COMPOSE(t('Пусть сканирует папку каждую минуту: закинул файлы — они сразу в медиатеке.'))}</Code>
            <p>
              {t('Рядом будут две папки:')} <b className="text-ink">music</b> {t('— твоя музыка,')} <b className="text-ink">data</b>{' '}
              {t('— то, что сервер хранит о ней сам (оценки, прослушивания). Музыку он только читает и никогда не меняет.')}
            </p>
          </Step>

          <Step n={2} title="Положи музыку">
            <p>
              {t('Скопируй файлы в папку')} <b className="text-ink">music</b>{t('. Раскладка любая, но удобнее так:')}
            </p>
            <Code>{t('ПРИМЕР_ПАПОК')}</Code>
            <p>
              {t('Navidrome читает теги внутри файлов, а не имена папок. Если теги пустые, альбомы разъедутся — поправить их заранее помогает')}{' '}
              <a className="text-accent underline-offset-4 hover:underline" href="https://picard.musicbrainz.org/">
                MusicBrainz Picard
              </a>
              {t('. Форматы: mp3, flac, m4a, ogg, opus, wav.')}
            </p>
          </Step>

          <Step n={3} title="Запусти сервер">
            <p>{t('В той же папке выполни:')}</p>
            <Code>docker compose up -d</Code>
            <p>
              {t('Открой')} <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">http://localhost:4533</code>{' '}
              {t('— Navidrome попросит придумать логин и пароль администратора. Их же ты введёшь в Nocturne. Первое сканирование большой коллекции занимает несколько минут.')}
            </p>
          </Step>

          <Step n={4} title="Подключи Nocturne">
            <p>
              <a className="text-accent underline-offset-4 hover:underline" href="/#download">
                {t('Скачай приложение')}
              </a>{' '}
              {t('для своей системы и введи три поля: адрес сервера, логин и пароль.')}
            </p>
            <p>
              {t('Если плеер на том же компьютере, адрес —')} <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">http://localhost:4533</code>
              {t('. Если на другом устройстве в той же сети — адрес этого компьютера в сети, например')}{' '}
              <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">http://192.168.1.50:4533</code>
              {t('. Пароль хранится в системном хранилище устройства, а не в файле.')}
            </p>
          </Step>

          <Step n={5} title="Слушай вне дома">
            <p>
              {t('Пока сервер доступен только из домашней сети. Чтобы музыка играла и в дороге, есть три пути — от простого к надёжному:')}
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <b className="text-ink">{t('Скачать заранее.')}</b>{' '}
                {t('Ничего настраивать не нужно: отметь альбомы и плейлисты в Nocturne — они будут играть без сети.')}
              </li>
              <li>
                <b className="text-ink">{t('Своя сеть поверх интернета')}</b> —{' '}
                <a className="text-accent underline-offset-4 hover:underline" href="https://tailscale.com/">
                  Tailscale
                </a>{' '}
                или{' '}
                <a className="text-accent underline-offset-4 hover:underline" href="https://www.zerotier.com/">
                  ZeroTier
                </a>
                {t('. Ставится на сервер и на телефон, адрес остаётся внутренним, наружу ничего не торчит. Самый простой безопасный способ.')}
              </li>
              <li>
                <b className="text-ink">{t('Свой домен.')}</b>{' '}
                {t('Домен, обратный прокси (nginx или Caddy) и сертификат — тогда сервер открыт из любой точки. Сложнее и требует аккуратности: наружу смотрит настоящий сервер.')}
              </li>
            </ul>
          </Step>
        </ol>

        <div className="card mt-16 rounded-2xl p-6">
          <h2 className="text-lg font-bold">{t('Что-то не получилось?')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {t('Самое частое: Navidrome не видит музыку — проверь, что файлы лежат в папке')} <b className="text-ink">music</b>{' '}
            {t('рядом с')} <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">docker-compose.yml</code>{t(', и загляни в')}{' '}
            <code className="rounded bg-panel px-1.5 py-0.5 text-sm text-ink">docker compose logs navidrome</code>{t('. Подробности — в')}{' '}
            <a className="text-accent underline-offset-4 hover:underline" href="https://www.navidrome.org/docs/installation/docker/">
              {t('документации Navidrome')}
            </a>
            .
          </p>
        </div>

        <a href="/#download" className="mt-10 inline-block rounded-2xl bg-accent px-7 py-4 text-base font-bold text-night hover:bg-[#b9a3fb]">
          {t('Скачать Nocturne')}
        </a>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={22} />
            <span>{t('Nocturne — плеер для Navidrome')}</span>
          </a>
          <span>{t('Сделано для своей музыки · {year}', { year: new Date().getFullYear() })}</span>
        </div>
      </footer>
    </>
  )
}
