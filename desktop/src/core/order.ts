/**
 * Переносит элементы с позиций `from` так, чтобы они встали перед элементом, стоявшим на `to`
 * (`to` равный длине — в конец). Выбранные идут подряд в прежнем порядке — как при перетаскивании
 * нескольких строк в таблице.
 */
export function moveItems<T>(items: T[], from: number[], to: number): T[] {
  const picked = new Set(from.filter((index) => index >= 0 && index < items.length))
  const moving = items.filter((_, index) => picked.has(index))
  const before = items.slice(0, Math.max(0, to)).filter((_, index) => !picked.has(index)).length
  const rest = items.filter((_, index) => !picked.has(index))
  rest.splice(before, 0, ...moving)
  return rest
}
