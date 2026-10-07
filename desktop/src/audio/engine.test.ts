import { describe, expect, test } from 'bun:test'
import { AudioEngine, crossfadeCurve, transitionPlan } from './engine'

describe('кроссфейд', () => {
  test('кривая равной мощности: сумма мощностей постоянна, в середине нет провала', () => {
    const fadeIn = crossfadeCurve(65, true)
    const fadeOut = crossfadeCurve(65, false)
    expect(fadeIn[0]).toBeCloseTo(0)
    expect(fadeIn[64]).toBeCloseTo(1)
    expect(fadeOut[0]).toBeCloseTo(1)
    expect(fadeOut[64]).toBeCloseTo(0)
    for (let index = 0; index < 65; index++) expect(fadeIn[index]! ** 2 + fadeOut[index]! ** 2).toBeCloseTo(1, 5)
    // У линейного кроссфейда в середине было бы 0,5 + 0,5 по амплитуде — провал на 3 дБ.
    expect(fadeIn[32]).toBeCloseTo(Math.SQRT1_2, 5)
  })

  test('кривая масштабируется на громкость трека после ReplayGain', () => {
    expect(crossfadeCurve(3, true, 0.5)[2]).toBeCloseTo(0.5)
    expect(crossfadeCurve(3, false, 0.8)[0]).toBeCloseTo(0.8)
  })
})

describe('когда начинать следующий трек', () => {
  test('с кроссфейдом — за его длительность до конца, сразу', () => {
    expect(transitionPlan(6, 240, 10)).toBeUndefined()
    expect(transitionPlan(6, 240, 6)).toEqual({ delay: 0, overlap: 6 })
    expect(transitionPlan(6, 240, 4.2)?.overlap).toBeCloseTo(4.2)
  })

  test('короткий трек — кроссфейд не длиннее трети трека', () => {
    expect(transitionPlan(12, 9, 4)).toBeUndefined()
    expect(transitionPlan(12, 9, 3)).toEqual({ delay: 0, overlap: 3 })
  })

  test('встык — таймер ровно на конец минус микрокроссфейд', () => {
    expect(transitionPlan(0, 240, 1)).toBeUndefined()
    const plan = transitionPlan(0, 240, 0.2)!
    expect(plan.overlap).toBe(AudioEngine.SEAM)
    expect(plan.delay).toBeCloseTo(0.2 - AudioEngine.SEAM)
    expect(transitionPlan(0, 240, 0.01)).toEqual({ delay: 0, overlap: AudioEngine.SEAM })
  })
})
