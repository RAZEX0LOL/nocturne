import type { ReactNode } from 'react'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { localizePath, t } from './i18n'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-extrabold tracking-tight">{t(title)}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  )
}

export function Support() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-night/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href={localizePath('/')} className="flex items-center gap-2.5 font-extrabold tracking-[0.25em]">
            <Logo />
            <span className="text-sm">NOCTURNE</span>
          </a>
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t('Поддержка')}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('Помощь с Nocturne')}</h1>
        <p className="mt-5 text-lg text-muted">
          {t('Nocturne — плеер для своего сервера Navidrome. Ниже — ответы на то, с чем люди сталкиваются чаще всего, и способ написать, если ответа здесь нет.')}
        </p>

        <Block title="Первый запуск">
          <p>
            {t('Для сетевой медиатеки подключи свой Navidrome на домашнем компьютере, NAS или VPS. Если сервера ещё нет, воспользуйся инструкцией:')}{' '}
            <a className="text-accent underline-offset-4 hover:underline" href={localizePath('/start')}>
              {t('С чего начать')}
            </a>
            .
          </p>
          <p>
            {t('Можно начать без сервера: выбери прослушивание музыки с устройства на экране входа и добавь свои файлы. Или открой «Посмотреть демоверсию», чтобы попробовать плеер на встроенных треках.')}
          </p>
        </Block>

        <Block title="Установить приложение">
          <p>{t('На iPhone и iPad Nocturne Player доступен в App Store. Для Android, Windows, Linux и Mac установщики находятся на главной странице.')}</p>
          <p><a href="https://apps.apple.com/app/id6814215090" className="text-accent underline-offset-4 hover:underline">{t('Открыть в App Store')}</a> · <a href={localizePath('/#download')} className="text-accent underline-offset-4 hover:underline">{t('Все платформы')}</a></p>
        </Block>

        <Block title="Без сервера: музыка с устройства">
          <p>{t('На Android открой «Медиатека → На телефоне» и нажми «Файлы» или «Папка». Выбранная музыка копируется в приложение и играет без интернета. Если сервер уже подключён, отключать его не нужно.')}</p>
          <p>{t('На iPhone и iPad открой раздел музыки на устройстве и добавь файлы или папку. Можно также отправить аудиофайл через «Поделиться → Nocturne». На компьютере добавь файлы или папку в локальную медиатеку.')}</p>
        </Block>

        <Block title="Не подключается к серверу">
          <ul className="ml-5 list-disc space-y-2">
            <li>{t('Проверь адрес целиком, вместе с http:// или https:// и портом, например http://192.168.1.50:4533.')}</li>
            <li>{t('Телефон и сервер должны быть в одной сети, если адрес внутренний.')}</li>
            <li>{t('Логин и пароль — те же, что на странице Navidrome в браузере.')}</li>
            <li>{t('Адреса без шифрования разрешены только для домашней сети: 192.168.x.x, 10.x.x.x и имена .local.')}</li>
          </ul>
        </Block>

        <Block title="Нет текста песни">
          <p>
            {t('Сначала текст берётся с твоего сервера. Если его там нет, включи «Искать тексты в LRCLIB» в настройках — это открытая база, туда уходят только название и исполнитель трека.')}
          </p>
        </Block>

        <Block title="Музыка не играет в фоне или пропадает звук">
          <p>
            {t('Проверь громкость и выбранный аудиовыход, затем перезапусти трек. На Android проверь ограничения работы приложения в фоне и настройки батареи. Для серверного трека попробуй другое качество потока: сервер мог не справиться с перекодированием. Если звук снова пропадёт, напиши модель устройства, версию системы и приложения, а также продолжает ли двигаться время трека.')}
          </p>
        </Block>

        <Block title="Написать">
          <p>
            {t('Опиши, что происходит, на каком устройстве и какая версия приложения (она написана в настройках). Ответ придёт на почту.')}
          </p>
          <p>
            <a className="text-accent underline-offset-4 hover:underline" href="mailto:rasulhattaev715@gmail.com?subject=Nocturne">
              rasulhattaev715@gmail.com
            </a>
          </p>
        </Block>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:px-6">
          <a href={localizePath('/')} className="flex items-center gap-2.5">
            <Logo size={22} />
            <span>{t('Nocturne — плеер для Navidrome')}</span>
          </a>
          <a href={localizePath('/privacy')} className="hover:text-ink">
            {t('Конфиденциальность')}
          </a>
        </div>
      </footer>
    </>
  )
}
