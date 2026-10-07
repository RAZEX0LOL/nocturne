import { useDrag } from './drag'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Что тащат: карточка у курсора с названием или числом треков. */
export function DragGhost() {
  const drag = useDrag()
  if (!drag) return null
  const { songs } = drag.payload
  const label = songs.length === 1 ? songs[0]!.title : t('Треков: {n}', { n: songs.length })
  return (
    <div
      className="flyout pointer-events-none fixed z-[60] flex max-w-64 items-center gap-2 px-3 py-2 text-sm shadow-xl"
      style={{ left: drag.x + 14, top: drag.y + 10 }}
    >
      <Icon name="note" size={14} className="text-accent-text" />
      <span className="truncate">{label}</span>
    </div>
  )
}
