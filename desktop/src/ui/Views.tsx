import { useEffect, useRef, useState } from 'react'
import type { Album, Artist, Playlist, Song } from '../core/models'
import { store, useStore } from '../state/store'
import { Cover } from './Cover'
import { SongList } from './SongList'
import { Icon } from './Icon'
import { InfoBar } from './InfoBar'
import { AlbumCard, AlbumCardSkeleton, Shelf, SongListSkeleton } from './Shelf'
import { songMenu } from './SongList'
import { playlistMenu, newPlaylistMenu } from './SidebarPlaylists'
import { registerDrop, useDrag } from './drag'
import { popupMenu, type MenuEntry } from '../shell'
import { isMac, isWindows } from '../native'
import { t } from '../i18n'

function Title({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="page-title">{children}</h1>
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
    <div className="flex gap-2">
      <button onClick={() => void store.play(songs, 0)} className="btn btn-accent">
        <Icon name="play" size={14} />
        {t('Слушать')}
      </button>
      <button onClick={() => void store.play(songs, Math.floor(Math.random() * songs.length), true)} className="btn">
        <Icon name="shuffle" size={14} />
        {t('Перемешать')}
      </button>
      {downloadable && client && !offline && (
        <button
          onClick={() => void store.download(songs)}
          disabled={busy || !missing.length}
          className="btn"
          title={t('Скачать для прослушивания без сети')}
        >
          <Icon name={missing.length ? 'download' : 'check'} size={14} />
          {busy ? t('Скачиваю…') : missing.length ? t('Скачать') : t('Скачано')}
        </button>
      )}
    </div>
  )
}

export function AlbumGrid({ albums, loading = false }: { albums: Album[]; loading?: boolean }) {
  return (
    <div className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))]">
      {loading
        ? Array.from({ length: 12 }, (_, index) => <AlbumCardSkeleton key={index} />)
        : albums.map((album, index) => <AlbumCard key={`${album.id}-${index}`} album={album} />)}
    </div>
  )
}

export function OfflineBanner() {
  const { offline } = useStore()
  if (!offline) return null
  return (
    <InfoBar
      severity="warning"
      title={t('Нет связи с сервером')}
      message={t('Играет то, что есть на компьютере и в загрузках.')}
      action={
        <button onClick={() => void store.reconnect()} className="btn">
          {t('Повторить')}
        </button>
      }
    />
  )
}

export function HomeView() {
  const { recent, starred, offline, serverless, local, downloadedSongs, shelves } = useStore()
  if (offline || serverless) {
    const onDisk = [...local, ...downloadedSongs]
    return (
      <div className="space-y-6">
        <OfflineBanner />
        <Title action={<PlayButtons songs={onDisk} />}>{offline ? t('Доступно без сети') : t('Моя музыка')}</Title>
        {onDisk.length ? <SongList songs={onDisk} showAlbum /> : <LocalEmpty />}
      </div>
    )
  }
  return (
    <div className="space-y-8">
      <h1 className="page-title">{greeting()}</h1>
      <Shelf title={t('Недавно слушал')} albums={shelves.played} loading={!shelves.loaded} />
      <Shelf
        title={t('Недавно добавленные')}
        albums={recent}
        loading={!shelves.loaded}
        action={
          <button onClick={() => store.section({ kind: 'albums' })} className="btn btn-subtle">
            {t('Все альбомы')}
          </button>
        }
      />
      {starred.length > 0 && (
        <section className="space-y-2">
          <Title action={<button onClick={() => store.section({ kind: 'favorites' })} className="btn btn-subtle">{t('Все')}</button>}>
            <span className="section-title">{t('Любимые треки')}</span>
          </Title>
          <SongList songs={starred.slice(0, 5)} showAlbum />
        </section>
      )}
      <Shelf title={t('Часто слушаю')} albums={shelves.frequent} loading={!shelves.loaded} />
      <Shelf
        title={t('Случайные альбомы')}
        albums={shelves.random}
        loading={!shelves.loaded}
        action={
          <button onClick={() => void store.shuffleShelf()} className="btn btn-subtle">
            <Icon name="shuffle" size={14} />
            {t('Другие')}
          </button>
        }
      />
    </div>
  )
}

/** Приветствие по времени суток — главная выглядит живой, а не как список разделов. */
function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return t('Доброй ночи')
  if (hour < 12) return t('Доброе утро')
  if (hour < 18) return t('Добрый день')
  return t('Добрый вечер')
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
      <Title>{t('Альбомы')}</Title>
      <AlbumGrid albums={albums} loading={!albums.length && !albumsComplete} />
      {!albumsComplete && albums.length > 0 && <div ref={sentinel} className="h-8" />}
    </div>
  )
}

/** Описание альбома или биография из Last.fm: HTML со ссылкой «Read more» — показываем только текст. */
function plainText(html: string) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text.replace(/Read more on Last\.fm\.?/i, '').trim()
}

function About({ html }: { html?: string }) {
  const [open, setOpen] = useState(false)
  const text = html ? plainText(html) : ''
  if (!text) return null
  return (
    <section className="card max-w-3xl space-y-2 p-5">
      <p className={`whitespace-pre-line text-sm leading-relaxed text-secondary ${open ? '' : 'line-clamp-4'}`}>{text}</p>
      {text.length > 320 && (
        <button onClick={() => setOpen(!open)} className="btn btn-subtle -ml-3 text-accent-text">
          {open ? t('Свернуть') : t('Читать дальше')}
        </button>
      )}
    </section>
  )
}

function totalTime(songs: Song[]) {
  const seconds = songs.reduce((sum, song) => sum + (song.duration ?? 0), 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours ? t('{h} ч {m} мин', { h: hours, m: minutes }) : t('{m} мин', { m: minutes })
}

/** Кнопка «⋯» у заголовка: то же меню, что у выделенных треков, но для всего альбома или плейлиста. */
function MoreButton({ entries }: { entries: () => MenuEntry[] }) {
  return (
    <button onClick={() => void popupMenu(entries())} className="btn" title={t('Ещё')} aria-label={t('Ещё')}>
      <Icon name="more" size={14} />
    </button>
  )
}

export function AlbumView({ album }: { album: Album }) {
  const { songs, albumNotes } = useStore()
  const loaded = songs[album.id]
  const list = loaded ?? []
  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <Cover id={album.coverArt} size={200} />
        <div className="flex min-w-0 flex-col justify-end gap-2">
          <p className="text-xs uppercase tracking-wider text-secondary">{t('Альбом')}</p>
          <h1 className="page-title">{album.name}</h1>
          <button
            onClick={() => album.artistId && store.open({ kind: 'artist', artist: { id: album.artistId, name: album.artist ?? '' } })}
            className="self-start text-accent-text enabled:hover:underline"
            disabled={!album.artistId}
          >
            {album.artist ?? t('Неизвестный исполнитель')}
          </button>
          <p className="text-sm text-secondary">
            {[album.year, album.genre, t('{n} треков', { n: list.length || album.songCount || 0 }), list.length ? totalTime(list) : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="flex gap-2 pt-2">
            <PlayButtons songs={list} downloadable />
            {list.length > 0 && <MoreButton entries={() => songMenu(list)} />}
          </div>
        </div>
      </div>
      {loaded ? <SongList songs={list} numbered /> : <SongListSkeleton />}
      <About html={albumNotes[album.id]} />
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
            placeholder={t('Найти артиста')}
            className="field w-64"
          />
        }
      >
        {t('Артисты')}
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
      className="card list-row flex w-full items-center gap-3 p-2 text-left"
    >
      <Cover id={artist.coverArt} size={44} rounded="rounded-full" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{artist.name}</span>
        <span className="block text-xs text-secondary">{t('Альбомов: {n}', { n: artist.albumCount ?? 0 })}</span>
      </span>
    </button>
  )
}

export function ArtistView({ artist }: { artist: Artist }) {
  const { artistAlbums, artistExtras } = useStore()
  const albums = artistAlbums[artist.id]
  const extras = artistExtras[artist.id]
  const similar = extras?.info.similarArtist ?? []
  return (
    <div className="space-y-8">
      <div className="flex items-end gap-6">
        <Cover id={artist.coverArt ?? albums?.[0]?.coverArt} size={160} rounded="rounded-full" />
        <div className="min-w-0 space-y-2">
          <p className="text-xs uppercase tracking-wider text-secondary">{t('Исполнитель')}</p>
          <h1 className="page-title">{artist.name}</h1>
          {albums && <p className="text-sm text-secondary">{t('Альбомов: {n}', { n: albums.length })}</p>}
          {extras && extras.top.length > 0 && <PlayButtons songs={extras.top} />}
        </div>
      </div>
      {extras && extras.top.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">{t('Популярные треки')}</h2>
          <SongList songs={extras.top.slice(0, 10)} showAlbum />
        </section>
      )}
      <section className="space-y-2">
        <h2 className="section-title">{t('Альбомы')}</h2>
        <AlbumGrid albums={albums ?? []} loading={!albums} />
      </section>
      <About html={extras?.info.biography} />
      {similar.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">{t('Похожие исполнители')}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {similar.map((one) => (
              <li key={one.id}>
                <ArtistRow artist={one} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function PlaylistsView() {
  const { playlists } = useStore()
  return (
    <div className="space-y-6">
      <Title
        action={
          <button onClick={() => void newPlaylistMenu()} className="btn btn-accent">
            <Icon name="add" size={14} />
            {t('Новый плейлист')}
          </button>
        }
      >
        {t('Плейлисты')}
      </Title>
      {!playlists.length && <p className="text-secondary">{t('Плейлистов на сервере пока нет.')}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            <button
              onClick={() => store.open({ kind: 'playlist', playlist })}
              onContextMenu={(event) => {
                event.preventDefault()
                void playlistMenu(playlist)
              }}
              className="card list-row flex w-full items-center gap-3 p-2 text-left"
            >
              <Cover id={playlist.coverArt} size={56} rounded="rounded-[var(--radius-control)]" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{playlist.name}</span>
                <span className="block text-xs text-secondary">{t('Треков: {n}', { n: playlist.songCount ?? 0 })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PlaylistView({ playlist }: { playlist: Playlist }) {
  const { songs, playlists, smartIds } = useStore()
  const smart = smartIds?.has(playlist.id) ?? false
  const loaded = songs[playlist.id]
  const list = loaded ?? []
  // Свежие сведения (название, число треков) — из общего списка: страница могла открыться до правки.
  const current = playlists.find((one) => one.id === playlist.id) ?? playlist
  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <Cover id={current.coverArt} size={180} />
        <div className="flex min-w-0 flex-col justify-end gap-2">
          <p className="text-xs uppercase tracking-wider text-secondary">{smart ? t('Умный плейлист') : t('Плейлист')}</p>
          <h1 className="page-title">{current.name}</h1>
          <p className="text-sm text-secondary">
            {[t('{n} треков', { n: list.length || current.songCount || 0 }), list.length ? totalTime(list) : ''].filter(Boolean).join(' · ')}
          </p>
          <div className="flex gap-2 pt-2">
            <PlayButtons songs={list} downloadable />
            {smart && (
              <button onClick={() => store.open({ kind: 'smart', id: current.id })} className="btn">
                <Icon name="smart" size={14} />
                {t('Правила')}
              </button>
            )}
            <button onClick={() => void playlistMenu(current)} className="btn" title={t('Ещё')} aria-label={t('Ещё')}>
              <Icon name="more" size={14} />
            </button>
          </div>
        </div>
      </div>
      {loaded ? (
        list.length && smart ? (
          <SongList songs={list} showAlbum />
        ) : list.length ? (
          <>
            <p className="text-xs text-secondary">{t('Порядок меняется перетаскиванием строк. Треки можно перетащить сюда из любого списка.')}</p>
            <SongList
              songs={list}
              showAlbum
              listKey={`playlist:${playlist.id}`}
              onReorder={(from, to) => void store.reorderPlaylist(current, from, to)}
              onDropSongs={(dropped) => void store.addToPlaylist(current, dropped)}
              onRemove={(_, indexes) => void store.removeFromPlaylist(current, indexes)}
              removeLabel={t('Убрать из плейлиста')}
            />
          </>
        ) : smart ? (
          <p className="card p-6 text-secondary">{t('Под правила пока не подходит ни один трек.')}</p>
        ) : (
          <PlaylistEmpty playlist={current} />
        )
      ) : (
        <SongListSkeleton />
      )}
    </div>
  )
}

/** Пустой плейлист — сам цель для перетаскивания: сюда можно бросить треки из любого списка. */
function PlaylistEmpty({ playlist }: { playlist: Playlist }) {
  const drag = useDrag()
  const key = `playlist-empty:${playlist.id}`
  useEffect(() => registerDrop(key, (payload) => void store.addToPlaylist(playlist, payload.songs)), [key, playlist])
  return (
    <div data-drop={key} className={`card grid place-items-center gap-2 border border-dashed border-stroke p-10 text-center ${drag?.target === key ? 'drop-target' : ''}`}>
      <Icon name="playlistAdd" size={28} className="text-secondary" />
      <p className="font-medium">{t('Плейлист пуст')}</p>
      <p className="text-sm text-secondary">{t('Перетащи сюда треки или добавь их через меню «Добавить в плейлист».')}</p>
    </div>
  )
}

export function FavoritesView() {
  const { starred } = useStore()
  return (
    <div className="space-y-6">
      <Title action={<PlayButtons songs={starred} />}>{t('Любимые треки')}</Title>
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
      <h1 className="page-title">{t('Поиск')}</h1>
      <div className="relative max-w-2xl">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('Треки, альбомы, артисты')}
          className="field pr-10"
        />
        <Icon name="search" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
      </div>
      {search && !search.songs.length && !search.albums.length && !search.artists.length && (
        <p className="text-sm text-secondary">{t('По запросу «{query}» ничего не нашлось.', { query: search.query })}</p>
      )}
      {search?.artists.length ? (
        <section className="space-y-3">
          <h2 className="section-title">{t('Артисты')}</h2>
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
          <h2 className="section-title">{t('Альбомы')}</h2>
          <AlbumGrid albums={search.albums} />
        </section>
      ) : null}
      {search?.songs.length ? (
        <section className="space-y-3">
          <h2 className="section-title">{t('Треки')}</h2>
          <SongList songs={search.songs} showAlbum />
        </section>
      ) : null}
    </div>
  )
}

export function GenresView() {
  const { genres } = useStore()
  return (
    <div className="space-y-6">
      <Title>{t('Жанры')}</Title>
      {!genres.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="skeleton h-20 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {genres.map((genre, index) => (
            <li key={genre.value}>
              <button
                onClick={() => store.open({ kind: 'genre', genre: genre.value })}
                className="genre-tile list-row relative flex h-20 w-full flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-3 text-left"
                style={{ '--hue': `${(index * 47) % 360}` } as React.CSSProperties}
              >
                <span className="relative truncate font-semibold">{genre.value}</span>
                <span className="relative text-xs text-white/70">{t('Альбомов: {n}', { n: genre.albumCount ?? 0 })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function GenreView({ genre }: { genre: string }) {
  const { genreAlbums } = useStore()
  const albums = genreAlbums[genre]
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-secondary">{t('Жанр')}</p>
        <h1 className="page-title">{genre}</h1>
      </div>
      <AlbumGrid albums={albums ?? []} loading={!albums} />
    </div>
  )
}

export function RadioView() {
  const { radio, queue, playing } = useStore()
  const current = queue?.current?.song.id
  return (
    <div className="space-y-6">
      <Title>{t('Радио')}</Title>
      {!radio.length ? (
        <div className="card p-6 text-sm text-secondary">
          <p className="font-medium text-primary">{t('Радиостанций пока нет')}</p>
          <p className="mt-2">{t('Добавь их в веб-интерфейсе Navidrome: «Радио» → «Создать». Они появятся здесь и на телефоне.')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {radio.map((station) => {
            const on = current === `radio:${station.id}`
            return (
              <li key={station.id}>
                <button onClick={() => void store.playRadio(station)} className={`card list-row flex w-full items-center gap-3 p-3 text-left ${on ? 'is-current' : ''}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? 'btn-accent' : 'bg-surface-strong text-secondary'}`}>
                    <Icon name={on && playing ? 'volume' : 'radio'} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${on ? 'text-accent-text' : ''}`}>{station.name}</span>
                    <span className="block truncate text-xs text-secondary">{station.streamUrl.replace(/^https?:\/\//, '')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function LocalEmpty() {
  const { musicFolder } = useStore()
  return (
    <div className="card p-6 text-sm text-secondary">
      <p className="font-medium text-primary">{t('На компьютере пока нет музыки')}</p>
      <p className="mt-2">
        {t('Добавь файлы или папку кнопками выше, перетащи их в окно или положи в папку')}{' '}
        {musicFolder ? <span className="text-primary">{musicFolder}</span> : t(isWindows ? 'Музыка\\Nocturne' : 'Музыка → Nocturne')} {t('— приложение найдёт их само.')}
        {t('Поддерживаются MP3, M4A, AAC, ALAC, FLAC, WAV, AIFF, OGG.')}
      </p>
    </div>
  )
}

export function LocalView() {
  const { local, importing } = useStore()
  const button = 'btn'
  return (
    <div className="space-y-6">
      <Title action={<PlayButtons songs={local} />}>{t('На компьютере')}</Title>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void store.importMusic('files')} disabled={importing} className={button}>
          <Icon name="add" size={14} />
          {t('Добавить файлы')}
        </button>
        <button onClick={() => void store.importMusic('folder')} disabled={importing} className={button}>
          <Icon name="folder" size={14} />
          {t('Добавить папку')}
        </button>
        <button onClick={() => store.openMusicFolder()} className={button}>
          <Icon name="folderOpen" size={14} />
          {isWindows ? t('Открыть в проводнике') : isMac ? t('Показать в Finder') : t('Открыть папку')}
        </button>
        <button onClick={() => void store.loadOnDisk()} className={button}>
          <Icon name="refresh" size={14} />
          {t('Пересканировать')}
        </button>
      </div>
      {importing && <p className="text-sm text-secondary">{t('Добавляю музыку…')}</p>}
      {local.length ? (
        <>
          <p className="text-xs text-secondary">{t('Треков: {n}', { n: local.length })}</p>
          <SongList songs={local} showAlbum onRemove={(songs) => songs.forEach((song) => void store.removeLocal(song))} removeLabel={t('Удалить файл с компьютера')} />
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
      <Title action={<PlayButtons songs={downloadedSongs} />}>{t('Загрузки')}</Title>
      <p className="text-sm text-secondary">
        {t('Треки с сервера, сохранённые для прослушивания без сети.')}{pending ? ` ${t('Сейчас скачивается: {n}.', { n: pending })}` : ''}
      </p>
      <SongList songs={downloadedSongs} showAlbum onRemove={(songs) => songs.forEach((song) => void store.removeDownload(song))} removeLabel={t('Удалить загрузку')} />
    </div>
  )
}
