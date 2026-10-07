import { useSyncExternalStore } from 'react'
import type { Song } from '../core/models'

/**
 * Перетаскивание треков на событиях мыши, а не HTML5 drag-and-drop: на Windows WebView2 отдаёт
 * HTML5-перетаскивание приёму файлов из проводника (dragDropEnabled), и внутри окна оно не работает.
 *
 * Строка начинает перетаскивание, когда мышь с зажатой кнопкой ушла на несколько точек. Цель —
 * любой элемент с `data-drop`: плейлист в боковой панели, очередь, строка плейлиста. Цель сама
 * решает, что делать с треками, через `onDrop`, зарегистрированный под тем же ключом.
 */

export interface DragPayload {
  songs: Song[]
  /** Откуда тащат: позиции строк в своём списке — для перестановки внутри него. */
  source?: { list: string; indexes: number[] }
}

interface DragState {
  payload: DragPayload
  x: number
  y: number
  /** Цель под курсором и позиция вставки внутри списка, если цель — список. */
  target?: string
  insertAt?: number
}

type DropHandler = (payload: DragPayload, insertAt?: number) => void

let state: DragState | undefined
const listeners = new Set<() => void>()
const handlers = new Map<string, DropHandler>()
const emit = () => listeners.forEach((listener) => listener())

export function registerDrop(key: string, handler: DropHandler) {
  handlers.set(key, handler)
  return () => {
    if (handlers.get(key) === handler) handlers.delete(key)
  }
}

export function useDrag() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** Что под курсором: ключ цели и, для строк списка, место вставки — до или после строки. */
function locate(x: number, y: number): Pick<DragState, 'target' | 'insertAt'> {
  const element = document.elementFromPoint(x, y) as HTMLElement | null
  const row = element?.closest<HTMLElement>('[data-drop-row]')
  if (row) {
    const rect = row.getBoundingClientRect()
    const index = Number(row.dataset.dropRow)
    return { target: row.dataset.dropList, insertAt: y > rect.top + rect.height / 2 ? index + 1 : index }
  }
  const zone = element?.closest<HTMLElement>('[data-drop]')
  return { target: zone?.dataset.drop }
}

/** Вызывается из onMouseDown строки: перетаскивание начнётся, только если мышь сдвинется. */
export function beginDrag(event: React.MouseEvent, payload: () => DragPayload) {
  if (event.button !== 0) return
  const startX = event.clientX
  const startY = event.clientY
  let started = false

  const move = (moveEvent: MouseEvent) => {
    if (!started) {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return
      started = true
      document.body.classList.add('dragging-songs')
      state = { payload: payload(), x: moveEvent.clientX, y: moveEvent.clientY }
    }
    state = { ...state!, x: moveEvent.clientX, y: moveEvent.clientY, ...locate(moveEvent.clientX, moveEvent.clientY) }
    emit()
  }

  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up, true)
    if (!started || !state) return
    document.body.classList.remove('dragging-songs')
    const { payload: dragged, target, insertAt } = state
    state = undefined
    emit()
    if (target) handlers.get(target)?.(dragged, insertAt)
    // Отпускание после перетаскивания — не клик: строка под курсором не должна выделиться.
    // Клик приходит сразу за отпусканием, поэтому перехват живёт один оборот цикла событий.
    const swallow = (click: MouseEvent) => click.stopPropagation()
    window.addEventListener('click', swallow, true)
    setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  }

  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up, true)
}
