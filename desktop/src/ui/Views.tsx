import { useEffect, useRef, useState } from 'react'
import type { Album, Artist, Playlist, Song } from '../core/models'
import { store, useStore } from '../state/store'
import { Cover } from './Cover'
import { SongList } from './SongList'

function Title({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {action}
    </div>
  )
}

function PlayButtons({ songs, downloadable = false }: { songs: Song[]; downloadable?: boolean }) {
  const { client, offline, downloads, downloading } = useStore()
  if (!songs.length) return null
  const missing = songs.filter((song) => !downloads[song.id])
  const busy = songs.some((song) => downloading[song.id])
  return (
    <div className="flex gap-3">
      <button onClick={() => void store.play(songs, 0)} className="rounded-xl bg-accent px-5 py-2 font-medium text-base">
        ▶ Слушать
      </button>
      <button
        onClick={() => void store.play(songs, Math.floor(Math.random() * songs.length), true)}
        className="rounded-xl bg-surface-strong px-5 py-2"
      >
        ⇄ Перемешать
      </button>
      {downloadable && client && !offline && (
        <button
          onClick={() => void store.download(songs)}
          disabled={busy || !missing.length}
          className="rounded-xl bg-surface-strong px-5 py-2 disabled:opacity-50"
          title="Скачать для прослушивания без сети"
        >
          {busy ? 'Скачиваю…' : missing.length ? '↓ Скачать' : '✓ Скачано'}
        </button>
      )}
    </div>
  )
}

export function AlbumGrid({ albums }: { albums: Album[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
      {albums.map((album) => (
        <button key={album.id} onClick={() => store.open({ kind: 'album', album })} className="min-w-0 space-y-2 text-left">
          <Cover id={album.coverArt} size={180} />
          <div className="truncate text-sm font-medium">{album.name}</div>
          <div className="truncate text-xs text-secondary">{album.artist ?? 'Неизвестный исполнитель'}</div>
        </button>
      ))}
    </div>
  )
}

export function OfflineBanner() {
  const { offline } = useStore()
  if (!offline) return null
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface p-4">
      <span className="text-orange-400">⚠</span>
      <div className="flex-1">
        <div className="text-sm font-medium">Нет связи с сервером</div>
        <div className="text-xs text-secondary">Играет то, что есть на компьютере и в загрузках.</div>
      </div>
      <button onClick={() => void store.reconnect()} className="rounded-lg bg-surface-strong px-3 py-1.5 text-sm">
        Повторить
      </button>
    </div>
  )
}

export function HomeView() {
  const { recent, starred, offline, serverless, local, downloadedSongs } = useStore()
  if (offline || serverless) {
    const onDisk = [...local, ...downloadedSongs]
    return (
      <div className="space-y-6">
        <OfflineBanner />
        <Title action={<PlayButtons songs={onDisk} />}>{offline ? 'Доступно без сети' : 'Моя музыка'}</Title>
        {onDisk.length ? <SongList songs={onDisk} showAlbum /> : <LocalEmpty />}
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {starred.length > 0 && (
        <section className="space-y-3">
          <Title action={<button onClick={() => store.section({ kind: 'favorites' })} className="text-sm text-secondary hover:text-primary">Все →</button>}>
            Любимые треки
          </Title>
          <SongList songs={starred.slice(0, 5)} showAlbum />
        </section>
      )}
      <section className="space-y-4">
        <Title action={<button onClick={() => store.section({ kind: 'albums' })} className="text-sm text-secondary hover:text-primary">Все альбомы →</button>}>
          Недавно добавленные
        </Title>
        <AlbumGrid albums={recent} />
      </section>
    </div>
  )
}

export function AlbumsView() {
  const { albums, albumsComplete } = useStore()
  const sentinel = useRef<HTMLDivElement>(null)

  // Следующая порция подгружается, когда низ списка показался в окне.
  useEffect(() => {
    const target = sentinel.current
    if (!target || albumsComplete) return
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void store.moreAlbums(), { rootMargin: '400px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [albumsComplete, albums.length])

  return (
    <div className="space-y-6">
      <Title>Альбомы</Title>
      <AlbumGrid albums={albums} />
      {!albumsComplete && <div ref={sentinel} className="py-6 text-center text-sm text-secondary">Загружаю…</div>}
    </div>
  )
}

export function AlbumView({ album }: { album: Album }) {
  const { songs } = useStore()
  const list = songs[album.id] ?? []
  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <Cover id={album.coverArt} size={200} />
        <div className="flex flex-col justify-end gap-2">
          <h1 className="text-3xl font-semibold">{album.name}</h1>
          <button
            onClick={() => album.artistId && store.open({ kind: 'artist', artist: { id: album.artistId, name: album.artist ?? '' } })}
            className="self-start text-accent enabled:hover:underline"
            disabled={!album.artistId}
          >
            {album.artist ?? 'Неизвестный исполнитель'}
          </button>
          <p className="text-sm text-secondary">
            {album.year ? `${album.year} · ` : ''}
            {list.length || album.songCount || 0} треков
          </p>
          <div className="pt-2">
            <PlayButtons songs={list} downloadable />
          </div>
        </div>
      </div>
      <SongList songs={list} numbered />
    </div>
  )
}

export function ArtistsView() {
  const { artists } = useStore()
  const [filter, setFilter] = useState('')
  const shown = filter ? artists.filter((artist) => artist.name.toLowerCase().includes(filter.toLowerCase())) : artists
  return (
    <div className="space-y-6">
      <Title
        action={
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Найти артиста"
            className="rounded-lg bg-surface px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        }
      >
        Артисты
      </Title>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {shown.map((artist) => (
          <li key={artist.id}>
            <ArtistRow artist={artist} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArtistRow({ artist }: { artist: Artist }) {
  return (
    <button
      onClick={() => store.open({ kind: 'artist', artist })}
      className="flex w-full items-center gap-3 rounded-xl bg-surface p-2 text-left hover:bg-surface-strong"
    >
      <Cover id={artist.coverArt} size={44} rounded="rounded-full" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{artist.name}</span>
        <span className="block text-xs text-secondary">Альбомов: {artist.albumCount ?? 0}</span>
      </span>
    </button>
  )
}

export function ArtistView({ artist }: { artist: Artist }) {
  const { artistAlbums } = useStore()
  const albums = artistAlbums[artist.id] ?? []
  return (
    <div className="space-y-6">
      <Title>{artist.name}</Title>
      <AlbumGrid albums={albums} />
    </div>
  )
}

export function PlaylistsView() {
  const { playlists } = useStore()
  return (
    <div className="space-y-6">
      <Title>Плейлисты</Title>
      {!playlists.length && <p className="text-sm text-secondary">Плейлистов на сервере пока нет.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            <button
              onClick={() => store.open({ kind: 'playlist', playlist })}
              className="flex w-full items-center gap-3 rounded-xl bg-surface p-2 text-left hover:bg-surface-strong"
            >
              <Cover id={playlist.coverArt} size={56} rounded="rounded-lg" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{playlist.name}</span>
                <span className="block text-xs text-secondary">Треков: {playlist.songCount ?? 0}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PlaylistView({ playlist }: { playlist: Playlist }) {
  const { songs } = useStore()
  const list = songs[playlist.id] ?? []
  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <Cover id={playlist.coverArt} size={180} />
        <div className="flex flex-col justify-end gap-2">
          <h1 className="text-3xl font-semibold">{playlist.name}</h1>
          <p className="text-sm text-secondary">{list.length || playlist.songCount || 0} треков</p>
          <div className="pt-2">
            <PlayButtons songs={list} downloadable />
          </div>
        </div>
      </div>
      <SongList songs={list} showAlbum />
    </div>
  )
}

export function FavoritesView() {
  const { starred } = useStore()
  return (
    <div className="space-y-6">
      <Title action={<PlayButtons songs={starred} />}>Любимые треки</Title>
      <SongList songs={starred} showAlbum />
    </div>
  )
}

export function SearchView() {
  const { search } = useStore()
  const [query, setQuery] = useState(search?.query ?? '')

  // Запрос уходит, когда человек перестал печатать, а не на каждую букву.
  useEffect(() => {
    store.pendingQuery = query
    const timer = setTimeout(() => void store.search(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="space-y-6">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Треки, альбомы, артисты"
        className="w-full rounded-xl bg-surface px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-accent"
      />
      {search && !search.songs.length && !search.albums.length && !search.artists.length && (
        <p className="text-sm text-secondary">По запросу «{search.query}» ничего не нашлось.</p>
      )}
      {search?.artists.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Артисты</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {search.artists.map((artist) => (
              <li key={artist.id}>
                <ArtistRow artist={artist} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {search?.albums.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Альбомы</h2>
          <AlbumGrid albums={search.albums} />
        </section>
      ) : null}
      {search?.songs.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Треки</h2>
          <SongList songs={search.songs} showAlbum />
        </section>
      ) : null}
    </div>
  )
}

function LocalEmpty() {
  const { musicFolder } = useStore()
  return (
    <div className="rounded-xl bg-surface p-6 text-sm text-secondary">
      <p className="font-medium text-primary">На компьютере пока нет музыки</p>
      <p className="mt-2">
        Добавь файлы или папку кнопками выше или положи их в папку{' '}
        {musicFolder ? <span className="text-primary">{musicFolder}</span> : 'Музыка → Nocturne'} — приложение найдёт их само.
        Поддерживаются MP3, M4A, AAC, ALAC, FLAC, WAV, AIFF, OGG.
      </p>
    </div>
  )
}

export function LocalView() {
  const { local, importing } = useStore()
  const button = 'rounded-xl bg-surface-strong px-4 py-2 text-sm disabled:opacity-50'
  return (
    <div className="space-y-6">
      <Title action={<PlayButtons songs={local} />}>На компьютере</Title>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void store.importMusic('files')} disabled={importing} className={button}>
          ＋ Файлы
        </button>
        <button onClick={() => void store.importMusic('folder')} disabled={importing} className={button}>
          ＋ Папка целиком
        </button>
        <button onClick={() => store.openMusicFolder()} className={button}>
          Открыть папку
        </button>
        <button onClick={() => void store.loadOnDisk()} className={button}>
          ↻ Пересканировать
        </button>
      </div>
      {importing && <p className="text-sm text-secondary">Добавляю музыку…</p>}
      {local.length ? (
        <>
          <p className="text-xs text-secondary">Треков: {local.length}</p>
          <SongList songs={local} showAlbum onRemove={(song) => void store.removeLocal(song)} removeLabel="Удалить файл с компьютера" />
        </>
      ) : (
        <LocalEmpty />
      )}
    </div>
  )
}

export function DownloadsView() {
  const { downloadedSongs, downloading } = useStore()
  const pending = Object.keys(downloading).length
  return (
    <div className="space-y-6">
      <Title action={<PlayButtons songs={downloadedSongs} />}>Загрузки</Title>
      <p className="text-sm text-secondary">
        Треки с сервера, сохранённые для прослушивания без сети.{pending ? ` Сейчас скачивается: ${pending}.` : ''}
      </p>
      <SongList songs={downloadedSongs} showAlbum onRemove={(song) => void store.removeDownload(song)} removeLabel="Удалить загрузку" />
    </div>
  )
}
