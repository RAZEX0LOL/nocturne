import { useState } from 'react'
import { store, useStore } from '../state/store'
import { t } from '../i18n'

export function Connect() {
  const { error } = useStore()
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    await store.connect(server, username, password)
    setBusy(false)
  }

  const field = 'field'

  return (
    <div className="flex h-full items-center justify-center p-8">
      <form onSubmit={submit} className="card flyout w-full max-w-md space-y-5 p-8">
        <div className="space-y-2">
          <h1 className="page-title">
            {t('Твоя музыка.')}
            <br />
            {t('Твоё пространство.')}
          </h1>
          <p className="text-sm text-secondary">{t('Подключи Navidrome и слушай свою библиотеку на компьютере.')}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-secondary">{t('Адрес сервера')}</span>
          <input className={field} value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://music.example.com" autoFocus />
        </label>
        <p className="text-xs text-secondary">{t('HTTP без шифрования разрешён только для домашней сети: 192.168.x.x, 10.x.x.x, *.local.')}</p>

        <label className="block space-y-1.5">
          <span className="text-xs text-secondary">{t('Логин')}</span>
          <input className={field} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('Имя пользователя')} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-secondary">{t('Пароль')}</span>
          <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Пароль Navidrome')} />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !server || !username || !password}
          className="btn btn-accent w-full"
        >
          {busy ? t('Подключаюсь…') : t('Подключиться')}
        </button>
        <p className="text-center text-xs text-secondary">{t('Пароль хранится в системном хранилище этого компьютера.')}</p>
        <button type="button" onClick={() => void store.useOnDevice()} className="btn btn-subtle w-full text-accent-text">
          {t('Слушать музыку с компьютера — без сервера')}
        </button>
      </form>
    </div>
  )
}
