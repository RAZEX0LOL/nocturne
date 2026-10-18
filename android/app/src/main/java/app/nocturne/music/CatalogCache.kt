package app.nocturne.music

import android.content.Context
import android.util.AtomicFile
import app.nocturne.core.ResponseCache
import java.io.File
import java.security.MessageDigest
import kotlinx.serialization.json.*

internal fun accountHash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    .joinToString("") { "%02x".format(it.toInt() and 255) }

/** Ключи содержат только имя операции и параметры, без соли, токена и пароля. */
class CatalogCache(context: Context, account: String) : ResponseCache {
    private val folder = File(context.filesDir, "catalog/${accountHash(account)}").apply { mkdirs() }

    @Synchronized override fun read(key: String): JsonObject? = runCatching {
        Json.parseToJsonElement(AtomicFile(File(folder, accountHash(key))).readFully().toString(Charsets.UTF_8)).jsonObject
    }.getOrNull()

    @Synchronized override fun write(key: String, response: JsonObject) {
        val file = AtomicFile(File(folder, accountHash(key)))
        var output: java.io.FileOutputStream? = null
        try {
            output = file.startWrite()
            output.write(response.toString().toByteArray())
            file.finishWrite(output)
            folder.listFiles().orEmpty().filter { !it.name.endsWith(".bak") }.sortedByDescending { it.lastModified() }
                .drop(200).forEach { it.delete() }
        } catch (_: Exception) { output?.let(file::failWrite) }
    }
}
