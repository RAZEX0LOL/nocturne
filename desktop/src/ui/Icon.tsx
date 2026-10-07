import {
  ArrowLeft,
  Check,
  ChevronDown,
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
import { isWindows } from '../native'

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
} satisfies Record<string, [string, LucideIcon]>

export type IconName = keyof typeof icons

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  const [glyph, Vector] = icons[name]
  if (isWindows) {
    return (
      <span aria-hidden className={`fluent-icon ${className}`} style={{ fontSize: size, width: size, height: size }}>
        {glyph}
      </span>
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
