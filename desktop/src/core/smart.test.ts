import { describe, expect, test } from 'bun:test'
import { emptyForm, fromNsp, ruleIsComplete, toNsp, type SmartForm } from './smart'

describe('умные плейлисты: форма ↔ правила Navidrome', () => {
  const form: SmartForm = {
    name: 'Свежее любимое',
    match: 'all',
    rules: [
      { field: 'loved', operator: 'is', value: 'true' },
      { field: 'rating', operator: 'gt', value: '3' },
      { field: 'dateadded', operator: 'inTheLast', value: '30' },
      { field: 'year', operator: 'inTheRange', value: '1990', to: '1999' },
      { field: 'genre', operator: 'contains', value: '  Rock ' },
    ],
    sort: 'lastplayed',
    order: 'desc',
    limit: 50,
  }

  test('в формат NSP: оператор → поле → значение нужного типа', () => {
    expect(toNsp(form)).toEqual({
      all: [
        { is: { loved: true } },
        { gt: { rating: 3 } },
        { inTheLast: { dateadded: 30 } },
        { inTheRange: { year: [1990, 1999] } },
        { contains: { genre: 'Rock' } },
      ],
      sort: 'lastplayed',
      order: 'desc',
      limit: 50,
    })
  })

  test('туда и обратно — та же форма', () => {
    const back = fromNsp('Свежее любимое', toNsp(form))
    expect(back.rules).toEqual(form.rules.map((rule) => (rule.field === 'genre' ? { ...rule, value: 'Rock' } : rule)))
    expect(back.match).toBe('all')
    expect(back.limit).toBe(50)
    expect(back.sort).toBe('lastplayed')
  })

  test('«любое из условий», без лимита, незаполненные строки не уходят', () => {
    const nsp = toNsp({ ...form, match: 'any', limit: 0, rules: [{ field: 'artist', operator: 'is', value: ' ' }, form.rules[0]!] })
    expect(nsp).toEqual({ any: [{ is: { loved: true } }], sort: 'lastplayed', order: 'desc' })
  })

  test('проверка заполненности', () => {
    expect(ruleIsComplete({ field: 'year', operator: 'gt', value: 'abc' })).toBe(false)
    expect(ruleIsComplete({ field: 'year', operator: 'inTheRange', value: '1990' })).toBe(false)
    expect(ruleIsComplete({ field: 'title', operator: 'contains', value: 'love' })).toBe(true)
  })

  test('чужие правила: вложенные группы и незнакомые поля пропускаются, форма не ломается', () => {
    const back = fromNsp('X', { all: [{ any: [{ is: { loved: true } }] }, { is: { mood: 'happy' } }] } as never)
    expect(back.rules).toEqual(emptyForm().rules)
    expect(fromNsp('Y', null).name).toBe('Y')
  })
})
