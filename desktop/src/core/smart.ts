/**
 * Умные плейлисты Navidrome: правила, по которым сервер сам собирает треки (в любимом, оценка
 * не ниже 4, добавлено за месяц…). Формат правил — NSP из Navidrome: {"all"|"any": [условия],
 * sort, order, limit}, условие — {"оператор": {"поле": значение}}.
 *
 * Здесь — перевод между этим форматом и формой в интерфейсе: строки «поле · условие · значение».
 */

export type FieldKind = 'text' | 'number' | 'date' | 'boolean'

export interface FieldInfo {
  /** Название поля в Navidrome. */
  key: string
  /** Русская подпись — ключ перевода. */
  label: string
  kind: FieldKind
}

export const FIELDS: FieldInfo[] = [
  { key: 'title', label: 'Название', kind: 'text' },
  { key: 'artist', label: 'Исполнитель', kind: 'text' },
  { key: 'albumartist', label: 'Исполнитель альбома', kind: 'text' },
  { key: 'album', label: 'Альбом', kind: 'text' },
  { key: 'genre', label: 'Жанр', kind: 'text' },
  { key: 'year', label: 'Год', kind: 'number' },
  { key: 'rating', label: 'Оценка', kind: 'number' },
  { key: 'playcount', label: 'Прослушиваний', kind: 'number' },
  { key: 'duration', label: 'Длительность, с', kind: 'number' },
  { key: 'bitrate', label: 'Битрейт, кбит/с', kind: 'number' },
  { key: 'loved', label: 'В избранном', kind: 'boolean' },
  { key: 'lastplayed', label: 'Последнее прослушивание', kind: 'date' },
  { key: 'dateadded', label: 'Добавлено', kind: 'date' },
]

export interface OperatorInfo {
  key: string
  label: string
}

export const OPERATORS: Record<FieldKind, OperatorInfo[]> = {
  text: [
    { key: 'contains', label: 'содержит' },
    { key: 'notContains', label: 'не содержит' },
    { key: 'is', label: 'равно' },
    { key: 'isNot', label: 'не равно' },
    { key: 'startsWith', label: 'начинается с' },
    { key: 'endsWith', label: 'заканчивается на' },
  ],
  number: [
    { key: 'is', label: 'равно' },
    { key: 'isNot', label: 'не равно' },
    { key: 'gt', label: 'больше' },
    { key: 'lt', label: 'меньше' },
    { key: 'inTheRange', label: 'от … до' },
  ],
  date: [
    { key: 'inTheLast', label: 'за последние, дней' },
    { key: 'notInTheLast', label: 'не за последние, дней' },
  ],
  boolean: [{ key: 'is', label: 'равно' }],
}

export const SORTS = [
  { key: 'random', label: 'Случайно' },
  { key: 'title', label: 'Название' },
  { key: 'artist', label: 'Исполнитель' },
  { key: 'album', label: 'Альбом' },
  { key: 'year', label: 'Год' },
  { key: 'rating', label: 'Оценка' },
  { key: 'playcount', label: 'Прослушиваний' },
  { key: 'lastplayed', label: 'Последнее прослушивание' },
  { key: 'dateadded', label: 'Добавлено' },
]

/** Строка формы: значение хранится строкой, как в поле ввода; для «от … до» — вторая граница. */
export interface Rule {
  field: string
  operator: string
  value: string
  to?: string
}

export interface SmartForm {
  name: string
  match: 'all' | 'any'
  rules: Rule[]
  sort: string
  order: 'asc' | 'desc'
  /** 0 — без ограничения. */
  limit: number
}

export function fieldInfo(key: string): FieldInfo {
  return FIELDS.find((field) => field.key === key) ?? FIELDS[0]!
}

export function emptyRule(field = 'loved'): Rule {
  const info = fieldInfo(field)
  return { field, operator: OPERATORS[info.kind][0]!.key, value: info.kind === 'boolean' ? 'true' : '' }
}

export function emptyForm(): SmartForm {
  return { name: '', match: 'all', rules: [emptyRule()], sort: 'random', order: 'desc', limit: 100 }
}

/** Правило готово к отправке: у числа — число, у диапазона — обе границы, у текста — не пусто. */
export function ruleIsComplete(rule: Rule): boolean {
  const kind = fieldInfo(rule.field).kind
  if (kind === 'boolean') return rule.value === 'true' || rule.value === 'false'
  if (kind === 'text') return rule.value.trim().length > 0
  const number = (text?: string) => text !== undefined && text.trim() !== '' && Number.isFinite(Number(text))
  if (rule.operator === 'inTheRange') return number(rule.value) && number(rule.to)
  return number(rule.value)
}

export type Nsp = { all?: unknown[]; any?: unknown[]; sort?: string; order?: string; limit?: number }

function ruleValue(rule: Rule, kind: FieldKind): unknown {
  if (kind === 'boolean') return rule.value === 'true'
  if (kind === 'text') return rule.value.trim()
  if (rule.operator === 'inTheRange') return [Number(rule.value), Number(rule.to)]
  return Number(rule.value)
}

/** Форма → правила Navidrome. Незаполненные строки пропускаются. */
export function toNsp(form: SmartForm): Nsp {
  const conditions = form.rules
    .filter(ruleIsComplete)
    .map((rule) => ({ [rule.operator]: { [rule.field]: ruleValue(rule, fieldInfo(rule.field).kind) } }))
  const nsp: Nsp = { [form.match]: conditions, sort: form.sort, order: form.order }
  if (form.limit > 0) nsp.limit = form.limit
  return nsp
}

/** Правила Navidrome → форма. То, что форма не умеет показать (вложенные группы), пропускается. */
export function fromNsp(name: string, nsp: Nsp | null | undefined): SmartForm {
  const form = emptyForm()
  form.name = name
  if (!nsp) return form
  form.match = nsp.any ? 'any' : 'all'
  const conditions = (nsp.any ?? nsp.all ?? []) as Array<Record<string, Record<string, unknown>>>
  form.rules = conditions.flatMap((condition) => {
    const [operator, target] = Object.entries(condition)[0] ?? []
    if (!operator || !target || typeof target !== 'object') return []
    const [field, raw] = Object.entries(target)[0] ?? []
    if (!field || !FIELDS.some((one) => one.key === field)) return []
    if (Array.isArray(raw)) return [{ field, operator, value: String(raw[0] ?? ''), to: String(raw[1] ?? '') }]
    return [{ field, operator, value: String(raw) }]
  })
  if (!form.rules.length) form.rules = [emptyRule()]
  if (nsp.sort) form.sort = nsp.sort
  if (nsp.order === 'asc' || nsp.order === 'desc') form.order = nsp.order
  form.limit = typeof nsp.limit === 'number' ? nsp.limit : 0
  return form
}
