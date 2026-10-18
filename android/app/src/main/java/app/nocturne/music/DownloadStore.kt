package app.nocturne.music

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.AtomicFile
import app.nocturne.core.*
import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.Request

/** Задания сохраняются до запуска сервиса; URL с подписью создаётся только перед запросом. */
class DownloadStore private constructor(private val context: Context) {
    data class Job(val song: Song, val quality: StreamQuality, val automatic: Boolean = false)
    private val root = File(context.filesDir, "downloads").apply { mkdirs() }
    private val http = OkHttpClient.Builder().callTimeout(java.time.Duration.ofMinutes(10)).build()
    private val worker = Mutex()
    @Volatile private var account: String? = null
    @Volatile private var initialized = false
    @Volatile private var paths: Map<String, String> = emptyMap()
    @Volatile private var automaticIds: Set<String> = emptySet()
    @Volatile private var covers: Map<String, String> = emptyMap()
    @Volatile private var legacyPaths: Map<String, String> = emptyMap()
    val changes = MutableStateFlow(0L)

    @Synchronized fun use(owner: String?) {
        initialized = true
        if (account == owner) return
        account = owner; paths = emptyMap(); covers = emptyMap(); automaticIds = emptySet()
        changed()
    }
    @Synchronized fun restoreOwner(owner: String) { if (!initialized) use(owner) }
    fun activeAccount() = account
    private fun changed() { changes.update { it + 1 } }
    private fun folder(owner: String) = File(root, accountHash(owner)).apply { mkdirs() }
    fun pathOf(id: String) = paths[id]
    fun legacyPath(id: String) = legacyPaths[id]
    fun coverFiles() = covers
    fun isAutomatic(id: String) = id in automaticIds
    fun isDownloaded(id: String) = paths.containsKey(id)

    suspend fun legacySongs(): List<Song> = withContext(Dispatchers.IO) {
        val found = mutableMapOf<String, String>()
        val songs = root.listFiles().orEmpty().filter { it.isFile && it.extension == "json" }.mapNotNull { meta ->
            val song = runCatching { NavidromeClient.song(Json.parseToJsonElement(meta.readText()).jsonObject) }.getOrNull() ?: return@mapNotNull null
            val audio = root.listFiles().orEmpty().firstOrNull { it.isFile && it.nameWithoutExtension == meta.nameWithoutExtension && it.extension !in setOf("json", "part", "cover", "bak") } ?: return@mapNotNull null
            val id = "local:legacy:${accountHash(audio.absolutePath)}"
            found[id] = audio.absolutePath
            val cover = File(root, "${meta.nameWithoutExtension}.cover")
            song.copy(id = id, coverArt = if (cover.exists()) android.net.Uri.fromFile(cover).toString() else null)
        }
        legacyPaths = found
        songs
    }

    suspend fun removeLegacy(id: String) = withContext(Dispatchers.IO) {
        legacyPaths[id]?.let { path -> removeFiles(root, File(path).nameWithoutExtension) }
        legacyPaths = legacyPaths - id
    }

    suspend fun load(): List<Song> = withContext(Dispatchers.IO) {
        val owner = account ?: return@withContext emptyList()
        val folder = folder(owner)
        val found = mutableMapOf<String, String>()
        val art = mutableMapOf<String, String>()
        val automatic = mutableSetOf<String>()
        val songs = folder.listFiles().orEmpty().filter { it.extension == "json" && it.name != "queue.json" }.mapNotNull { meta ->
            val raw = runCatching { Json.parseToJsonElement(meta.readText()).jsonObject }.getOrNull() ?: return@mapNotNull null
            val song = runCatching { NavidromeClient.song(raw) }.getOrNull() ?: return@mapNotNull null
            val audio = folder.listFiles().orEmpty().firstOrNull { it.nameWithoutExtension == meta.nameWithoutExtension && it.extension !in setOf("json", "cover", "part", "bak") } ?: return@mapNotNull null
            found[song.id] = audio.absolutePath
            if (raw["_automatic"]?.jsonPrimitive?.booleanOrNull == true) automatic += song.id
            val cover = File(folder, "${meta.nameWithoutExtension}.cover")
            if (cover.exists()) song.coverArt?.let { art[it] = cover.absolutePath }
            song
        }
        if (account == owner) { paths = found; covers = art; automaticIds = automatic }
        songs.sortedWith(compareBy({ it.album }, { it.track ?: 0 }, { it.title }))
    }

    @Synchronized fun jobs(owner: String? = account): List<Job> {
        if (owner == null) return emptyList()
        return runCatching {
            Json.parseToJsonElement(AtomicFile(File(folder(owner), "queue.json")).readFully().toString(Charsets.UTF_8)).jsonArray.map { raw ->
                val item = raw.jsonObject
                Job(NavidromeClient.song(item.getValue("song").jsonObject), StreamQuality.valueOf(item.getValue("quality").jsonPrimitive.content), item["automatic"]?.jsonPrimitive?.booleanOrNull ?: false)
            }
        }.getOrDefault(emptyList())
    }

    @Synchronized private fun saveJobs(owner: String, jobs: List<Job>) {
        atomic(File(folder(owner), "queue.json"), buildJsonArray { jobs.forEach { job -> add(buildJsonObject {
            put("song", NavidromeClient.describe(job.song)); put("quality", job.quality.name); put("automatic", job.automatic)
        }) } }.toString())
        changed()
    }

    @Synchronized fun enqueue(owner: String, songs: List<Song>, quality: StreamQuality, automatic: Boolean = false) {
        val pending = jobs(owner).toMutableList()
        for (song in songs.filterNot { isLocalId(it.id) }) {
            val existing = pending.indexOfFirst { it.song.id == song.id }
            if (existing >= 0) { if (!automatic) pending[existing] = pending[existing].copy(automatic = false); continue }
            val meta = File(folder(owner), "${accountHash(song.id)}.json")
            if (meta.exists()) {
                if (!automatic) runCatching {
                    val raw = Json.parseToJsonElement(meta.readText()).jsonObject
                    atomic(meta, JsonObject(raw + ("_automatic" to JsonPrimitive(false))).toString())
                }
                continue
            }
            pending += Job(song, quality, automatic)
        }
        saveJobs(owner, pending)
    }

    /** Отмена удаляет и задание: оно не вернётся после перезапуска. */
    suspend fun remove(song: Song) = withContext(Dispatchers.IO) {
        val owner = account ?: return@withContext
        synchronized(this@DownloadStore) { saveJobs(owner, jobs(owner).filterNot { it.song.id == song.id }) }
        removeFiles(folder(owner), accountHash(song.id))
        if (account == owner) { paths = paths - song.id; changed() }
    }

    fun allowedNetwork(settings: Settings, automatic: Boolean): Boolean {
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
        if (automatic && (!settings.prepareQueue || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) || context.getSystemService(ConnectivityManager::class.java).restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED)) return false
        return !settings.downloadOverWifiOnly || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }

    suspend fun run(api: NavidromeClient, settings: Settings) = worker.withLock {
        val owner = api.credentials.account
        while (account == owner) {
            val pending = jobs(owner)
            val job = pending.firstOrNull { !it.automatic } ?: pending.firstOrNull() ?: break
            if (!allowedNetwork(settings, job.automatic)) break
            val folder = folder(owner)
            val total = folder.listFiles().orEmpty().sumOf { it.length() }
            val cacheBytes = folder.listFiles().orEmpty().filter { it.extension == "json" && it.name != "queue.json" }.sumOf { meta ->
                val automatic = runCatching { Json.parseToJsonElement(meta.readText()).jsonObject["_automatic"]?.jsonPrimitive?.booleanOrNull }.getOrNull() == true
                if (automatic) folder.listFiles().orEmpty().filter { it.nameWithoutExtension == meta.nameWithoutExtension }.sumOf { it.length() } else 0L
            }
            val available = if (job.automatic) minOf(256L * 1024 * 1024 - cacheBytes, if (settings.downloadLimitMB > 0) settings.downloadLimitMB.toLong() * 1024 * 1024 - total else Long.MAX_VALUE) else if (settings.downloadLimitMB > 0) settings.downloadLimitMB.toLong() * 1024 * 1024 - total else Long.MAX_VALUE
            if (available <= 0) break
            val stem = accountHash(job.song.id)
            val partial = File(folder, "$stem.part")
            try {
                http.newCall(Request.Builder().url(api.stream(job.song.id, job.quality)).build()).execute().use { response ->
                    check(response.isSuccessful)
                    val body = checkNotNull(response.body)
                    check(body.contentLength() < 0 || body.contentLength() <= available)
                    var copied = 0L
                    partial.outputStream().use { output -> body.byteStream().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            check(account == owner && allowedNetwork(settings, job.automatic) && jobs(owner).any { it.song.id == job.song.id })
                            val count = input.read(buffer)
                            if (count < 0) break
                            copied += count
                            check(copied <= available)
                            output.write(buffer, 0, count)
                        }
                    } }
                    check(body.contentLength() < 0 || copied == body.contentLength())
                    check(partial.renameTo(File(folder, "$stem.${extensionFor(response.header("Content-Type"))}")))
                    atomic(File(folder, "$stem.json"), JsonObject(NavidromeClient.describe(job.song) + ("_automatic" to JsonPrimitive(job.automatic))).toString())
                }
                job.song.coverArt?.let { cover -> runCatching {
                    http.newCall(Request.Builder().url(checkNotNull(api.cover(cover))).build()).execute().use { response ->
                        if (response.isSuccessful) response.body?.let { body -> File(folder, "$stem.cover").outputStream().use { body.byteStream().use { input -> input.copyTo(it) } } }
                    }
                } }
                synchronized(this@DownloadStore) { saveJobs(owner, jobs(owner).filterNot { it.song.id == job.song.id }) }
                load(); changed()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { break }
            finally { partial.delete() }
        }
    }

    suspend fun prepare(api: NavidromeClient, songs: List<Song>, currentId: String?, settings: Settings) = withContext(Dispatchers.IO) {
        if (!allowedNetwork(settings, true)) return@withContext
        val owner = api.credentials.account
        val wanted = OfflinePreparation.songs(songs, true, true, true)
        val keep = (wanted.map { it.id } + currentId).toSet()
        val folder = folder(owner)
        for (meta in folder.listFiles().orEmpty().filter { it.extension == "json" && it.name != "queue.json" }) {
            val raw = runCatching { Json.parseToJsonElement(meta.readText()).jsonObject }.getOrNull() ?: continue
            if (raw["_automatic"]?.jsonPrimitive?.booleanOrNull == true && raw["id"]?.jsonPrimitive?.content !in keep) removeFiles(folder, meta.nameWithoutExtension)
        }
        synchronized(this@DownloadStore) {
            saveJobs(owner, jobs(owner).filter { !it.automatic || it.song.id in keep })
            enqueue(owner, wanted, settings.quality(true), true)
        }
    }

    suspend fun totalBytes(): Long = withContext(Dispatchers.IO) { account?.let { folder(it).listFiles().orEmpty().sumOf(File::length) } ?: 0 }

    companion object {
        @Volatile private var instance: DownloadStore? = null
        fun get(context: Context): DownloadStore = instance ?: synchronized(this) { instance ?: DownloadStore(context.applicationContext).also { instance = it } }
        private fun atomic(target: File, text: String) {
            val file = AtomicFile(target)
            val output = file.startWrite()
            try { output.write(text.toByteArray()); file.finishWrite(output) } catch (error: Exception) { file.failWrite(output); throw error }
        }
        private fun removeFiles(folder: File, stem: String) { folder.listFiles().orEmpty().filter { it.nameWithoutExtension == stem }.forEach { it.delete() } }
        private fun extensionFor(type: String?) = when (type?.substringBefore(';')?.trim()) {
            "audio/mpeg", "audio/mp3" -> "mp3"
            "audio/flac", "audio/x-flac" -> "flac"
            "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac" -> "m4a"
            "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave" -> "wav"
            "audio/ogg", "application/ogg" -> "ogg"
            "audio/opus" -> "opus"
            else -> "audio"
        }
    }
}
