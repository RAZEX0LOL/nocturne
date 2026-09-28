package app.nocturne.music

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.nocturne.core.*
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import java.io.File
import kotlin.math.sin
import kotlinx.coroutines.delay

private val Background = Color(0xFF0E0E13)
private val Surface = Color(0xFF1B1B23)
private val Muted = Color(0xFF9C9CAA)

@Composable internal fun NocturneTheme(accent: AccentTheme = AccentTheme.violet, content: @Composable () -> Unit) {
    val color = Color(accent.color)
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = color, onPrimary = Background, background = Background,
            surface = Surface, onSurface = Color.White, onSurfaceVariant = Muted,
        ),
        content = content,
    )
}

/**
 * Обложки, скачанные рядом с треками. Через локальное значение, а не параметром: обложку рисуют
 * восемь разных мест, и всем нужен один и тот же список.
 */
internal val LocalCoverFiles = staticCompositionLocalOf<Map<String, String>> { emptyMap() }

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun NocturneApp(vm: MusicViewModel) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var fullPlayer by rememberSaveable { mutableStateOf(false) }
    val accent = MaterialTheme.colorScheme.primary

    if (vm.client == null && !vm.demo && !vm.onDeviceOnly) {
        Surface(color = Background, modifier = Modifier.fillMaxSize()) { ConnectionScreen(vm) {} }
    } else {
        BackHandler(vm.detail != null) { vm.closeDetail() }
        val titles = if (vm.onDeviceOnly) listOf("На телефоне", "Медиатека", "Поиск") else listOf("Главная", "Медиатека", "Поиск")
        Scaffold(containerColor = Background, topBar = {
            LargeTopAppBar(
                title = { Text(vm.detail?.title ?: titles[tab], fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { if (vm.detail != null) IconButton(onClick = vm::closeDetail) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
                actions = { IconButton(onClick = { settingsOpen = true }) { Icon(Icons.Rounded.Settings, "Настройки") } },
                colors = TopAppBarDefaults.largeTopAppBarColors(containerColor = Background),
            )
        }, bottomBar = {
            Column {
                vm.playback.current?.let { song ->
                    Row(
                        Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(Surface)
                            .clickable { fullPlayer = true }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Cover(song.coverArt, vm.client, Modifier.size(46.dp))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                            Text(song.artist, color = Muted, maxLines = 1, style = MaterialTheme.typography.bodySmall)
                        }
                        PlayerButton(if (vm.playback.playing || vm.playback.buffering) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Воспроизведение / пауза", vm::toggle)
                        PlayerButton(Icons.Rounded.SkipNext, "Следующий трек", vm::next)
                    }
                }
                NavigationBar(containerColor = Background) {
                    val icons = listOf(Icons.Rounded.Home, Icons.Rounded.LibraryMusic, Icons.Rounded.Search)
                    titles.forEachIndexed { index, title ->
                        NavigationBarItem(
                            selected = tab == index,
                            onClick = { tab = index; vm.closeDetail() },
                            icon = { Icon(icons[index], title) },
                            label = { Text(title) },
                            modifier = Modifier.testTag("tab_$index"),
                        )
                    }
                }
            }
        }) { padding ->
            Box(Modifier.padding(padding)) {
                val detail = vm.detail
                if (detail != null) DetailScreen(vm, detail)
                else when (tab) {
                    0 -> HomeScreen(vm) { settingsOpen = true }
                    1 -> LibraryScreen(vm)
                    else -> SearchScreen(vm)
                }
            }
        }
    }

    if (settingsOpen) ModalBottomSheet(onDismissRequest = { if (!vm.connecting) settingsOpen = false }, containerColor = Background) {
        SettingsScreen(vm) { settingsOpen = false }
    }
    if (fullPlayer && vm.playback.current != null) Dialog(onDismissRequest = { fullPlayer = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = Background) { PlayerScreen(vm) { fullPlayer = false } }
    }
    vm.error?.let { message ->
        AlertDialog(
            onDismissRequest = { vm.error = null }, title = { Text("Nocturne") }, text = { Text(message) },
            confirmButton = { TextButton(onClick = { vm.error = null }) { Text("Понятно") } },
        )
    }
    vm.notice?.let { message ->
        LaunchedEffect(message) { delay(2500); vm.notice = null }
        Box(Modifier.fillMaxSize().padding(top = 90.dp), contentAlignment = Alignment.TopCenter) {
            Surface(color = Surface, shape = RoundedCornerShape(12.dp), tonalElevation = 3.dp) {
                Text(message, Modifier.padding(horizontal = 16.dp, vertical = 10.dp), color = accent, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable private fun ConnectionScreen(vm: MusicViewModel, done: () -> Unit) {
    var server by remember { mutableStateOf(vm.client?.credentials?.server?.toString().orEmpty()) }
    var username by remember { mutableStateOf(vm.client?.credentials?.username.orEmpty()) }
    var password by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp).statusBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Icon(Icons.Rounded.GraphicEq, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 16.dp).size(64.dp))
        Text("Твоя музыка.\nТвоё пространство.", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Подключи Navidrome и забери любимую музыку с собой.", color = Muted)
        OutlinedTextField(server, { server = it }, label = { Text("Адрес сервера") }, placeholder = { Text("https://music.example.com") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(username, { username = it }, label = { Text("Логин") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(password, { password = it }, label = { Text("Пароль Navidrome") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(
            onClick = { vm.connect(server, username, password) { password = ""; done() } },
            enabled = !vm.connecting && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp),
        ) {
            if (vm.connecting) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Подключиться", fontWeight = FontWeight.SemiBold)
        }
        Text("Данные входа зашифрованы ключом из Android Keystore и исключены из резервной копии.", color = Muted, style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { vm.useOnDevice(); done() }, enabled = !vm.connecting, modifier = Modifier.fillMaxWidth()) {
            Text("Слушать музыку с телефона — без сервера")
        }
        if (vm.client == null) TextButton(onClick = { vm.useDemo(); done() }, enabled = !vm.connecting, modifier = Modifier.fillMaxWidth()) { Text("Посмотреть демоверсию") }
        Text("NOCTURNE", letterSpacing = 5.sp, color = Muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterHorizontally).padding(16.dp))
    }
}

@Composable private fun OfflineBanner(vm: MusicViewModel) {
    if (!vm.offline) return
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Surface).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.CloudOff, null, tint = Color(0xFFFFB86B))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text("Нет связи с сервером", style = MaterialTheme.typography.titleSmall)
            Text("Играет то, что на телефоне и в загрузках.", color = Muted, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = vm::retry) { Text("Повторить") }
    }
}

@Composable private fun HomeScreen(vm: MusicViewModel, settings: () -> Unit) {
    val onDisk = remember(vm.local, vm.downloaded) { vm.local + vm.downloaded }
    if (vm.onDeviceOnly || vm.offline) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { OfflineBanner(vm) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (vm.offline) "Доступно без сети" else "Моя музыка", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    if (onDisk.isNotEmpty()) IconButton(onClick = { vm.play(onDisk, 0, shuffle = true) }) { Icon(Icons.Rounded.Shuffle, "Перемешать всё") }
                }
            }
            if (onDisk.isEmpty()) item { EmptyState("На телефоне пока нет музыки", "Открой «Медиатека → На телефоне» и добавь файлы или папку.") }
            itemsIndexed(onDisk) { index, song -> SongRow(song, vm) { vm.play(onDisk, index) } }
        }
        return
    }
    LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(24.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        if (vm.demo) item(span = { GridItemSpan(2) }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Surface).clickable(onClick = settings).padding(18.dp)) {
                Text("Твоя музыка будет здесь", fontWeight = FontWeight.SemiBold)
                Text("Демоверсия · Подключить Navidrome", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (vm.starred.isNotEmpty()) {
            item(span = { GridItemSpan(2) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Любимые треки", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { vm.play(vm.starred, 0) }) { Icon(Icons.Rounded.PlayArrow, "Слушать избранное") }
                }
            }
            items(vm.starred.take(4), span = { GridItemSpan(2) }, key = { "starred-${it.id}" }) { song ->
                SongRow(song, vm) { vm.play(vm.starred, vm.starred.indexOf(song)) }
            }
        }
        item(span = { GridItemSpan(2) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Недавно добавлено", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                IconButton(onClick = { vm.refresh() }, enabled = !vm.loading && !vm.demo) { Icon(Icons.Rounded.Refresh, "Обновить") }
            }
        }
        items(vm.albums, key = { it.id }) { AlbumCard(it, vm) }
        if (vm.loading) item(span = { GridItemSpan(2) }) { Loading() }
        if (!vm.loading && vm.albums.isEmpty()) item(span = { GridItemSpan(2) }) { EmptyState("Здесь пока тихо", "Добавь музыку в Navidrome и обнови медиатеку.") }
        if (vm.hasMore) item(span = { GridItemSpan(2) }) { TextButton(onClick = { vm.refresh(more = true) }, enabled = !vm.loading) { Text("Загрузить ещё") } }
    }
}

@Composable private fun AlbumCard(album: Album, vm: MusicViewModel) {
    Column(Modifier.clickable { vm.openAlbum(album) }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Cover(album.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Text(album.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
        Text(album.artist, maxLines = 1, overflow = TextOverflow.Ellipsis, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun LibraryScreen(vm: MusicViewModel) {
    // Своё и скачанное — первыми: за ними лезут чаще всего, особенно когда сети нет.
    val categories = remember(vm.onDeviceOnly, vm.offline) {
        when {
            vm.onDeviceOnly -> listOf("На телефоне")
            vm.offline -> listOf("На телефоне", "Загрузки", "Плейлисты")
            else -> listOf("На телефоне", "Загрузки", "Альбомы", "Артисты", "Плейлисты", "Избранное")
        }
    }
    var category by rememberSaveable { mutableIntStateOf(0) }
    val current = categories.getOrElse(category) { categories.first() }

    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                categories.forEachIndexed { index, title ->
                    val badge = when (title) {
                        "На телефоне" -> vm.local.size
                        "Загрузки" -> vm.downloaded.size
                        else -> 0
                    }
                    FilterChip(
                        selected = current == title,
                        onClick = { category = index },
                        label = { Text(if (badge > 0) "$title · $badge" else title) },
                    )
                }
            }
        }
        item { OfflineBanner(vm) }
        when (current) {
            "На телефоне" -> localSection(vm)
            "Загрузки" -> downloadsSection(vm)
            "Альбомы" -> {
                items(vm.albums, key = { it.id }) { AlbumRow(it, vm) }
                if (vm.hasMore) item { TextButton(onClick = { vm.refresh(true) }, enabled = !vm.loading) { Text("Загрузить ещё") } }
            }
            "Артисты" -> items(vm.artists, key = { it.id }) { artist ->
                MusicRow(artist.name, "Альбомов: ${artist.albumCount}", artist.coverArt, vm.client) { vm.openArtist(artist) }
            }
            "Плейлисты" -> {
                if (vm.playlists.isEmpty()) item { EmptyState("Плейлистов пока нет", "Плейлисты из Navidrome появятся здесь.") }
                items(vm.playlists, key = { it.id }) { playlist ->
                    MusicRow(playlist.name, "Треков: ${playlist.songCount}", playlist.coverArt, vm.client) { vm.openPlaylist(playlist) }
                }
            }
            else -> {
                if (vm.starred.isEmpty()) item { EmptyState("Избранного пока нет", "Отмечай треки сердцем — они соберутся здесь.") }
                itemsIndexed(vm.starred) { index, song -> SongRow(song, vm) { vm.play(vm.starred, index) } }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.localSection(vm: MusicViewModel) {
    item { LocalControls(vm) }
    if (vm.local.isEmpty()) {
        item { EmptyState("На телефоне пока нет музыки", "Добавь файлы или папку кнопками выше. Поддерживаются MP3, M4A, AAC, FLAC, WAV, OGG.") }
    } else {
        item { Text("Треков: ${vm.local.size}", color = Muted, style = MaterialTheme.typography.bodySmall) }
        itemsIndexed(vm.local) { index, song -> SongRow(song, vm) { vm.play(vm.local, index) } }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.downloadsSection(vm: MusicViewModel) {
    item {
        Text(
            "Треки с сервера, сохранённые для прослушивания без сети." +
                if (vm.downloading.isNotEmpty()) " Сейчас скачивается: ${vm.downloading.size}." else "",
            color = Muted, style = MaterialTheme.typography.bodySmall,
        )
    }
    if (vm.downloaded.isEmpty()) {
        item { EmptyState("Загрузок пока нет", "Открой альбом и нажми «Скачать», чтобы слушать без сети.") }
    } else {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { vm.play(vm.downloaded, 0) }) { Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text("Слушать") }
                OutlinedButton(onClick = { vm.play(vm.downloaded, 0, shuffle = true) }) { Text("Перемешать") }
            }
        }
        itemsIndexed(vm.downloaded) { index, song -> SongRow(song, vm) { vm.play(vm.downloaded, index) } }
    }
}

@Composable private fun LocalControls(vm: MusicViewModel) {
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris: List<Uri> -> vm.importMusic(uris) }
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? -> uri?.let { vm.importMusic(listOf(it)) } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { files.launch(arrayOf("audio/*")) }, enabled = !vm.importing) {
                Icon(Icons.Rounded.LibraryAdd, null); Spacer(Modifier.width(6.dp)); Text("Файлы")
            }
            OutlinedButton(onClick = { folder.launch(null) }, enabled = !vm.importing) { Text("Папка") }
            OutlinedButton(onClick = vm::rescan, enabled = !vm.importing) { Text("Обновить") }
        }
        if (vm.importing) Text("Добавляю музыку…", color = Muted, style = MaterialTheme.typography.bodySmall)
        Text("Папка на телефоне: ${vm.musicFolder}", color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun AlbumRow(album: Album, vm: MusicViewModel) =
    MusicRow(album.name, "${album.artist} · ${album.year ?: ""}", album.coverArt, vm.client) { vm.openAlbum(album) }

@Composable private fun MusicRow(title: String, subtitle: String, cover: String?, client: NavidromeClient?, action: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = action).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Cover(cover, client, Modifier.size(66.dp))
        Column(Modifier.weight(1f).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, color = Muted, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
        }
        Icon(Icons.Rounded.ChevronRight, null, tint = Muted)
    }
}

@Composable private fun DetailScreen(vm: MusicViewModel, detail: Detail) {
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Cover(detail.cover, vm.client, Modifier.size(250.dp))
                Text(detail.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                if (detail.songs.isNotEmpty()) {
                    Button(onClick = { vm.play(detail.songs) }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(8.dp)); Text("Слушать")
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { vm.play(detail.songs, 0, shuffle = true) }) { Text("Перемешать") }
                        val missing = detail.songs.filterNot(vm::isDownloaded)
                        if (vm.client != null && !vm.offline) OutlinedButton(
                            onClick = { vm.download(detail.songs) },
                            enabled = missing.isNotEmpty() && vm.downloading.isEmpty(),
                        ) {
                            Icon(Icons.Rounded.Download, null); Spacer(Modifier.width(6.dp))
                            Text(if (missing.isEmpty()) "Скачано" else "Скачать")
                        }
                    }
                }
            }
        }
        if (detail.loading) item { Loading() }
        items(detail.albums, key = { it.id }) { AlbumRow(it, vm) }
        itemsIndexed(detail.songs) { index, song -> SongRow(song, vm) { vm.play(detail.songs, index) } }
        if (!detail.loading && detail.albums.isEmpty() && detail.songs.isEmpty()) item { EmptyState("Пока пусто", "Здесь появится твоя музыка.") }
    }
}

@Composable private fun SongRow(song: Song, vm: MusicViewModel, action: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val playable = vm.isPlayable(song)
    val accent = MaterialTheme.colorScheme.primary
    Row(
        Modifier.fillMaxWidth().clickable { if (playable) action() else vm.notice = "Трек не скачан — недоступен без сети" }
            .alpha(if (playable) 1f else 0.4f).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(song.coverArt, vm.client, Modifier.size(48.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(song.title, color = if (vm.playback.current?.id == song.id) accent else Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
            Text(song.artist, color = Muted, maxLines = 1, style = MaterialTheme.typography.bodySmall)
        }
        if (vm.isDownloaded(song)) Icon(Icons.Rounded.DownloadDone, "Скачано", tint = Muted, modifier = Modifier.size(18.dp))
        Text(timeLabel(((song.duration ?: 0.0) * 1000).toLong()), color = Muted, style = MaterialTheme.typography.bodySmall)
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "Действия с треком", tint = Muted) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Сыграть следующим") }, onClick = { menu = false; vm.playNext(listOf(song)) })
                DropdownMenuItem(text = { Text("В конец очереди") }, onClick = { menu = false; vm.appendToQueue(listOf(song)) })
                if (!isLocalId(song.id) && vm.client != null && !vm.offline) {
                    DropdownMenuItem(
                        text = { Text(if (vm.isStarred(song)) "Убрать из избранного" else "В избранное") },
                        onClick = { menu = false; vm.toggleStar(song) },
                    )
                    if (!vm.isDownloaded(song)) DropdownMenuItem(text = { Text("Скачать") }, onClick = { menu = false; vm.download(listOf(song)) })
                }
                if (vm.isDownloaded(song)) DropdownMenuItem(text = { Text("Удалить загрузку") }, onClick = { menu = false; vm.removeDownload(song) })
                if (isLocalId(song.id)) DropdownMenuItem(text = { Text("Удалить с телефона") }, onClick = { menu = false; vm.removeLocal(song) })
            }
        }
    }
}

@Composable private fun SearchScreen(vm: MusicViewModel) {
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query) { vm.search(query.trim()) }
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            OutlinedTextField(
                query, { query = it }, placeholder = { Text("Поиск в медиатеке") },
                leadingIcon = { Icon(Icons.Rounded.Search, null) }, modifier = Modifier.fillMaxWidth(),
                singleLine = true, shape = RoundedCornerShape(18.dp),
            )
        }
        if (query.isBlank()) item { EmptyState("Найди своё звучание", "Альбомы, исполнители и любимые треки.") }
        else if (vm.searchLoading) item { Loading() }
        else {
            if (vm.search.artists.isNotEmpty()) item { SectionTitle("Исполнители") }
            items(vm.search.artists) { artist -> MusicRow(artist.name, "Исполнитель", artist.coverArt, vm.client) { vm.openArtist(artist) } }
            if (vm.search.albums.isNotEmpty()) item { SectionTitle("Альбомы") }
            items(vm.search.albums) { AlbumRow(it, vm) }
            if (vm.search.songs.isNotEmpty()) item { SectionTitle("Треки") }
            itemsIndexed(vm.search.songs) { index, song -> SongRow(song, vm) { vm.play(vm.search.songs, index) } }
            if (vm.search == SearchResult()) item { EmptyState("Ничего не найдено", "Попробуй другое название или исполнителя.") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun PlayerScreen(vm: MusicViewModel, close: () -> Unit) {
    val state = vm.playback
    val song = state.current ?: return
    var showQueue by remember { mutableStateOf(false) }
    var showLyrics by remember { mutableStateOf(false) }
    var sleepMenu by remember { mutableStateOf(false) }
    val timerOn = vm.sleepAt != null || vm.sleepAtTrackEnd
    var scrub by remember(song.id) { mutableFloatStateOf(-1f) }
    val accent = MaterialTheme.colorScheme.primary

    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(accent.copy(alpha = .22f), Background)))
            .verticalScroll(rememberScrollState()).padding(24.dp).systemBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlayerButton(Icons.Rounded.KeyboardArrowDown, "Свернуть", close)
            Text("СЕЙЧАС ИГРАЕТ", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, letterSpacing = 2.sp)
            if (!isLocalId(song.id) && vm.client != null) PlayerButton(
                if (vm.isStarred(song)) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                "В избранное", { vm.toggleStar(song) }, if (vm.isStarred(song)) accent else Color.White,
            )
            PlayerButton(Icons.AutoMirrored.Rounded.QueueMusic, "Очередь", { showQueue = true })
        }
        Cover(song.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(song.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(song.artist, color = Muted, style = MaterialTheme.typography.titleMedium)
        }
        Column {
            Slider(
                value = if (scrub >= 0) scrub else state.position.toFloat().coerceIn(0f, state.duration.coerceAtLeast(1).toFloat()),
                onValueChange = { scrub = it },
                onValueChangeFinished = { vm.seek(scrub.toLong()); scrub = -1f },
                valueRange = 0f..state.duration.coerceAtLeast(1).toFloat(),
            )
            Row {
                Text(timeLabel(state.position), color = Muted, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.weight(1f))
                Text("−${timeLabel((state.duration - state.position).coerceAtLeast(0))}", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            PlayerButton(Icons.Rounded.Shuffle, "Перемешивать", vm::toggleShuffle, if (state.shuffle) accent else Color.White)
            PlayerButton(Icons.Rounded.SkipPrevious, "Предыдущий трек", vm::previous)
            FilledIconButton(
                onClick = vm::toggle, modifier = Modifier.size(80.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White.copy(alpha = .12f), contentColor = Color.White),
            ) {
                if (state.buffering) CircularProgressIndicator(Modifier.size(30.dp))
                else Icon(if (state.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Воспроизведение / пауза", Modifier.size(38.dp))
            }
            PlayerButton(Icons.Rounded.SkipNext, "Следующий трек", vm::next)
            PlayerButton(
                if (state.repeat == PlaybackQueue.Repeat.one) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                "Режим повтора", vm::cycleRepeat, if (state.repeat == PlaybackQueue.Repeat.off) Color.White else accent,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            TextButton(onClick = { showLyrics = true; vm.loadLyrics(song) }) { Text("Текст") }
            Box {
                TextButton(onClick = { sleepMenu = true }) { Text(if (timerOn) "Таймер включён" else "Таймер сна") }
                DropdownMenu(expanded = sleepMenu, onDismissRequest = { sleepMenu = false }) {
                    if (timerOn) DropdownMenuItem(text = { Text("Выключить таймер") }, onClick = { sleepMenu = false; vm.setSleepTimer(null) })
                    DropdownMenuItem(text = { Text("В конце трека") }, onClick = { sleepMenu = false; vm.setSleepTimer(0) })
                    listOf(15, 30, 45, 60, 90).forEach { minutes ->
                        DropdownMenuItem(text = { Text("$minutes мин") }, onClick = { sleepMenu = false; vm.setSleepTimer(minutes) })
                    }
                }
            }
            TextButton(onClick = { showQueue = true }) { Text("Очередь · ${state.queue.size}") }
        }
    }

    if (showQueue) ModalBottomSheet(onDismissRequest = { showQueue = false }, containerColor = Background) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { SectionTitle("Очередь") }
            itemsIndexed(state.queue) { index, entry ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { SongRow(entry, vm) { vm.selectQueue(index) } }
                    IconButton(onClick = { vm.removeFromQueue(index) }) { Icon(Icons.Rounded.Close, "Убрать из очереди", tint = Muted) }
                }
            }
        }
    }
    if (showLyrics) ModalBottomSheet(onDismissRequest = { showLyrics = false }, containerColor = Background) {
        LyricsSheet(vm)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun SettingsScreen(vm: MusicViewModel, close: () -> Unit) {
    val settings = vm.settings
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Настройки", Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            TextButton(onClick = close) { Text("Готово") }
        }

        SectionTitle("Качество потока")
        QualityPicker("Wi-Fi", settings.wifiQuality) { settings.chooseWifiQuality(it) }
        QualityPicker("Мобильная сеть", settings.cellularQuality) { settings.chooseCellularQuality(it) }
        Text("Новое качество применяется со следующего трека.", color = Muted, style = MaterialTheme.typography.bodySmall)

        SectionTitle("Громкость")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ReplayGainMode.entries.forEach { mode ->
                FilterChip(
                    selected = settings.replayGain == mode,
                    onClick = { settings.chooseReplayGain(mode) },
                    label = { Text(when (mode) { ReplayGainMode.off -> "Выключено"; ReplayGainMode.track -> "По треку"; ReplayGainMode.album -> "По альбому" }) },
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            listOf(0f, 2f, 4f, 6f, 8f).forEach { seconds ->
                FilterChip(
                    selected = settings.fadeSeconds == seconds,
                    onClick = { settings.chooseFadeSeconds(seconds) },
                    label = { Text(if (seconds == 0f) "Без затухания" else "${seconds.toInt()} с") },
                )
            }
        }
        Text("Затухание между треками.", color = Muted, style = MaterialTheme.typography.bodySmall)

        SectionTitle("Эквалайзер")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Включить", Modifier.weight(1f))
            Switch(checked = settings.equalizerEnabled, onCheckedChange = { settings.enableEqualizer(it) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Settings.EQ_PRESETS.forEach { (title, gains) ->
                AssistChip(onClick = { settings.enableEqualizer(true); settings.saveEqualizerGains(gains) }, label = { Text(title) })
            }
        }
        Settings.EQ_BANDS.forEachIndexed { index, band ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (band >= 1000) "${band / 1000}к" else "$band", Modifier.width(44.dp), color = Muted, style = MaterialTheme.typography.bodySmall)
                Slider(
                    value = settings.equalizerGains.getOrElse(index) { 0f },
                    onValueChange = { value ->
                        settings.saveEqualizerGains(settings.equalizerGains.toMutableList().also { it[index] = value })
                    },
                    valueRange = -12f..12f, steps = 47, enabled = settings.equalizerEnabled, modifier = Modifier.weight(1f),
                )
            }
        }

        SectionTitle("Загрузки")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Только по Wi-Fi", Modifier.weight(1f))
            Switch(checked = settings.downloadOverWifiOnly, onCheckedChange = { settings.limitDownloadsToWifi(it) })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Скачивать избранное", Modifier.weight(1f))
            Switch(checked = settings.downloadFavorites, onCheckedChange = { settings.autoDownloadFavorites(it) })
        }

        SectionTitle("Оформление")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AccentTheme.entries.forEach { theme ->
                FilterChip(selected = settings.accent == theme, onClick = { settings.chooseAccent(theme) }, label = { Text(theme.title) })
            }
        }

        SectionTitle("Сервер")
        when {
            vm.client != null -> {
                Text(vm.client?.credentials?.account.orEmpty(), color = Muted, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { vm.disconnect(); close() }) { Text("Отключить сервер", color = MaterialTheme.colorScheme.error) }
            }
            else -> TextButton(onClick = { vm.showConnect(); close() }) { Text("Подключить Navidrome") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun QualityPicker(title: String, current: StreamQuality, choose: (StreamQuality) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            StreamQuality.entries.forEach { quality ->
                FilterChip(
                    selected = current == quality,
                    onClick = { choose(quality) },
                    label = {
                        Text(
                            when (quality) {
                                StreamQuality.original -> "Оригинал"
                                StreamQuality.mp3High -> "MP3 320"
                                StreamQuality.mp3Medium -> "MP3 192"
                                StreamQuality.mp3Low -> "MP3 128"
                            }
                        )
                    },
                )
            }
        }
    }
}

@Composable private fun PlayerButton(icon: ImageVector, label: String, click: () -> Unit, tint: Color = Color.White) {
    IconButton(onClick = click) { Icon(icon, label, tint = tint, modifier = Modifier.size(27.dp)) }
}

@Composable private fun Cover(id: String?, client: NavidromeClient?, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    val accent = MaterialTheme.colorScheme.primary
    if (id?.startsWith("demo-") == true) {
        val seed = id.last().digitToIntOrNull() ?: 0
        val palettes = listOf(Color(0xFF95647E), Color(0xFFC8AB78), Color(0xFF7FA9B8), Color(0xFFA66B83), Color(0xFF78619C), Color(0xFF58928A))
        Canvas(modifier.clip(shape)) {
            drawRect(Brush.verticalGradient(listOf(palettes[seed % palettes.size], Color(0xFF142338))))
            drawCircle(Color(0xFFE3C7A0), size.width * .085f, Offset(size.width * .72f, size.height * .28f))
            repeat(4) { layer ->
                val path = Path().apply {
                    moveTo(0f, size.height)
                    for (step in 0..24) {
                        val x = step / 24f * size.width
                        val y = size.height * (.55f + layer * .12f + sin(step * .28f + (seed + layer) * 1.8f) * .1f)
                        lineTo(x, y)
                    }
                    lineTo(size.width, size.height); close()
                }
                drawPath(path, Color(0xFF142338).copy(alpha = .35f + layer * .16f))
            }
        }
    } else {
        val context = LocalContext.current
        val saved = LocalCoverFiles.current
        // Обложка своего файла лежит на диске, скачанная — рядом с треком, серверная — по подписанному адресу.
        val source = remember(id, client, saved) {
            when {
                id == null -> null
                id.startsWith(LocalLibrary.FILE_COVER_PREFIX) -> File(id.removePrefix(LocalLibrary.FILE_COVER_PREFIX))
                saved[id] != null -> File(saved.getValue(id))
                else -> client?.cover(id)
            }
        }
        val request = remember(source) {
            ImageRequest.Builder(context).data(source).diskCachePolicy(CachePolicy.DISABLED).crossfade(true).build()
        }
        Box(modifier.clip(shape).background(Surface), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.MusicNote, null, tint = accent, modifier = Modifier.fillMaxSize(.35f))
            AsyncImage(request, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
    }
}

@Composable private fun Loading() { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }

@Composable private fun EmptyState(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Rounded.MusicNote, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(subtitle, color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable private fun SectionTitle(title: String) { Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge) }

private fun timeLabel(milliseconds: Long): String {
    val seconds = milliseconds.coerceAtLeast(0) / 1000
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
}

/**
 * Текст песни. У синхронного текста подсвечивается текущая строка, список едет за ней сам,
 * и по строке можно перемотать — так же, как в приложении на iPhone.
 */
@Composable private fun LyricsSheet(vm: MusicViewModel) {
    val lyrics = vm.lyrics
    val lines = lyrics?.lines.orEmpty()
    val synced = lyrics?.synced == true
    val position = vm.playback.position
    val active = if (synced) lines.indexOfLast { (it.start ?: Int.MAX_VALUE) <= position } else -1
    val listState = rememberLazyListState()

    LaunchedEffect(active) { if (active >= 0) listState.animateScrollToItem(active) }

    Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 24.dp).heightIn(min = 200.dp, max = 460.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Текст песни")
        when {
            lyrics == null -> Loading()
            lines.isEmpty() -> Text("Navidrome не нашёл текст для этого трека.", color = Muted)
            else -> LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(if (synced) 14.dp else 6.dp)) {
                itemsIndexed(lines) { index, line ->
                    val start = line.start
                    Text(
                        line.value.ifEmpty { " " },
                        style = if (synced) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                        fontWeight = if (synced && index == active) FontWeight.Bold else FontWeight.Normal,
                        color = if (!synced || index == active) Color.White else Muted,
                        modifier = Modifier.fillMaxWidth().then(
                            if (synced && start != null) Modifier.clickable { vm.seek(start.toLong()) } else Modifier
                        ),
                    )
                }
            }
        }
    }
}
