import { describe, expect, test } from 'bun:test'
import { moveItems } from './order'

describe('перестановка строк', () => {
  const list = ['a', 'b', 'c', 'd', 'e']
  test('вниз и вверх', () => {
    expect(moveItems(list, [0], 3)).toEqual(['b', 'c', 'a', 'd', 'e'])
    expect(moveItems(list, [4], 1)).toEqual(['a', 'e', 'b', 'c', 'd'])
  })
  test('несколько строк встают подряд в прежнем порядке', () => {
    expect(moveItems(list, [3, 0], 2)).toEqual(['b', 'a', 'd', 'c', 'e'])
    expect(moveItems(list, [1, 3], 5)).toEqual(['a', 'c', 'e', 'b', 'd'])
  })
  test('на своё же место и за границы — без потерь', () => {
    expect(moveItems(list, [2], 2)).toEqual(list)
    expect(moveItems(list, [2], 99)).toEqual(['a', 'b', 'd', 'e', 'c'])
    expect(moveItems(list, [9], 0)).toEqual(list)
    expect(moveItems(['x', 'x', 'y'], [1], 0)).toEqual(['x', 'x', 'y'])
  })
})
