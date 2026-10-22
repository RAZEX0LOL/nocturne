import { language, setLanguage } from './i18n'

/** Переключатель языка: выбор запоминается и остаётся в адресе, чтобы ссылкой можно было поделиться. */
export function LanguageSwitch() {
  return (
    <div className="flex rounded-full border border-line p-0.5 text-xs font-semibold" role="group" aria-label="Language">
      {(['ru', 'en'] as const).map((code) => (
        <button
          key={code}
          onClick={() => code !== language && setLanguage(code)}
          aria-pressed={code === language}
          className={`rounded-full px-2.5 py-1 ${code === language ? 'bg-accent text-night' : 'text-muted hover:text-ink'}`}
        >
          {code === 'ru' ? 'RU' : 'EN'}
        </button>
      ))}
    </div>
  )
}

