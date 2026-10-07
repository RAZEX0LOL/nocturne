import { useEffect } from 'react'
import type { Playlist } from '../core/models'
import { store, useStore } from '../state/store'
import { popupMenu } from '../shell'
import { askText, confirmAction } from './Dialogs'
import { registerDrop, useDrag } from './drag'
import { Icon } from './Icon'
import { t } from '../i18n'

/** Правый клик по плейлисту: играть, переименовать, удалить — как в «Музыке» Apple. */
export function playlistMenu(playlist: Playlist) {
  return popupMenu([
    { text: t('Играть'), action: () => void store.playPlaylist(playlist) },
    { text: t('Перемешать'), action: () => void store.playPlaylist(playlist, true) },
    'separator',
    {
      text: t('Переименовать…'),
      action: () =>
        void askText(t('Переименовать плейлист'), { initial: playlist.name, label: t('Название') }).then(
          (name) => name && void store.renamePlaylist(playlist, name),
        ),
    },
    {
      text: t('Удалить плейлист…'),
      action: () =>
        void confirmAction(t('Удалить «{name}»?', { name: playlist.name }), t('Плейлист исчезнет с сервера на всех устройствах. Треки останутся в медиатеке.'), {
          confirm: t('Удалить'),
          danger: true,
        }).then((yes) => yes && void store.deletePlaylist(playlist)),
    },
  ])
}

export function newPlaylist() {
  return askText(t('Новый плейлист'), { label: t('Название'), confirm: t('Создать') }).then(async (name) => {
    if (!name) return
    const created = await store.createPlaylist(name)
    if (created) store.open({ kind: 'playlist', playlist: created })
  })
}

/** Один плейлист в боковой панели — он же цель для перетащенных треков. */
function PlaylistItem({ playlist, active, onNavigate }: { playlist: Playlist; active: boolean; onNavigate: () => void }) {
  const drag = useDrag()
  const key = `sidebar-playlist:${playlist.id}`
  useEffect(() => registerDrop(key, (payload) => void store.addToPlaylist(playlist, payload.songs)), [key, playlist])
  return (
    <button
      data-drop={key}
      onClick={() => {
        onNavigate()
        store.open({ kind: 'playlist', playlist })
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        void playlistMenu(playlist)
      }}
      className={`nav-item ${drag?.target === key ? 'drop-target' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={playlist.name}
    >
      <Icon name="playlist" />
      <span className="truncate">{playlist.name}</span>
    </button>
  )
}

/** Плейлисты в боковой панели под разделами, как в «Музыке» Apple и в Feishin. */
export function SidebarPlaylists({ onNavigate }: { onNavigate: () => void }) {
  const { playlists, view } = useStore()
  const drag = useDrag()
  const newKey = 'sidebar-new-playlist'
  useEffect(
    () =>
      registerDrop(newKey, (payload) =>
        void askText(t('Новый плейлист'), { label: t('Название'), confirm: t('Создать') }).then(
          (name) => name && void store.createPlaylist(name, payload.songs),
        ),
      ),
    [],
  )
  const openId = view.kind === 'playlist' ? view.playlist.id : undefined
  return (
    <section className="mt-4 space-y-0.5">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold text-secondary">{t('Плейлисты')}</span>
        <button
          data-drop={newKey}
          onClick={() => void newPlaylist()}
          className={`icon-btn h-6 w-6 ${drag?.target === newKey ? 'drop-target' : ''}`}
          title={t('Новый плейлист')}
          aria-label={t('Новый плейлист')}
        >
          <Icon name="add" size={12} />
        </button>
      </div>
      {playlists.map((playlist) => (
        <PlaylistItem key={playlist.id} playlist={playlist} active={openId === playlist.id} onNavigate={onNavigate} />
      ))}
      {drag && !playlists.length && (
        <div data-drop={newKey} className={`mx-1 rounded-[var(--radius-control)] border border-dashed border-stroke px-3 py-2 text-xs text-secondary ${drag.target === newKey ? 'drop-target' : ''}`}>
          {t('Отпусти — создам плейлист')}
        </div>
      )}
    </section>
  )
}
