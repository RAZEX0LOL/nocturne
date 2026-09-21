import { store, useStore } from '../state/store'
import { Cover } from './Cover'

export function Library() {
  const { albums, starred, openAlbum, albumSongs } = useStore()

  if (openAlbum) {
    const songs = albumSongs[openAlbum.id] ?? []
    return (
      <div className="space-y-6 p-8">
        <button onClick={() => store.closeAlbum()} className="text-sm text-secondary hover:text-primary">
          ← Назад
        </button>
        <div className="flex gap-6">
          <Cover id={openAlbum.coverArt} size={200} />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{openAlbum.name}</h1>
            <p className="text-accent">{openAlbum.artist ?? 'Неизвестный исполнитель'}</p>
            <p className="text-sm text-secondary">
              {openAlbum.year ? `${openAlbum.year} · ` : ''}
              {songs.length || openAlbum.songCount || 0} треков
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => void store.play(songs, 0)} className="rounded-xl bg-accent px-5 py-2 text-base font-medium">
                ▶ Слушать
              </button>
              <button
                onClick={() => void store.play(songs, Math.floor(Math.random() * Math.max(songs.length, 1)), true)}
                className="rounded-xl bg-surface-strong px-5 py-2"
              >
                ⇄ Перемешать
              </button>
            </div>
          </div>
        </div>
        <ol className="divide-y divide-surface-strong overflow-hidden rounded-xl bg-surface">
          {songs.map((song, index) => (
            <li key={song.id}>
              <button
                onDoubleClick={() => void store.play(songs, index)}
                onClick={() => void store.play(songs, index)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-strong"
              >
                <span className="w-6 text-right text-sm tabular-nums text-secondary">{song.track ?? index + 1}</span>
                <span className="flex-1 truncate">{song.title}</span>
                <span className="truncate text-sm text-secondary">{song.artist}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-8">
      {starred.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Любимые треки</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void store.play(starred, 0)} className="rounded-xl bg-surface-strong px-4 py-2 text-sm">
              ▶ Слушать {starred.length}
            </button>
            <button onClick={() => void store.play(starred, 0, true)} className="rounded-xl bg-surface-strong px-4 py-2 text-sm">
              ⇄ Перемешать
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Недавно добавленные</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
          {albums.map((album) => (
            <button key={album.id} onClick={() => void store.openAlbum(album)} className="space-y-2 text-left">
              <Cover id={album.coverArt} size={180} />
              <div className="truncate text-sm font-medium">{album.name}</div>
              <div className="truncate text-xs text-secondary">{album.artist ?? 'Неизвестный исполнитель'}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
