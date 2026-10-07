import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  PictureInPicture2,
  Minimize2,
  CircleX,
  Disc3,
  Download,
  Ellipsis,
  Folder,
  FolderOpen,
  Heart,
  House,
  Info,
  ListMusic,
  ListOrdered,
  MicVocal,
  Monitor,
  Moon,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Repeat1,
  ScrollText,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react'
import { isMac, isWindows } from '../native'

/**
 * Значки интерфейса. На Windows — системный шрифт значков (Segoe Fluent Icons на Windows 11,
 * Segoe MDL2 Assets на Windows 10: коды у них общие), тот же, что у «Медиаплеера» и «Параметров».
 * На Mac и Linux — векторные значки Lucide. Символы Юникода и эмодзи не годятся: Windows рисует
 * их цветными картинками шрифта Segoe UI Emoji, и цвет состояния (повтор включён) не виден.
 */
const icons = {
  home: ['', House],
  search: ['', Search],
  computer: ['', Monitor],
  download: ['', Download],
  album: ['', Disc3],
  artist: ['', MicVocal],
  playlist: ['', ListMusic],
  heart: ['', Heart],
  heartFilled: ['', Heart],
  settings: ['', Settings],
  refresh: ['', RefreshCw],
  back: ['', ArrowLeft],
  play: ['', Play],
  pause: ['', Pause],
  previous: ['', SkipBack],
  next: ['', SkipForward],
  shuffle: ['', Shuffle],
  repeat: ['', Repeat],
  repeatOne: ['', Repeat1],
  volume: ['', Volume2],
  mute: ['', VolumeX],
  lyrics: ['', ScrollText],
  queue: ['', ListOrdered],
  sleep: ['', Moon],
  add: ['', Plus],
  delete: ['', Trash],
  close: ['', X],
  warning: ['', TriangleAlert],
  error: ['', CircleX],
  info: ['', Info],
  folder: ['', Folder],
  folderOpen: ['', FolderOpen],
  note: ['', Music],
  more: ['', Ellipsis],
  check: ['', Check],
  chevronDown: ['', ChevronDown],
  chevronLeft: ['\uE76B', ChevronLeft],
  chevronRight: ['\uE76C', ChevronRight],
  expand: ['\uE740', Maximize2],
  collapse: ['\uE73F', Minimize2],
  miniPlayer: ['\uE8A7', PictureInPicture2],
} satisfies Record<string, [string, LucideIcon]>

export type IconName = keyof typeof icons

/** Те же значки в SF Symbols — как в «Музыке», Finder и «Системных настройках» Mac. */
const symbols: Record<IconName, string> = {
  home: 'house',
  search: 'magnifyingglass',
  computer: 'desktopcomputer',
  download: 'arrow.down.circle',
  album: 'square.stack',
  artist: 'music.mic',
  playlist: 'music.note.list',
  heart: 'heart',
  heartFilled: 'heart.fill',
  settings: 'gearshape',
  refresh: 'arrow.clockwise',
  back: 'chevron.left',
  play: 'play.fill',
  pause: 'pause.fill',
  previous: 'backward.fill',
  next: 'forward.fill',
  shuffle: 'shuffle',
  repeat: 'repeat',
  repeatOne: 'repeat.1',
  volume: 'speaker.wave.2.fill',
  mute: 'speaker.slash.fill',
  lyrics: 'quote.bubble',
  queue: 'list.bullet',
  sleep: 'moon.zzz',
  add: 'plus',
  delete: 'trash',
  close: 'xmark',
  warning: 'exclamationmark.triangle.fill',
  error: 'xmark.octagon.fill',
  info: 'info.circle',
  folder: 'folder',
  folderOpen: 'folder',
  note: 'music.note',
  more: 'ellipsis',
  check: 'checkmark',
  chevronDown: 'chevron.down',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  expand: 'arrow.up.left.and.arrow.down.right',
  collapse: 'arrow.down.right.and.arrow.up.left',
  miniPlayer: 'pip',
}

let symbolImages: Partial<Record<IconName, string>> = {}

/**
 * Значки Mac рисует AppKit (Rust, sf_symbols.rs) — их загружают один раз до первого кадра, чтобы
 * интерфейс не мигал заменой. Не вышло (браузер, старая macOS) — остаются векторы Lucide.
 */
export async function loadSystemSymbols() {
  if (!isMac || !('__TAURI_INTERNALS__' in window)) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const images = await invoke<Record<string, string>>('system_symbols', { names: [...new Set(Object.values(symbols))] })
    symbolImages = Object.fromEntries(
      (Object.keys(symbols) as IconName[]).flatMap((name) => (images[symbols[name]] ? [[name, images[symbols[name]]]] : [])),
    )
  } catch {
    symbolImages = {}
  }
}

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  const [glyph, Vector] = icons[name]
  if (isWindows) {
    return (
      <span aria-hidden className={`fluent-icon ${className}`} style={{ fontSize: size, width: size, height: size }}>
        {glyph}
      </span>
    )
  }
  const symbol = symbolImages[name]
  if (symbol) {
    // Холст символа чуть больше самого значка (32 pt на 22 pt): масштаб под нужный размер.
    const box = Math.round(size * 1.45)
    return (
      <span
        aria-hidden
        className={`sf-symbol ${className}`}
        style={{ width: box, height: box, margin: (size - box) / 2, maskImage: `url(${symbol})`, WebkitMaskImage: `url(${symbol})` }}
      />
    )
  }
  const filled = name === 'heartFilled' || name === 'play' || name === 'pause'
  return (
    <Vector
      aria-hidden
      size={size}
      strokeWidth={1.75}
      fill={filled ? 'currentColor' : 'none'}
      className={`inline-block shrink-0 ${className}`}
    />
  )
}
