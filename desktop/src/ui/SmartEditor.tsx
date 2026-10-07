import { useEffect, useState } from 'react'
import { emptyForm, emptyRule, fieldInfo, FIELDS, OPERATORS, ruleIsComplete, SORTS, type Rule, type SmartForm } from '../core/smart'
import { store } from '../state/store'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Значение условия: текст, число, «да/нет» или две границы для «от … до». */
function ValueInput({ rule, onChange }: { rule: Rule; onChange: (rule: Rule) => void }) {
  const kind = fieldInfo(rule.field).kind
  if (kind === 'boolean')
    return (
      <select className="select w-32" value={rule.value} onChange={(event) => onChange({ ...rule, value: event.target.value })} aria-label={t('Значение')}>
        <option value="true">{t('да')}</option>
        <option value="false">{t('нет')}</option>
      </select>
    )
  const type = kind === 'text' ? 'text' : 'number'
  if (rule.operator === 'inTheRange')
    return (
      <span className="flex items-center gap-2">
        <input className="field w-24" type={type} value={rule.value} onChange={(event) => onChange({ ...rule, value: event.target.value })} aria-label={t('От')} />
        <span className="text-secondary">—</span>
        <input className="field w-24" type={type} value={rule.to ?? ''} onChange={(event) => onChange({ ...rule, to: event.target.value })} aria-label={t('До')} />
      </span>
    )
  return (
    <input
      className="field w-48"
      type={type}
      value={rule.value}
      onChange={(event) => onChange({ ...rule, value: event.target.value })}
      placeholder={kind === 'text' ? t('Текст') : '0'}
      aria-label={t('Значение')}
    />
  )
}

/**
 * Редактор умного плейлиста — как «Смарт-плейлист» в «Музыке» Apple: условия, «все» или «любое»,
 * порядок и ограничение. Треки собирает сервер, поэтому после сохранения плейлист обновляется сам.
 */
export function SmartEditor({ id }: { id?: string }) {
  const [form, setForm] = useState<SmartForm>(emptyForm())
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'failed'>(id ? 'loading' : 'ready')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    store.loadSmartPlaylist(id).then(
      (loaded) => !cancelled && (setForm(loaded), setState('ready')),
      () => !cancelled && setState('failed'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const setRule = (index: number, rule: Rule) => setForm({ ...form, rules: form.rules.map((one, at) => (at === index ? rule : one)) })
  const ready = form.name.trim().length > 0 && form.rules.some(ruleIsComplete)

  const save = async () => {
    setState('saving')
    const saved = await store.saveSmartPlaylist(form, id)
    setState('ready')
    if (saved) store.open({ kind: 'playlist', playlist: { id: saved, name: form.name.trim() } })
  }

  if (state === 'loading') return <div className="skeleton h-64 rounded-[var(--radius-card)]" />
  if (state === 'failed')
    return (
      <div className="card p-6 text-secondary">
        <p className="font-medium text-primary">{t('Правила не загрузились')}</p>
        <p className="mt-2">{t('Умные плейлисты работают только с Navidrome. Проверь связь с сервером.')}</p>
      </div>
    )

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-secondary">{t('Умный плейлист')}</p>
        <h1 className="page-title">{id ? t('Правила плейлиста') : t('Новый умный плейлист')}</h1>
      </div>

      <label className="block max-w-md space-y-1.5">
        <span className="text-xs text-secondary">{t('Название')}</span>
        <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus={!id} />
      </label>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('Треки, подходящие под')}</span>
          <select className="select" value={form.match} onChange={(event) => setForm({ ...form, match: event.target.value as SmartForm['match'] })} aria-label={t('Условия')}>
            <option value="all">{t('все условия')}</option>
            <option value="any">{t('любое из условий')}</option>
          </select>
        </div>
        {form.rules.map((rule, index) => {
          const kind = fieldInfo(rule.field).kind
          return (
            <div key={index} className="flex flex-wrap items-center gap-2" data-rule={index}>
              <select
                className="select w-56"
                value={rule.field}
                onChange={(event) => setRule(index, emptyRule(event.target.value))}
                aria-label={t('Поле')}
              >
                {FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {t(field.label)}
                  </option>
                ))}
              </select>
              <select
                className="select w-52"
                value={rule.operator}
                onChange={(event) => setRule(index, { ...rule, operator: event.target.value })}
                aria-label={t('Условие')}
              >
                {OPERATORS[kind].map((operator) => (
                  <option key={operator.key} value={operator.key}>
                    {t(operator.label)}
                  </option>
                ))}
              </select>
              <ValueInput rule={rule} onChange={(next) => setRule(index, next)} />
              <button
                onClick={() => setForm({ ...form, rules: form.rules.length > 1 ? form.rules.filter((_, at) => at !== index) : [emptyRule()] })}
                className="icon-btn"
                title={t('Убрать условие')}
                aria-label={t('Убрать условие')}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )
        })}
        <button onClick={() => setForm({ ...form, rules: [...form.rules, emptyRule('artist')] })} className="btn btn-subtle -ml-2">
          <Icon name="add" size={14} />
          {t('Добавить условие')}
        </button>
      </section>

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <span>{t('Порядок')}</span>
        <select className="select" value={form.sort} onChange={(event) => setForm({ ...form, sort: event.target.value })} aria-label={t('Порядок')}>
          {SORTS.map((sort) => (
            <option key={sort.key} value={sort.key}>
              {t(sort.label)}
            </option>
          ))}
        </select>
        {form.sort !== 'random' && (
          <select className="select" value={form.order} onChange={(event) => setForm({ ...form, order: event.target.value as SmartForm['order'] })} aria-label={t('Направление')}>
            <option value="desc">{t('по убыванию')}</option>
            <option value="asc">{t('по возрастанию')}</option>
          </select>
        )}
        <span className="ml-4">{t('Не больше')}</span>
        <input
          className="field w-24"
          type="number"
          min={0}
          value={form.limit || ''}
          placeholder="∞"
          onChange={(event) => setForm({ ...form, limit: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
          aria-label={t('Не больше, треков')}
        />
        <span className="text-secondary">{t('треков')}</span>
      </section>

      <div className="flex gap-2">
        <button onClick={() => void save()} disabled={!ready || state === 'saving'} className="btn btn-accent">
          {state === 'saving' ? t('Сохраняю…') : t('Сохранить')}
        </button>
        <button onClick={() => store.back()} className="btn">
          {t('Отмена')}
        </button>
      </div>
      <p className="text-xs text-secondary">{t('Navidrome пересобирает умный плейлист сам — при каждом открытии он отражает текущую медиатеку.')}</p>
    </div>
  )
}
