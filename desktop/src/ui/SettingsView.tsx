import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { EQ_BANDS, EQ_PRESETS } from '../audio/engine'
import { store, useStore } from '../state/store'
import { Icon, type IconName } from './Icon'
import { Slider } from './Slider'
import { AppearanceSettings } from './AppearanceSettings'
import { askText } from './Dialogs'
import { appVersion, isDesktop } from '../platform'
import { isMac } from '../native'
import { t } from '../i18n'

/** Строка настроек — как SettingsCard в «Параметрах»: значок, название, пояснение, управление справа. */
function SettingsCard({
  icon,
  title,
  description,
  children,
  plain = false,
}: {
  icon: IconName
  title: string
  description?: string
  children?: ReactNode
  /** Внутри другой карточки: без своего фона и рамки. */
  plain?: boolean
}) {
  return (
    <div className={`settings-card ${plain ? '' : 'card'}`}>
      <Icon name={icon} size={18} className="text-secondary" />
      <div className="min-w-0 flex-1">
        <div>{title}</div>
        {description && <div className="text-xs text-secondary">{description}</div>}
      </div>
      {children}
    </div>
  )
}

/** Переключатель с подписью состояния слева — как в «Параметрах» Windows и «Настройках» Mac. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <>
      <span className="text-sm text-secondary">{checked ? t('Вкл.') : t('Откл.')}</span>
      <input type="checkbox" className="toggle" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
    </>
  )
}

/** Подсказка с сочетаниями в обозначениях своей системы: ⌘⌥ на Mac, Ctrl+Alt+ на остальных. */
function shortcutHint() {
  const mod = isMac ? '⌘⌥' : 'Ctrl+Alt+'
  return t('Работают в любой программе: {mod}Пробел — пауза, {mod}→ и ← — трек, {mod}↑ и ↓ — громкость.', { mod })
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="px-1 pb-1 pt-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Настройки — отдельная страница, как в приложениях Windows, а не всплывающее окно поверх. */
export function SettingsView() {
  const { settings, serverless, client } = useStore()
  const [tab, setTab] = useState<'appearance' | 'playback' | 'app'>('appearance')

  return (
    <div className="max-w-4xl space-y-1">
      <h1 className="page-title pb-2">{t('Настройки')}</h1>
      <div className="settings-tabs" role="tablist">
        {(
          [
            ['appearance', t('Оформление')],
            ['playback', t('Звук и воспроизведение')],
            ['app', t('Приложение')],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="settings-tab">
            {label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && <AppearanceSettings />}

      {tab === 'playback' && (
      <>
      <Group title={t('Воспроизведение')}>
        <SettingsCard icon="download" title={t('Качество потока')} description={t('Оригинал не сжимается, MP3 экономит трафик.')}>
          <select
            value={settings.quality}
            onChange={(event) => store.update({ quality: event.target.value as typeof settings.quality })}
            className="select"
          >
            <option value="original">{t('Оригинал (без сжатия)')}</option>
            <option value="mp3High">{t('Высокое · MP3 320')}</option>
            <option value="mp3Medium">{t('Среднее · MP3 192')}</option>
            <option value="mp3Low">{t('Экономное · MP3 128')}</option>
          </select>
        </SettingsCard>

        <SettingsCard icon="volume" title={t('Выравнивание громкости')} description={t('ReplayGain из тегов файла.')}>
          <select
            value={settings.replayGain}
            onChange={(event) => store.update({ replayGain: event.target.value as typeof settings.replayGain })}
            className="select"
          >
            <option value="off">{t('Выключено')}</option>
            <option value="track">{t('По треку')}</option>
            <option value="album">{t('По альбому')}</option>
            <option value="auto">{t('Авто: альбом подряд — по альбому')}</option>
          </select>
        </SettingsCard>

        <SettingsCard
          icon="shuffle"
          title={t('Кроссфейд')}
          description={t('Треки плавно перетекают друг в друга. «Нет» — следующий трек начинается встык, без паузы.')}
        >
          <span className="w-12 text-right text-sm tabular-nums text-secondary">
            {settings.fadeSeconds ? t('{n} с', { n: settings.fadeSeconds }) : t('Нет')}
          </span>
          <Slider
            value={settings.fadeSeconds}
            min={0}
            max={12}
            step={1}
            onChange={(fadeSeconds) => store.update({ fadeSeconds })}
            label={t('Плавные переходы, сек')}
            className="w-40"
          />
        </SettingsCard>
        <SettingsCard
          icon="radio"
          title={t('Бесконечное воспроизведение')}
          description={t('Очередь закончилась — дальше играет похожая музыка, как радио по последнему треку.')}
        >
          <Toggle checked={settings.autoplaySimilar} onChange={(autoplaySimilar) => store.update({ autoplaySimilar })} label={t('Бесконечное воспроизведение')} />
        </SettingsCard>
      </Group>

      <Group title={t('Эквалайзер')}>
        <div className="card">
          <SettingsCard plain icon="settings" title={t('Эквалайзер')} description={t('Семь полос, как в приложении на iPhone.')}>
            <Toggle checked={settings.eq.enabled} onChange={(enabled) => store.update({ eq: { ...settings.eq, enabled } })} label={t('Эквалайзер')} />
          </SettingsCard>
          <div className="space-y-4 border-t border-stroke px-4 pb-4 pt-3 pl-12">
            <div className="flex flex-wrap gap-2">
              {Object.keys(EQ_PRESETS).map((preset) => (
                <button
                  key={preset}
                  onClick={() => store.update({ eq: { enabled: true, gains: [...EQ_PRESETS[preset]!] } })}
                  className="btn"
                >
                  {{ flat: t('Ровно'), bass: t('Бас'), treble: t('Верх'), vocal: t('Вокал'), loudness: t('Громко') }[preset] ?? preset}
                </button>
              ))}
              {/* Свои пресеты — под свои наушники и колонки; правый клик или крестик убирает. */}
              {Object.entries(settings.eqPresets).map(([name, gains]) => (
                <span key={name} className="group relative inline-flex" data-eq-preset={name}>
                  <button onClick={() => store.update({ eq: { enabled: true, gains: [...gains] } })} className="btn pr-8">
                    {name}
                  </button>
                  <button
                    onClick={() => store.deleteEqPreset(name)}
                    className="icon-btn absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 opacity-60 hover:opacity-100"
                    title={t('Удалить пресет')}
                    aria-label={t('Удалить пресет «{name}»', { name })}
                  >
                    <Icon name="close" size={9} />
                  </button>
                </span>
              ))}
              <button
                onClick={() => void askText(t('Сохранить пресет'), { label: t('Название'), confirm: t('Сохранить') }).then((name) => name && store.saveEqPreset(name))}
                className="btn btn-subtle"
              >
                <Icon name="add" size={12} />
                {t('Сохранить как пресет…')}
              </button>
            </div>
            <div className="flex max-w-xl items-end justify-between gap-2">
              {EQ_BANDS.map((band, index) => (
                <div key={band} className="flex flex-col items-center gap-2">
                  <span className="text-[11px] tabular-nums text-secondary">
                    {(settings.eq.gains[index] ?? 0) > 0 ? '+' : ''}
                    {settings.eq.gains[index] ?? 0}
                  </span>
                  <Slider
                    vertical
                    value={settings.eq.gains[index] ?? 0}
                    min={-12}
                    max={12}
                    step={0.5}
                    disabled={!settings.eq.enabled}
                    onChange={(value) => {
                      const gains = [...settings.eq.gains]
                      gains[index] = value
                      store.update({ eq: { ...settings.eq, gains } })
                    }}
                    label={t('{n} Гц', { n: band })}
                  />
                  <span className="text-[11px] text-secondary">{band >= 1000 ? t('{n}к', { n: band / 1000 }) : band}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Group>

      <Group title={t('Текст песни')}>
        <SettingsCard
          icon="lyrics"
          title={t('Искать тексты в LRCLIB')}
          description={t('Если у Navidrome текста нет, он берётся из открытой базы lrclib.net. Туда уходят название, исполнитель и длительность трека.')}
        >
          <Toggle checked={settings.lrclib} onChange={(lrclib) => store.update({ lrclib })} label={t('Искать тексты в LRCLIB')} />
        </SettingsCard>
      </Group>

      </>
      )}

      {tab === 'app' && (
      <>
      {isDesktop() && (
        <Group title={t('Система')}>
          {!isMac && (
            <SettingsCard
              icon="collapse"
              title={t('Сворачивать в трей при закрытии')}
              description={t('Музыка играет дальше, а окно возвращается кликом по значку в трее.')}
            >
              <Toggle checked={settings.closeToTray} onChange={(closeToTray) => store.update({ closeToTray })} label={t('Сворачивать в трей при закрытии')} />
            </SettingsCard>
          )}
          <SettingsCard
            icon="artist"
            title={t('Статус в Discord')}
            description={t('Друзья увидят «Слушает Nocturne» с треком, исполнителем и временем. Нужен только запущенный Discord на этом компьютере.')}
          >
            <Toggle checked={settings.discord} onChange={(discord) => store.update({ discord })} label={t('Статус в Discord')} />
          </SettingsCard>
          <SettingsCard icon="settings" title={t('Глобальные сочетания клавиш')} description={shortcutHint()}>
            <Toggle checked={settings.globalShortcuts} onChange={(globalShortcuts) => store.update({ globalShortcuts })} label={t('Глобальные сочетания клавиш')} />
          </SettingsCard>
        </Group>
      )}

      <Group title={t('Приложение')}>
        {isDesktop() && <UpdateCard />}
        <SettingsCard icon="info" title={t('Язык')}>
          <select
            value={settings.language}
            onChange={(event) => store.update({ language: event.target.value as typeof settings.language })}
            className="select"
          >
            <option value="auto">{t('Как в системе')}</option>
            <option value="ru">{t('Русский')}</option>
            <option value="en">{t('Английский')}</option>
          </select>
        </SettingsCard>
      </Group>

      <Group title={t('Сервер')}>
        {serverless || !client ? (
          <SettingsCard icon="playlist" title={t('Navidrome не подключён')} description={t('Играет только музыка с этого компьютера.')}>
            <button onClick={() => store.showConnect()} className="btn btn-accent">
              {t('Подключить Navidrome')}
            </button>
          </SettingsCard>
        ) : (
          <SettingsCard icon="playlist" title={client.credentials.account} description={t('Пароль хранится в системном хранилище этого компьютера.')}>
            <button onClick={() => void store.disconnect()} className="btn">
              {t('Отключить сервер')}
            </button>
          </SettingsCard>
        )}
      </Group>
      </>
      )}
    </div>
  )
}

/** Версия и проверка обновлений: новая версия ставится поверх, настройки и загрузки остаются. */
function UpdateCard() {
  const { update } = useStore()
  const [version, setVersion] = useState<string>()
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    void appVersion().then(setVersion, () => undefined)
  }, [])
  return (
    <SettingsCard
      icon="download"
      title={version ? t('Nocturne {version}', { version }) : 'Nocturne'}
      description={t('Обновления ставятся поверх установленной версии — настройки, загрузки и вход на сервер остаются.')}
    >
      {update ? (
        <button onClick={() => void store.installUpdate()} className="btn btn-accent">
          {t('Установить {version}', { version: update.version })}
        </button>
      ) : (
        <button
          disabled={checking}
          onClick={async () => {
            setChecking(true)
            await store.checkForUpdate(true)
            setChecking(false)
          }}
          className="btn"
        >
          {checking ? t('Проверяю…') : t('Проверить обновления')}
        </button>
      )}
    </SettingsCard>
  )
}
