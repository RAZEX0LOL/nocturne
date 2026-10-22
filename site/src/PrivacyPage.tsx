import type { ReactNode } from 'react'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { t } from './i18n'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-extrabold tracking-tight">{t(title)}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  )
}

export function Privacy() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-night/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 font-extrabold tracking-[0.25em]">
            <Logo />
            <span className="text-sm">NOCTURNE</span>
          </a>
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('Конфиденциальность')}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('Политика конфиденциальности')}</h1>
        <p className="mt-5 text-lg text-muted">
          {t('Коротко: Nocturne не собирает о тебе никаких данных. У приложения нет серверов, аккаунтов, аналитики и рекламы. Музыка и всё, что с ней связано, остаются между твоим устройством и твоим сервером.')}
        </p>
        <p className="mt-3 text-sm text-muted">{t('Действует с 22 октября 2026 года.')}</p>

        <Block title="Какие данные мы собираем">
          <p>
            {t('Никаких. У Nocturne нет собственного сервера, который мог бы что-то получать: разработчик не видит ни твою медиатеку, ни то, что ты слушаешь, ни адрес твоего сервера.')}
          </p>
        </Block>

        <Block title="Куда приложение обращается">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <b className="text-ink">{t('Твой сервер Navidrome')}</b>{' '}
              {t('— адрес, логин и пароль вводишь ты. Туда уходят запросы за музыкой, обложками и плейлистами, а также отметки о прослушивании, оценки и очередь. Этим сервером распоряжаешься ты.')}
            </li>
            <li>
              <b className="text-ink">LRCLIB</b>{' '}
              {t('— открытая база текстов песен. Приложение обращается к ней, только если ты включил поиск текстов в настройках. Отправляются название трека, исполнитель и длительность — без сведений о тебе и твоём сервере.')}
            </li>
            <li>
              <b className="text-ink">GitHub</b>{' '}
              {t('— оттуда скачиваются обновления на компьютере и Android. Это обычная загрузка файла, без учётных записей. В App Store обновления приходят через Apple.')}
            </li>
            <li>
              <b className="text-ink">Discord</b>{' '}
              {t('— только на компьютере и только если ты включил статус. Название трека передаётся запущенному на том же компьютере приложению Discord, напрямую, без интернета.')}
            </li>
            <li>
              {t('Встроенное окно браузера (добавление музыки из интернета) открывает те сайты, которые ты сам в нём открываешь, и ведёт себя как обычный браузер.')}
            </li>
          </ul>
        </Block>

        <Block title="Что хранится на устройстве">
          <p>
            {t('Пароль от сервера — в системном хранилище устройства: Связке ключей на Apple, Keystore на Android, менеджере учётных данных на Windows. Скачанная музыка, обложки и настройки лежат в папке приложения. Всё это исчезает вместе с приложением при удалении.')}
          </p>
        </Block>

        <Block title="Дети">
          <p>{t('Приложение не предназначено специально для детей и не собирает данные ни у кого, включая детей.')}</p>
        </Block>

        <Block title="Изменения">
          <p>
            {t('Если что-то в этой политике изменится, новая версия появится на этой странице с новой датой. Приложение не начнёт собирать данные молча.')}
          </p>
        </Block>

        <Block title="Связаться">
          <p>
            {t('Вопросы о приложении и о приватности — на странице поддержки:')}{' '}
            <a className="text-accent underline-offset-4 hover:underline" href="/support">
              nocturne.razex.online/support
            </a>
            .
          </p>
        </Block>
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
