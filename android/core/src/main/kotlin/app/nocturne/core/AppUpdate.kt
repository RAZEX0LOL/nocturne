package app.nocturne.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Новая версия приложения из android.json рядом с обновлениями десктопа:
 * {"versionCode": 812, "versionName": "1.1.812", "url": "https://…/Nocturne-1.1.812.apk", "sha256": "…"}.
 */
data class AppUpdate(val versionCode: Int, val versionName: String, val url: String, val sha256: String, val notes: String = "") {
    companion object {
        const val MANIFEST = "https://github.com/RAZEX0LOL/nocturne-releases/releases/download/updates/android.json"

        /** Только https и полный sha256: без проверки суммы ставить скачанный файл нельзя. */
        fun parse(text: String): AppUpdate? {
            val json = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
            fun string(key: String) = (json[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val code = (json["versionCode"] as? JsonPrimitive)?.intOrNull ?: return null
            val url = string("url")
            val sha = string("sha256").lowercase()
            if (!url.startsWith("https://") || !sha.matches(Regex("[0-9a-f]{64}"))) return null
            return AppUpdate(code, string("versionName").ifEmpty { "$code" }, url, sha, string("notes"))
        }

        /** Обновление есть, только если сборка новее установленной. */
        fun newer(text: String, installed: Int): AppUpdate? = parse(text)?.takeIf { it.versionCode > installed }
    }
}
