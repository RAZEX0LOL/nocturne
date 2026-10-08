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
import android.os.Build
import androidx.compose.ui.draw.blur
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
import coil.imageLoader
import coil.request.CachePolicy
import coil.request.ImageRequest
import java.io.File
import kotlin.math.sin
import kotlinx.coroutines.delay

/** Цвета темы: фон, карточки, приглушённый текст и основной текст («чернила»). */
internal data class Palette(val background: Color, val surface: Color, val muted: Color, val ink: Color, val dark: Boolean)

private val DarkPalette = Palette(Color(0xFF0E0E13), Color(0xFF1B1B23), Color(0xFF9C9CAA), Color.White, dark = true)
private val OledPalette = Palette(Color.Black, Color(0xFF111115), Color(0xFF8E8E9C), Color.White, dark = true)
private val LightPalette = Palette(Color(0xFFF6F6F9), Color.White, Color(0xFF66667A), Color(0xFF15151D), dark = false)

internal val LocalPalette = staticCompositionLocalOf { DarkPalette }

private val Background: Color @Composable get() = LocalPalette.current.background
private val Surface: Color @Composable get() = LocalPalette.current.surface
private val Muted: Color @Composable get() = LocalPalette.current.muted
private val Ink: Color @Composable get() = LocalPalette.current.ink

/** Множитель радиусов из настройки «Углы»: все скругления интерфейса идут через rounded(). */
internal val LocalCornerScale = staticCompositionLocalOf { 1f }

@Composable internal fun rounded(radius: Int) = RoundedCornerShape((radius * LocalCornerScale.current).dp)

/**
 * Акцент из обложки: тот же оттенок, что выбрал бы iPhone, — пастельный на тёмном фоне.
 * hue/saturation — из CoverColor.vibrant.
 */
internal fun coverAccent(hue: Float, saturation: Float): Color =
    Color(android.graphics.Color.HSVToColor(floatArrayOf(hue * 360f, minOf(saturation, 0.5f), 0.98f)))

@Composable internal fun NocturneTheme(
    accent: AccentTheme = AccentTheme.violet,
    theme: ThemeMode = ThemeMode.dark,
    cover: Pair<Float, Float>? = null,
    corners: Corners = Corners.normal,
    content: @Composable () -> Unit,
) {
    val systemDark = androidx.compose.foundation.isSystemInDarkTheme()
    val palette = when (theme) {
        ThemeMode.dark -> DarkPalette
        ThemeMode.oled -> OledPalette
        ThemeMode.light -> LightPalette
        ThemeMode.system -> if (systemDark) DarkPalette else LightPalette
    }
    // Пастельный акцент на белом не читается: в светлой теме он темнее.
    val base = if (accent == AccentTheme.cover && cover != null) coverAccent(cover.first, cover.second) else Color(accent.color)
    val color = if (palette.dark) base else androidx.compose.ui.graphics.lerp(base, Color.Black, 0.35f)
    // Значки строки состояния и навигации — тёмные на светлом фоне, светлые на тёмном.
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? android.app.Activity)?.window ?: return@SideEffect
            androidx.core.view.WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !palette.dark
                isAppearanceLightNavigationBars = !palette.dark
            }
        }
    }
    val scheme = if (palette.dark) {
        darkColorScheme(
            primary = color, onPrimary = palette.background, background = palette.background,
            surface = palette.surface, onSurface = palette.ink, onSurfaceVariant = palette.muted,
        )
    } else {
        lightColorScheme(
            primary = color, onPrimary = Color.White, background = palette.background,
            surface = palette.surface, onSurface = palette.ink, onSurfaceVariant = palette.muted,
        )
    }
    val shapes = Shapes(
        extraSmall = RoundedCornerShape((4 * corners.scale).dp), small = RoundedCornerShape((8 * corners.scale).dp),
        medium = RoundedCornerShape((12 * corners.scale).dp), large = RoundedCornerShape((16 * corners.scale).dp),
        extraLarge = RoundedCornerShape((28 * corners.scale).dp),
    )
    CompositionLocalProvider(LocalPalette provides palette, LocalCornerScale provides corners.scale) {
        MaterialTheme(colorScheme = scheme, shapes = shapes, content = content)
    }
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
        val titles = if (vm.onDeviceOnly) listOf(tr("На телефоне"), tr("Медиатека"), tr("Поиск")) else listOf(tr("Главная"), tr("Медиатека"), tr("Поиск"))
        Scaffold(containerColor = Background, topBar = {
            LargeTopAppBar(
                title = { Text(vm.detail?.title ?: titles[tab], fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { if (vm.detail != null) IconButton(onClick = vm::closeDetail) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, tr("Назад")) } },
                actions = { IconButton(onClick = { settingsOpen = true }) { Icon(Icons.Rounded.Settings, tr("Настройки")) } },
                colors = TopAppBarDefaults.largeTopAppBarColors(containerColor = Background),
            )
        }, bottomBar = {
            Column {
                // Над мини-плеером, а не поверх шапки: иначе плашка закрывает кнопку настроек.
                vm.appUpdate?.let { update -> UpdateBanner(vm, update) }
                vm.remoteQueue?.let { remote -> RemoteQueueBanner(vm, remote) }
                vm.playback.current?.let { song ->
                    Row(
                        Modifier.padding(horizontal = 12.dp).clip(rounded(18)).background(Surface)
                            .clickable { fullPlayer = true }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Cover(song.coverArt, vm.client, Modifier.size(46.dp))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                            Text(tr(song.artist), color = Muted, maxLines = 1, style = MaterialTheme.typography.bodySmall)
                        }
                        PlayerButton(if (vm.playback.playing || vm.playback.buffering) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, tr("Воспроизведение / пауза"), vm::toggle)
                        PlayerButton(Icons.Rounded.SkipNext, tr("Следующий трек"), vm::next)
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
            confirmButton = { TextButton(onClick = { vm.error = null }) { Text(tr("Понятно")) } },
        )
    }
    vm.notice?.let { message ->
        LaunchedEffect(message) { delay(2500); vm.notice = null }
        Box(Modifier.fillMaxSize().padding(top = 90.dp), contentAlignment = Alignment.TopCenter) {
            Surface(color = Surface, shape = rounded(12), tonalElevation = 3.dp) {
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
        Text(tr("Твоя музыка.\nТвоё пространство."), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text(tr("Подключи Navidrome и забери любимую музыку с собой."), color = Muted)
        OutlinedTextField(server, { server = it }, label = { Text(tr("Адрес сервера")) }, placeholder = { Text("https://music.example.com") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(username, { username = it }, label = { Text(tr("Логин")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(password, { password = it }, label = { Text(tr("Пароль Navidrome")) }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(
            onClick = { vm.connect(server, username, password) { password = ""; done() } },
            enabled = !vm.connecting && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(54.dp), shape = rounded(16),
        ) {
            if (vm.connecting) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text(tr("Подключиться"), fontWeight = FontWeight.SemiBold)
        }
        Text(tr("Данные входа зашифрованы ключом из Android Keystore и исключены из резервной копии."), color = Muted, style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { vm.useOnDevice(); done() }, enabled = !vm.connecting, modifier = Modifier.fillMaxWidth()) {
            Text(tr("Слушать музыку с телефона — без сервера"))
        }
        if (vm.client == null) TextButton(onClick = { vm.useDemo(); done() }, enabled = !vm.connecting, modifier = Modifier.fillMaxWidth()) { Text(tr("Посмотреть демоверсию")) }
        Text("NOCTURNE", letterSpacing = 5.sp, color = Muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterHorizontally).padding(16.dp))
    }
}

/** «Играло на компьютере»: трек и место, где остановились на другом устройстве. */
@Composable private fun RemoteQueueBanner(vm: MusicViewModel, remote: app.nocturne.core.RemoteQueue) {
    val song = remote.songs.firstOrNull { it.id == remote.currentId } ?: remote.songs.first()
    val seconds = remote.positionMillis / 1000
    val fromComputer = remote.changedBy == "NocturneDesktop"
    Box(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp)) {
        Surface(color = Surface, shape = rounded(16), tonalElevation = 6.dp, shadowElevation = 6.dp) {
            Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (fromComputer) Icons.Rounded.Computer else Icons.Rounded.PhoneIphone, null, tint = MaterialTheme.colorScheme.primary)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(if (fromComputer) tr("Играло на компьютере") else tr("Играло на другом устройстве"), style = MaterialTheme.typography.titleSmall, maxLines = 1)
                    Text(tr("«{title}», с {time}", "title" to song.title, "time" to "%d:%02d".format(seconds / 60, seconds % 60)), color = Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
                Button(onClick = vm::acceptRemoteQueue, shape = rounded(12), contentPadding = PaddingValues(horizontal = 14.dp)) { Text(tr("Продолжить")) }
                IconButton(onClick = vm::dismissRemoteQueue) { Icon(Icons.Rounded.Close, tr("Закрыть"), tint = Muted) }
            }
        }
    }
}

/** Вышла новая версия: качается и ставится поверх, с ходом загрузки прямо в плашке. */
@Composable private fun UpdateBanner(vm: MusicViewModel, update: app.nocturne.core.AppUpdate) {
    val progress = vm.updateProgress
    Box(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp)) {
        Surface(color = Surface, shape = rounded(16), tonalElevation = 6.dp, shadowElevation = 6.dp) {
            Column {
                Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.SystemUpdate, null, tint = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(tr("Доступно обновление"), style = MaterialTheme.typography.titleSmall, maxLines = 1)
                        Text(
                            if (progress == null) tr("Версия {version} — встанет поверх, ничего не потеряется", "version" to update.versionName)
                            else tr("Скачиваю… {percent}%", "percent" to (progress * 100).toInt()),
                            color = Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2,
                        )
                    }
                    if (progress == null) {
                        Button(onClick = vm::installAppUpdate, shape = rounded(12), contentPadding = PaddingValues(horizontal = 14.dp)) { Text(tr("Обновить")) }
                        IconButton(onClick = vm::dismissAppUpdate) { Icon(Icons.Rounded.Close, tr("Закрыть"), tint = Muted) }
                    }
                }
                if (progress != null) LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 10.dp))
            }
        }
    }
}

@Composable private fun OfflineBanner(vm: MusicViewModel) {
    if (!vm.offline) return
    Row(
        Modifier.fillMaxWidth().clip(rounded(16)).background(Surface).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.CloudOff, null, tint = Color(0xFFFFB86B))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(tr("Нет связи с сервером"), style = MaterialTheme.typography.titleSmall)
            Text(tr("Играет то, что на телефоне и в загрузках."), color = Muted, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = vm::retry) { Text(tr("Повторить")) }
    }
}

@Composable private fun HomeScreen(vm: MusicViewModel, settings: () -> Unit) {
    val onDisk = remember(vm.local, vm.downloaded) { vm.local + vm.downloaded }
    if (vm.onDeviceOnly || vm.offline) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { OfflineBanner(vm) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (vm.offline) tr("Доступно без сети") else tr("Моя музыка"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    if (onDisk.isNotEmpty()) IconButton(onClick = { vm.play(onDisk, 0, shuffle = true) }) { Icon(Icons.Rounded.Shuffle, tr("Перемешать всё")) }
                }
            }
            if (onDisk.isEmpty()) item { EmptyState(tr("На телефоне пока нет музыки"), tr("Открой «Медиатека → На телефоне» и добавь файлы или папку.")) }
            itemsIndexed(onDisk) { index, song -> SongRow(song, vm) { vm.play(onDisk, index) } }
        }
        return
    }
    LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(24.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        if (vm.demo) item(span = { GridItemSpan(2) }) {
            Column(Modifier.fillMaxWidth().clip(rounded(18)).background(Surface).clickable(onClick = settings).padding(18.dp)) {
                Text(tr("Твоя музыка будет здесь"), fontWeight = FontWeight.SemiBold)
                Text(tr("Демоверсия · Подключить Navidrome"), color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (vm.starred.isNotEmpty()) {
            item(span = { GridItemSpan(2) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Любимые треки"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { vm.play(vm.starred, 0) }) { Icon(Icons.Rounded.PlayArrow, tr("Слушать избранное")) }
                }
            }
            items(vm.starred.take(4), span = { GridItemSpan(2) }, key = { "starred-${it.id}" }) { song ->
                SongRow(song, vm) { vm.play(vm.starred, vm.starred.indexOf(song)) }
            }
        }
        item(span = { GridItemSpan(2) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tr("Недавно добавлено"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                IconButton(onClick = { vm.refresh() }, enabled = !vm.loading && !vm.demo) { Icon(Icons.Rounded.Refresh, tr("Обновить")) }
            }
        }
        items(vm.albums, key = { it.id }) { AlbumCard(it, vm) }
        if (vm.loading) item(span = { GridItemSpan(2) }) { Loading() }
        if (!vm.loading && vm.albums.isEmpty()) item(span = { GridItemSpan(2) }) { EmptyState(tr("Здесь пока тихо"), tr("Добавь музыку в Navidrome и обнови медиатеку.")) }
        if (vm.hasMore) item(span = { GridItemSpan(2) }) { TextButton(onClick = { vm.refresh(more = true) }, enabled = !vm.loading) { Text(tr("Загрузить ещё")) } }
    }
}

@Composable private fun AlbumCard(album: Album, vm: MusicViewModel) {
    Column(Modifier.clickable { vm.openAlbum(album) }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Cover(album.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Text(album.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
        Text(tr(album.artist), maxLines = 1, overflow = TextOverflow.Ellipsis, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun LibraryScreen(vm: MusicViewModel) {
    // Своё и скачанное — первыми: за ними лезут чаще всего, особенно когда сети нет.
    val categories = remember(vm.onDeviceOnly, vm.offline) {
        when {
            vm.onDeviceOnly -> listOf(tr("На телефоне"))
            vm.offline -> listOf(tr("На телефоне"), tr("Загрузки"), tr("Плейлисты"))
            else -> listOf(tr("На телефоне"), tr("Загрузки"), tr("Альбомы"), tr("Артисты"), tr("Плейлисты"), tr("Избранное"))
        }
    }
    var category by rememberSaveable { mutableIntStateOf(0) }
    val current = categories.getOrElse(category) { categories.first() }

    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                categories.forEachIndexed { index, title ->
                    val badge = when (title) {
                        tr("На телефоне") -> vm.local.size
                        tr("Загрузки") -> vm.downloaded.size
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
            tr("На телефоне") -> localSection(vm)
            tr("Загрузки") -> downloadsSection(vm)
            tr("Альбомы") -> {
                items(vm.albums, key = { it.id }) { AlbumRow(it, vm) }
                if (vm.hasMore) item { TextButton(onClick = { vm.refresh(true) }, enabled = !vm.loading) { Text(tr("Загрузить ещё")) } }
            }
            tr("Артисты") -> items(vm.artists, key = { it.id }) { artist ->
                MusicRow(artist.name, tr("Альбомов: {n}", "n" to artist.albumCount), artist.coverArt, vm.client) { vm.openArtist(artist) }
            }
            tr("Плейлисты") -> {
                if (vm.playlists.isEmpty()) item { EmptyState(tr("Плейлистов пока нет"), tr("Плейлисты из Navidrome появятся здесь.")) }
                items(vm.playlists, key = { it.id }) { playlist ->
                    MusicRow(playlist.name, tr("Треков: {n}", "n" to playlist.songCount), playlist.coverArt, vm.client) { vm.openPlaylist(playlist) }
                }
            }
            else -> {
                if (vm.starred.isEmpty()) item { EmptyState(tr("Избранного пока нет"), tr("Отмечай треки сердцем — они соберутся здесь.")) }
                itemsIndexed(vm.starred) { index, song -> SongRow(song, vm) { vm.play(vm.starred, index) } }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.localSection(vm: MusicViewModel) {
    item { LocalControls(vm) }
    if (vm.local.isEmpty()) {
        item { EmptyState(tr("На телефоне пока нет музыки"), tr("Добавь файлы или папку кнопками выше. Поддерживаются MP3, M4A, AAC, FLAC, WAV, OGG.")) }
    } else {
        item { Text(tr("Треков: {n}", "n" to vm.local.size), color = Muted, style = MaterialTheme.typography.bodySmall) }
        itemsIndexed(vm.local) { index, song -> SongRow(song, vm) { vm.play(vm.local, index) } }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.downloadsSection(vm: MusicViewModel) {
    item {
        Text(
            tr("Треки с сервера, сохранённые для прослушивания без сети.") +
                if (vm.downloading.isNotEmpty()) tr(" Сейчас скачивается: {n}.", "n" to vm.downloading.size) else "",
            color = Muted, style = MaterialTheme.typography.bodySmall,
        )
    }
    if (vm.downloaded.isEmpty()) {
        item { EmptyState(tr("Загрузок пока нет"), tr("Открой альбом и нажми «Скачать», чтобы слушать без сети.")) }
    } else {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { vm.play(vm.downloaded, 0) }) { Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text(tr("Слушать")) }
                OutlinedButton(onClick = { vm.play(vm.downloaded, 0, shuffle = true) }) { Text(tr("Перемешать")) }
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
                Icon(Icons.Rounded.LibraryAdd, null); Spacer(Modifier.width(6.dp)); Text(tr("Файлы"))
            }
            OutlinedButton(onClick = { folder.launch(null) }, enabled = !vm.importing) { Text(tr("Папка")) }
            OutlinedButton(onClick = vm::rescan, enabled = !vm.importing) { Text(tr("Обновить")) }
        }
        if (vm.importing) Text(tr("Добавляю музыку…"), color = Muted, style = MaterialTheme.typography.bodySmall)
        Text(tr("Папка на телефоне: {folder}", "folder" to vm.musicFolder), color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun AlbumRow(album: Album, vm: MusicViewModel) =
    MusicRow(album.name, "${tr(album.artist)} · ${album.year ?: ""}", album.coverArt, vm.client) { vm.openAlbum(album) }

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
                        Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(8.dp)); Text(tr("Слушать"))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { vm.play(detail.songs, 0, shuffle = true) }) { Text(tr("Перемешать")) }
                        val missing = detail.songs.filterNot(vm::isDownloaded)
                        if (vm.client != null && !vm.offline) OutlinedButton(
                            onClick = { vm.download(detail.songs) },
                            enabled = missing.isNotEmpty() && vm.downloading.isEmpty(),
                        ) {
                            Icon(Icons.Rounded.Download, null); Spacer(Modifier.width(6.dp))
                            Text(if (missing.isEmpty()) tr("Скачано") else tr("Скачать"))
                        }
                    }
                }
            }
        }
        if (detail.loading) item { Loading() }
        items(detail.albums, key = { it.id }) { AlbumRow(it, vm) }
        itemsIndexed(detail.songs) { index, song -> SongRow(song, vm) { vm.play(detail.songs, index) } }
        if (!detail.loading && detail.albums.isEmpty() && detail.songs.isEmpty()) item { EmptyState(tr("Пока пусто"), tr("Здесь появится твоя музыка.")) }
    }
}

@Composable private fun SongRow(song: Song, vm: MusicViewModel, action: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val playable = vm.isPlayable(song)
    val accent = MaterialTheme.colorScheme.primary
    Row(
        Modifier.fillMaxWidth().clickable { if (playable) action() else vm.notice = tr("Трек не скачан — недоступен без сети") }
            .alpha(if (playable) 1f else 0.4f).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(song.coverArt, vm.client, Modifier.size(48.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(song.title, color = if (vm.playback.current?.id == song.id) accent else Ink, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
            Text(tr(song.artist), color = Muted, maxLines = 1, style = MaterialTheme.typography.bodySmall)
        }
        if (vm.isDownloaded(song)) Icon(Icons.Rounded.DownloadDone, tr("Скачано"), tint = Muted, modifier = Modifier.size(18.dp))
        Text(timeLabel(((song.duration ?: 0.0) * 1000).toLong()), color = Muted, style = MaterialTheme.typography.bodySmall)
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, tr("Действия с треком"), tint = Muted) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text(tr("Сыграть следующим")) }, onClick = { menu = false; vm.playNext(listOf(song)) })
                DropdownMenuItem(text = { Text(tr("В конец очереди")) }, onClick = { menu = false; vm.appendToQueue(listOf(song)) })
                if (!isLocalId(song.id) && vm.client != null && !vm.offline) {
                    DropdownMenuItem(text = { Text(tr("Микс по треку")) }, onClick = { menu = false; vm.playMix(song) })
                    DropdownMenuItem(text = { Text(tr("Поделиться")) }, onClick = { menu = false; vm.share(song) })
                    DropdownMenuItem(
                        text = { Text(if (vm.isStarred(song)) tr("Убрать из избранного") else tr("В избранное")) },
                        onClick = { menu = false; vm.toggleStar(song) },
                    )
                    if (!vm.isDownloaded(song)) DropdownMenuItem(text = { Text(tr("Скачать")) }, onClick = { menu = false; vm.download(listOf(song)) })
                }
                if (vm.isDownloaded(song)) DropdownMenuItem(text = { Text(tr("Удалить загрузку")) }, onClick = { menu = false; vm.removeDownload(song) })
                if (isLocalId(song.id)) DropdownMenuItem(text = { Text(tr("Удалить с телефона")) }, onClick = { menu = false; vm.removeLocal(song) })
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
                query, { query = it }, placeholder = { Text(tr("Поиск в медиатеке")) },
                leadingIcon = { Icon(Icons.Rounded.Search, null) }, modifier = Modifier.fillMaxWidth(),
                singleLine = true, shape = rounded(18),
            )
        }
        if (query.isBlank()) item { EmptyState(tr("Найди своё звучание"), tr("Альбомы, исполнители и любимые треки.")) }
        else if (vm.searchLoading) item { Loading() }
        else {
            if (vm.search.artists.isNotEmpty()) item { SectionTitle(tr("Исполнители")) }
            items(vm.search.artists) { artist -> MusicRow(artist.name, tr("Исполнитель"), artist.coverArt, vm.client) { vm.openArtist(artist) } }
            if (vm.search.albums.isNotEmpty()) item { SectionTitle(tr("Альбомы")) }
            items(vm.search.albums) { AlbumRow(it, vm) }
            if (vm.search.songs.isNotEmpty()) item { SectionTitle(tr("Треки")) }
            itemsIndexed(vm.search.songs) { index, song -> SongRow(song, vm) { vm.play(vm.search.songs, index) } }
            if (vm.search == SearchResult()) item { EmptyState(tr("Ничего не найдено"), tr("Попробуй другое название или исполнителя.")) }
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

    // Фон — по настройке: градиент акцента, размытая обложка или просто фон темы.
    Box(Modifier.fillMaxSize().background(Background)) {
    when (vm.settings.playerBackground) {
        PlayerBackground.gradient -> Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(accent.copy(alpha = .22f), Background))))
        // Размытие есть с Android 12; на старых обложка просто сильно притушена — читаемость та же.
        PlayerBackground.cover -> {
            Cover(song.coverArt, vm.client, Modifier.matchParentSize().blur(80.dp).alpha(.6f))
            Box(Modifier.matchParentSize().background(Background.copy(alpha = if (Build.VERSION.SDK_INT >= 31) .45f else .75f)))
        }
        PlayerBackground.solid -> Unit
    }
    Column(
        Modifier.fillMaxSize()
            .verticalScroll(rememberScrollState()).padding(24.dp).systemBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlayerButton(Icons.Rounded.KeyboardArrowDown, tr("Свернуть"), close)
            Text(tr("СЕЙЧАС ИГРАЕТ"), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, letterSpacing = 2.sp)
            if (!isLocalId(song.id) && vm.client != null) PlayerButton(
                if (vm.isStarred(song)) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                tr("В избранное"), { vm.toggleStar(song) }, if (vm.isStarred(song)) accent else Ink,
            )
            PlayerButton(Icons.AutoMirrored.Rounded.QueueMusic, tr("Очередь"), { showQueue = true })
        }
        Cover(song.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(song.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(tr(song.artist), color = Muted, style = MaterialTheme.typography.titleMedium)
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
            PlayerButton(Icons.Rounded.Shuffle, tr("Перемешивать"), vm::toggleShuffle, if (state.shuffle) accent else Ink)
            PlayerButton(Icons.Rounded.SkipPrevious, tr("Предыдущий трек"), vm::previous)
            FilledIconButton(
                onClick = vm::toggle, modifier = Modifier.size(80.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Ink.copy(alpha = .12f), contentColor = Ink),
            ) {
                if (state.buffering) CircularProgressIndicator(Modifier.size(30.dp))
                else Icon(if (state.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, tr("Воспроизведение / пауза"), Modifier.size(38.dp))
            }
            PlayerButton(Icons.Rounded.SkipNext, tr("Следующий трек"), vm::next)
            PlayerButton(
                if (state.repeat == PlaybackQueue.Repeat.one) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                tr("Режим повтора"), vm::cycleRepeat, if (state.repeat == PlaybackQueue.Repeat.off) Ink else accent,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            TextButton(onClick = { showLyrics = true; vm.loadLyrics(song) }) { Text(tr("Текст")) }
            Box {
                var speedMenu by remember { mutableStateOf(false) }
                val speed = vm.settings.speed
                val label = (if (speed == speed.toInt().toFloat()) "${speed.toInt()}" else "$speed".replace('.', ',')) + "×"
                TextButton(onClick = { speedMenu = true }, modifier = Modifier.testTag("speed")) {
                    Text(label, color = if (speed == 1f) Muted else MaterialTheme.colorScheme.primary)
                }
                DropdownMenu(expanded = speedMenu, onDismissRequest = { speedMenu = false }) {
                    listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f).forEach { value ->
                        val text = (if (value == value.toInt().toFloat()) "${value.toInt()}" else "$value".replace('.', ',')) + "×"
                        DropdownMenuItem(text = { Text(if (value == speed) "$text  ✓" else text) }, onClick = { speedMenu = false; vm.setSpeed(value) })
                    }
                }
            }
            Box {
                TextButton(onClick = { sleepMenu = true }) { Text(if (timerOn) tr("Таймер включён") else tr("Таймер сна")) }
                DropdownMenu(expanded = sleepMenu, onDismissRequest = { sleepMenu = false }) {
                    if (timerOn) DropdownMenuItem(text = { Text(tr("Выключить таймер")) }, onClick = { sleepMenu = false; vm.setSleepTimer(null) })
                    DropdownMenuItem(text = { Text(tr("В конце трека")) }, onClick = { sleepMenu = false; vm.setSleepTimer(0) })
                    listOf(15, 30, 45, 60, 90).forEach { minutes ->
                        DropdownMenuItem(text = { Text(tr("{n} мин", "n" to minutes)) }, onClick = { sleepMenu = false; vm.setSleepTimer(minutes) })
                    }
                }
            }
            TextButton(onClick = { showQueue = true }) { Text(tr("Очередь · {n}", "n" to state.queue.size)) }
        }
    }
    }

    if (showQueue) ModalBottomSheet(onDismissRequest = { showQueue = false }, containerColor = Background) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { SectionTitle(tr("Очередь")) }
            itemsIndexed(state.queue) { index, entry ->
                // Что уже сыграло — «Ранее» и приглушено; дальше — «Сейчас» и «Дальше».
                when (index) {
                    0 -> if (state.index > 0) Text(tr("Ранее"), color = Muted, style = MaterialTheme.typography.labelMedium)
                    state.index + 1 -> Text(tr("Дальше"), color = Muted, style = MaterialTheme.typography.labelMedium)
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.alpha(if (index < state.index) 0.55f else 1f)) {
                    Box(Modifier.weight(1f)) { SongRow(entry, vm) { vm.selectQueue(index) } }
                    IconButton(onClick = { vm.removeFromQueue(index) }) { Icon(Icons.Rounded.Close, tr("Убрать из очереди"), tint = Muted) }
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
            Text(tr("Настройки"), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            TextButton(onClick = close) { Text(tr("Готово")) }
        }

        SectionTitle(tr("Качество потока"))
        QualityPicker("Wi-Fi", settings.wifiQuality) { settings.chooseWifiQuality(it) }
        QualityPicker(tr("Мобильная сеть"), settings.cellularQuality) { settings.chooseCellularQuality(it) }
        Text(tr("Новое качество применяется со следующего трека."), color = Muted, style = MaterialTheme.typography.bodySmall)

        SectionTitle(tr("Громкость"))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            ReplayGainMode.entries.forEach { mode ->
                FilterChip(
                    selected = settings.replayGain == mode,
                    onClick = { settings.chooseReplayGain(mode) },
                    label = { Text(when (mode) { ReplayGainMode.off -> tr("Выключено"); ReplayGainMode.track -> tr("По треку"); ReplayGainMode.album -> tr("По альбому"); ReplayGainMode.auto -> tr("Авто") }) },
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            listOf(0f, 2f, 4f, 6f, 8f).forEach { seconds ->
                FilterChip(
                    selected = settings.fadeSeconds == seconds,
                    onClick = { settings.chooseFadeSeconds(seconds) },
                    label = { Text(if (seconds == 0f) tr("Без затухания") else tr("{n} с", "n" to seconds.toInt())) },
                )
            }
        }
        Text(tr("Затухание между треками."), color = Muted, style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(tr("Бесконечное воспроизведение"))
                Text(tr("Очередь закончилась — дальше играет похожая музыка, как радио по последнему треку."), color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = settings.endless, onCheckedChange = { settings.useEndless(it) })
        }

        SectionTitle(tr("Эквалайзер"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Включить"), Modifier.weight(1f))
            Switch(checked = settings.equalizerEnabled, onCheckedChange = { settings.enableEqualizer(it) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Settings.EQ_PRESETS.forEach { (title, gains) ->
                AssistChip(onClick = { settings.enableEqualizer(true); settings.saveEqualizerGains(gains) }, label = { Text(tr(title)) })
            }
        }
        Settings.EQ_BANDS.forEachIndexed { index, band ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (band >= 1000) tr("{n}к", "n" to band / 1000) else "$band", Modifier.width(44.dp), color = Muted, style = MaterialTheme.typography.bodySmall)
                Slider(
                    value = settings.equalizerGains.getOrElse(index) { 0f },
                    onValueChange = { value ->
                        settings.saveEqualizerGains(settings.equalizerGains.toMutableList().also { it[index] = value })
                    },
                    valueRange = -12f..12f, steps = 47, enabled = settings.equalizerEnabled, modifier = Modifier.weight(1f),
                )
            }
        }

        SectionTitle(tr("Текст песни"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(tr("Искать тексты в LRCLIB"))
                Text(tr("Если у Navidrome текста нет, он берётся из открытой базы lrclib.net. Туда уходят название, исполнитель и длительность трека."), color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = settings.lrclib, onCheckedChange = { settings.useLrclib(it) })
        }

        SectionTitle(tr("Загрузки"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Только по Wi-Fi"), Modifier.weight(1f))
            Switch(checked = settings.downloadOverWifiOnly, onCheckedChange = { settings.limitDownloadsToWifi(it) })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Скачивать избранное"), Modifier.weight(1f))
            Switch(checked = settings.downloadFavorites, onCheckedChange = { settings.autoDownloadFavorites(it) })
        }

        SectionTitle(tr("Оформление"))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            ThemeMode.entries.forEach { theme ->
                FilterChip(selected = settings.theme == theme, onClick = { settings.chooseTheme(theme) }, label = { Text(tr(theme.title)) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            AccentTheme.entries.forEach { theme ->
                FilterChip(selected = settings.accent == theme, onClick = { settings.chooseAccent(theme) }, label = { Text(tr(theme.title)) })
            }
        }
        ChipRow(tr("Углы"), Corners.entries, settings.corners, { tr(it.title) }, settings::chooseCorners)
        ChipRow(tr("Фон плеера"), PlayerBackground.entries, settings.playerBackground, { tr(it.title) }, settings::choosePlayerBackground)
        ChipRow(tr("Размер текста песни"), listOf(0.85f, 1f, 1.2f, 1.45f), settings.lyricsScale, {
            when (it) { 0.85f -> tr("Мелкий"); 1f -> tr("Обычный"); 1.2f -> tr("Крупный"); else -> tr("Огромный") }
        }, settings::chooseLyricsScale)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Текст песни по центру"), Modifier.weight(1f))
            Switch(checked = settings.lyricsCenter, onCheckedChange = settings::useLyricsCenter)
        }

        SectionTitle(tr("Приложение"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Nocturne ${BuildConfig.VERSION_NAME}")
                Text(tr("Обновления ставятся поверх установленной версии — настройки, загрузки и вход на сервер остаются."), color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = { vm.checkForAppUpdate(manual = true) }) { Text(tr("Проверить")) }
        }

        SectionTitle(tr("Сервер"))
        when {
            vm.client != null -> {
                Text(vm.client?.credentials?.account.orEmpty(), color = Muted, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { vm.disconnect(); close() }) { Text(tr("Отключить сервер"), color = MaterialTheme.colorScheme.error) }
            }
            else -> TextButton(onClick = { vm.showConnect(); close() }) { Text(tr("Подключить Navidrome")) }
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
                                StreamQuality.original -> tr("Оригинал")
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

@Composable private fun PlayerButton(icon: ImageVector, label: String, click: () -> Unit, tint: Color = Ink) {
    IconButton(onClick = click) { Icon(icon, label, tint = tint, modifier = Modifier.size(27.dp)) }
}

@Composable private fun Cover(id: String?, client: NavidromeClient?, modifier: Modifier = Modifier) {
    val shape = rounded(12)
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
        val source = remember(id, client, saved) { coverSource(id, client, saved) }
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
        SectionTitle(tr("Текст песни"))
        when {
            lyrics == null -> Loading()
            lines.isEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tr("Navidrome не нашёл текст для этого трека."), color = Muted)
                // LRCLIB выключен — предлагаем включить прямо здесь, а не прятать это в настройках.
                if (!vm.settings.lrclib) {
                    Text(tr("Можно поискать в открытой базе lrclib.net — туда уйдут название и исполнитель."), color = Muted, style = MaterialTheme.typography.bodySmall)
                    FilledTonalButton(onClick = vm::searchLrclib) { Text(tr("Искать в LRCLIB")) }
                }
            }
            else -> LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(if (synced) 14.dp else 6.dp)) {
                itemsIndexed(lines) { index, line ->
                    val start = line.start
                    Text(
                        line.value.ifEmpty { " " },
                        style = (if (synced) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge).let { base ->
                            base.copy(fontSize = base.fontSize * vm.settings.lyricsScale, lineHeight = base.lineHeight * vm.settings.lyricsScale)
                        },
                        textAlign = if (vm.settings.lyricsCenter) androidx.compose.ui.text.style.TextAlign.Center else null,
                        fontWeight = if (synced && index == active) FontWeight.Bold else FontWeight.Normal,
                        color = if (!synced || index == active) Ink else Muted,
                        modifier = Modifier.fillMaxWidth().then(
                            if (synced && start != null) Modifier.clickable { vm.seek(start.toLong()) } else Modifier
                        ),
                    )
                }
            }
        }
    }
}

/** Обложка своего файла лежит на диске, скачанная — рядом с треком, серверная — по подписанному адресу. */
private fun coverSource(id: String?, client: NavidromeClient?, saved: Map<String, String>): Any? = when {
    id == null -> null
    id.startsWith(LocalLibrary.FILE_COVER_PREFIX) -> File(id.removePrefix(LocalLibrary.FILE_COVER_PREFIX))
    saved[id] != null -> File(saved.getValue(id))
    else -> client?.cover(id)
}

/**
 * Цвет обложки играющего трека — для акцента «Из обложки». Считается по копии 24×24, как на iPhone.
 * Пока грузится новая обложка, остаётся прежний цвет: акцент не мигает фиолетовым между треками.
 */
@Composable internal fun rememberCoverHue(id: String?, client: NavidromeClient?, saved: Map<String, String>, enabled: Boolean): Pair<Float, Float>? {
    val context = LocalContext.current
    var hue by remember { mutableStateOf<Pair<Float, Float>?>(null) }
    LaunchedEffect(id, enabled) {
        if (!enabled || id == null || id.startsWith("demo-")) { hue = null; return@LaunchedEffect }
        val source = coverSource(id, client, saved) ?: return@LaunchedEffect
        val request = ImageRequest.Builder(context).data(source).size(24).allowHardware(false).build()
        val bitmap = (context.imageLoader.execute(request).drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap ?: return@LaunchedEffect
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        hue = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { app.nocturne.core.CoverColor.vibrant(pixels) }
    }
    return hue
}

/** Подпись и ряд вариантов-чипов с прокруткой: длинные русские названия не сминаются в столбик. */
@Composable private fun <T> ChipRow(title: String, options: List<T>, selected: T, label: (T) -> String, choose: (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            options.forEach { option ->
                FilterChip(selected = option == selected, onClick = { choose(option) }, label = { Text(label(option)) })
            }
        }
    }
}
