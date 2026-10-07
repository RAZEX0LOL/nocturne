import type { ReactNode } from 'react'
import { EQ_BANDS, EQ_PRESETS } from '../audio/engine'
import { store, useStore } from '../state/store'
import { Icon, type IconName } from './Icon'
import { Slider } from './Slider'
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

  return (
    <div className="max-w-4xl space-y-1">
      <h1 className="page-title pb-2">{t('Настройки')}</h1>

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
          </select>
        </SettingsCard>

        <SettingsCard icon="shuffle" title={t('Плавные переходы')} description={t('Затухание в конце трека и нарастание в начале.')}>
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
      </Group>

      <Group title={t('Эквалайзер')}>
        <div className="card">
          <SettingsCard plain icon="settings" title={t('Эквалайзер')} description={t('Семь полос, как в приложении на iPhone.')}>
            <span className="text-sm text-secondary">{settings.eq.enabled ? t('Вкл.') : t('Откл.')}</span>
            <input
              type="checkbox"
              className="toggle"
              checked={settings.eq.enabled}
              onChange={(event) => store.update({ eq: { ...settings.eq, enabled: event.target.checked } })}
              aria-label={t('Эквалайзер')}
            />
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

      <Group title={t('Приложение')}>
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
    </div>
  )
}
