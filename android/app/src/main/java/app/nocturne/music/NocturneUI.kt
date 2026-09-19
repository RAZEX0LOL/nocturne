@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package app.nocturne.music

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.grid.*
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
import androidx.media3.common.Player
import app.nocturne.core.*
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import kotlin.math.sin

private val Background = Color(0xFF0E0E13)
private val Surface = Color(0xFF1B1B23)
private val Accent = Color(0xFFC4A8FF)
private val Muted = Color(0xFF9C9CAA)

@Composable internal fun NocturneTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Accent, onPrimary = Background, background = Background, surface = Surface, onSurface = Color.White, onSurfaceVariant = Muted), content = content)
}

@Composable internal fun NocturneApp(vm: MusicViewModel) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var settings by rememberSaveable { mutableStateOf(false) }
    var fullPlayer by rememberSaveable { mutableStateOf(false) }
    if (vm.client == null && !vm.demo) {
        Surface(color = Background, modifier = Modifier.fillMaxSize()) { ConnectionScreen(vm) {} }
    } else {
        BackHandler(vm.detail != null) { vm.closeDetail() }
        Scaffold(containerColor = Background, topBar = {
            LargeTopAppBar(title = { Text(vm.detail?.title ?: listOf("Главная", "Медиатека", "Поиск")[tab], fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { if (vm.detail != null) IconButton(onClick = vm::closeDetail) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
                actions = { IconButton(onClick = { settings = true }) { Icon(Icons.Rounded.Settings, "Настройки сервера") } },
                colors = TopAppBarDefaults.largeTopAppBarColors(containerColor = Background))
        }, bottomBar = {
            Column {
                vm.playback.current?.let { song ->
                    Row(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(18.dp)).background(Surface).clickable { fullPlayer = true }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
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
                    listOf("Главная", "Медиатека", "Поиск").forEachIndexed { index, title ->
                        NavigationBarItem(selected = tab == index, onClick = { tab = index; vm.closeDetail() }, icon = { Icon(icons[index], title) }, label = { Text(title) }, modifier = Modifier.testTag("tab_$index"))
                    }
                }
            }
        }) { padding ->
            Box(Modifier.padding(padding)) {
                val detail = vm.detail
                if (detail != null) DetailScreen(vm, detail)
                else when (tab) {
                    0 -> HomeScreen(vm) { settings = true }
                    1 -> LibraryScreen(vm)
                    else -> SearchScreen(vm)
                }
            }
        }
    }
    if (settings) ModalBottomSheet(onDismissRequest = { if (!vm.connecting) settings = false }, containerColor = Background) {
        ConnectionScreen(vm) { settings = false }
    }
    if (fullPlayer && vm.playback.current != null) Dialog(onDismissRequest = { fullPlayer = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = Background) { PlayerScreen(vm) { fullPlayer = false } }
    }
    vm.error?.let { message ->
        AlertDialog(onDismissRequest = { vm.error = null }, title = { Text("Nocturne") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { vm.error = null }) { Text("Понятно") } })
    }
}

@Composable private fun ConnectionScreen(vm: MusicViewModel, done: () -> Unit) {
    var server by remember { mutableStateOf(vm.client?.credentials?.server?.toString().orEmpty()) }
    var username by remember { mutableStateOf(vm.client?.credentials?.username.orEmpty()) }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp).statusBarsPadding(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Icon(Icons.Rounded.GraphicEq, null, tint = Accent, modifier = Modifier.padding(top = 16.dp).size(64.dp))
        Text("Твоя музыка.\nТвоё пространство.", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Подключи Navidrome и забери любимую музыку с собой.", color = Muted)
        OutlinedTextField(server, { server = it }, label = { Text("Адрес сервера") }, placeholder = { Text("https://music.example.com") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(username, { username = it }, label = { Text("Логин") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(password, { password = it }, label = { Text("Пароль Navidrome") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(onClick = { vm.connect(server, username, password) { password = ""; done() } }, enabled = !vm.connecting && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) {
            if (vm.connecting) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Подключиться", fontWeight = FontWeight.SemiBold)
        }
        Text("Данные входа зашифрованы ключом из Android Keystore и исключены из резервной копии.", color = Muted, style = MaterialTheme.typography.bodySmall)
        if (vm.client == null) TextButton(onClick = { vm.useDemo(); done() }, enabled = !vm.connecting, modifier = Modifier.fillMaxWidth()) { Text("Посмотреть демоверсию") }
        else TextButton(onClick = { vm.disconnect(); done() }, enabled = !vm.connecting) { Text("Отключить сервер", color = MaterialTheme.colorScheme.error) }
        Text("NOCTURNE", letterSpacing = 5.sp, color = Muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.CenterHorizontally).padding(16.dp))
    }
}

@Composable private fun HomeScreen(vm: MusicViewModel, settings: () -> Unit) {
    LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(24.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        if (vm.demo) item(span = { GridItemSpan(2) }) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Surface).clickable(onClick = settings).padding(18.dp)) {
                Text("Твоя музыка будет здесь", fontWeight = FontWeight.SemiBold)
                Text("Демоверсия · Подключить Navidrome", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        item(span = { GridItemSpan(2) }) { Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Недавно добавлено", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            IconButton(onClick = { vm.refresh() }, enabled = !vm.loading && !vm.demo) { Icon(Icons.Rounded.Refresh, "Обновить") }
        } }
        items(vm.albums, key = { it.id }) { AlbumCard(it, vm) }
        if (vm.loading) item(span = { GridItemSpan(2) }) { Loading() }
        if (!vm.loading && vm.albums.isEmpty()) item(span = { GridItemSpan(2) }) { EmptyState("Здесь пока тихо", "Добавь музыку в Navidrome и обнови медиатеку.") }
        if (vm.hasMore) item(span = { GridItemSpan(2) }) { TextButton(onClick = { vm.refresh(more = true) }, enabled = !vm.loading) { Text("Загрузить ещё") } }
        if (vm.favorites.isNotEmpty()) {
            item(span = { GridItemSpan(2) }) { Text("Избранное", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            items(vm.favorites, key = { "favorite-${it.id}" }) { AlbumCard(it, vm) }
        }
    }
}

@Composable private fun AlbumCard(album: Album, vm: MusicViewModel) {
    Column(Modifier.clickable { vm.openAlbum(album) }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Cover(album.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Text(album.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
        Text(album.artist, maxLines = 1, overflow = TextOverflow.Ellipsis, color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun LibraryScreen(vm: MusicViewModel) {
    var category by rememberSaveable { mutableIntStateOf(0) }
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Альбомы", "Артисты", "Плейлисты").forEachIndexed { index, title -> FilterChip(category == index, { category = index }, label = { Text(title) }) }
        } }
        when (category) {
            0 -> { items(vm.albums, key = { it.id }) { AlbumRow(it, vm) }; if (vm.hasMore) item { TextButton(onClick = { vm.refresh(true) }, enabled = !vm.loading) { Text("Загрузить ещё") } } }
            1 -> items(vm.artists, key = { it.id }) { artist -> MusicRow(artist.name, "Альбомов: ${artist.albumCount}", artist.coverArt, vm.client) { vm.openArtist(artist) } }
            else -> {
                if (vm.playlists.isEmpty()) item { EmptyState("Плейлистов пока нет", "Плейлисты из Navidrome появятся здесь.") }
                items(vm.playlists, key = { it.id }) { playlist -> MusicRow(playlist.name, "Треков: ${playlist.songCount}", playlist.coverArt, vm.client) { vm.openPlaylist(playlist) } }
            }
        }
    }
}
@Composable private fun AlbumRow(album: Album, vm: MusicViewModel) = MusicRow(album.name, "${album.artist} · ${album.year ?: ""}", album.coverArt, vm.client) { vm.openAlbum(album) }
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
        item { Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Cover(detail.cover, vm.client, Modifier.size(250.dp))
            Text(detail.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (detail.songs.isNotEmpty()) Button(onClick = { vm.play(detail.songs) }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(8.dp)); Text("Слушать") }
        } }
        if (detail.loading) item { Loading() }
        items(detail.albums, key = { it.id }) { AlbumRow(it, vm) }
        itemsIndexed(detail.songs) { index, song -> SongRow(song, vm) { vm.play(detail.songs, index) } }
        if (!detail.loading && detail.albums.isEmpty() && detail.songs.isEmpty()) item { EmptyState("Пока пусто", "Здесь появится твоя музыка.") }
    }
}
@Composable private fun SongRow(song: Song, vm: MusicViewModel, action: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = action).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Cover(song.coverArt, vm.client, Modifier.size(48.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(song.title, color = if (vm.playback.current?.id == song.id) Accent else Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
            Text(song.artist, color = Muted, maxLines = 1, style = MaterialTheme.typography.bodySmall)
        }
        Text(timeLabel(song.duration * 1000), color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}
@Composable private fun SearchScreen(vm: MusicViewModel) {
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query) { vm.search(query.trim()) }
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { OutlinedTextField(query, { query = it }, placeholder = { Text("Поиск в медиатеке") }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(18.dp)) }
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

@Composable private fun PlayerScreen(vm: MusicViewModel, close: () -> Unit) {
    val state = vm.playback
    val song = state.current ?: return
    var showQueue by remember { mutableStateOf(false) }
    var scrub by remember(song.id) { mutableFloatStateOf(-1f) }
    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF30273F), Background))).verticalScroll(rememberScrollState()).padding(24.dp).systemBarsPadding(), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlayerButton(Icons.Rounded.KeyboardArrowDown, "Свернуть", close)
            Text("СЕЙЧАС ИГРАЕТ", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, letterSpacing = 2.sp)
            PlayerButton(Icons.AutoMirrored.Rounded.QueueMusic, "Очередь", click = { showQueue = true })
        }
        Cover(song.coverArt, vm.client, Modifier.fillMaxWidth().aspectRatio(1f))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(song.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(song.artist, color = Muted, style = MaterialTheme.typography.titleMedium)
        }
        Column {
            Slider(value = if (scrub >= 0) scrub else state.position.toFloat().coerceIn(0f, state.duration.coerceAtLeast(1).toFloat()),
                onValueChange = { scrub = it }, onValueChangeFinished = { vm.seek(scrub.toLong()); scrub = -1f }, valueRange = 0f..state.duration.coerceAtLeast(1).toFloat())
            Row { Text(timeLabel(state.position), color = Muted, style = MaterialTheme.typography.bodySmall); Spacer(Modifier.weight(1f)); Text("−${timeLabel((state.duration - state.position).coerceAtLeast(0))}", color = Muted, style = MaterialTheme.typography.bodySmall) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            PlayerButton(Icons.Rounded.Shuffle, "Перемешивать", vm::shuffle, if (state.shuffle) Accent else Color.White)
            PlayerButton(Icons.Rounded.SkipPrevious, "Предыдущий трек", vm::previous)
            FilledIconButton(onClick = vm::toggle, modifier = Modifier.size(80.dp), colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White.copy(alpha = .12f), contentColor = Color.White)) {
                if (state.buffering) CircularProgressIndicator(Modifier.size(30.dp)) else Icon(if (state.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Воспроизведение / пауза", Modifier.size(38.dp))
            }
            PlayerButton(Icons.Rounded.SkipNext, "Следующий трек", vm::next)
            PlayerButton(if (state.repeat == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Режим повтора", vm::repeat, if (state.repeat == Player.REPEAT_MODE_OFF) Color.White else Accent)
        }
        TextButton(onClick = { showQueue = true }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, null); Spacer(Modifier.width(8.dp)); Text("Далее · ${state.queue.size} треков") }
    }
    if (showQueue) ModalBottomSheet(onDismissRequest = { showQueue = false }, containerColor = Background) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { SectionTitle("Очередь") }
            itemsIndexed(state.queue) { index, entry -> SongRow(entry, vm) { vm.selectQueue(index) } }
        }
    }
}
@Composable private fun PlayerButton(icon: ImageVector, label: String, click: () -> Unit, tint: Color = Color.White) {
    IconButton(onClick = click) { Icon(icon, label, tint = tint, modifier = Modifier.size(27.dp)) }
}
@Composable private fun Cover(id: String?, client: NavidromeClient?, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
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
        val request = remember(id, client) {
            ImageRequest.Builder(context).data(client?.cover(id)).diskCachePolicy(CachePolicy.DISABLED).crossfade(true).build()
        }
        Box(modifier.clip(shape).background(Surface), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.MusicNote, null, tint = Accent, modifier = Modifier.fillMaxSize(.35f))
            AsyncImage(request, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
    }
}
@Composable private fun Loading() { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
@Composable private fun EmptyState(title: String, subtitle: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Rounded.MusicNote, null, Modifier.size(44.dp), tint = Accent)
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(subtitle, color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}
@Composable private fun SectionTitle(title: String) { Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge) }
private fun timeLabel(milliseconds: Long): String { val seconds = milliseconds.coerceAtLeast(0) / 1000; return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}" }
