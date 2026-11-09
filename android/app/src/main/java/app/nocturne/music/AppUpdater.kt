package app.nocturne.music

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings as SystemSettings
import app.nocturne.core.AppUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

/**
 * Обновление без переустановки: новый APK скачивается и ставится поверх через системный
 * установщик — настройки, загрузки и вход на сервер остаются. Поверх встаёт только APK с той же
 * подписью, поэтому подпись сверяется до установки: чужой файл не дойдёт даже до диалога.
 */
class AppUpdater(private val context: Context, private val http: OkHttpClient = OkHttpClient()) {
    val installedCode: Int get() = BuildConfig.VERSION_CODE

    suspend fun check(): AppUpdate? = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(AppUpdate.MANIFEST).build()).execute().use { response ->
            if (!response.isSuccessful) null else AppUpdate.newer(response.body?.string().orEmpty(), installedCode)
        }
    }

    /** Разрешение «Установка неизвестных приложений» для Nocturne Player — Android спрашивает его один раз. */
    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun permissionIntent(): Intent =
        Intent(SystemSettings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Скачивает в кэш с проверкой суммы; progress — доля от 0 до 1. */
    suspend fun download(update: AppUpdate, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val folder = File(context.cacheDir, "updates").apply { mkdirs() }
        folder.listFiles()?.forEach { it.delete() }
        val file = File(folder, "nocturne-${update.versionCode}.apk")
        val digest = MessageDigest.getInstance("SHA-256")
        http.newCall(Request.Builder().url(update.url).build()).execute().use { response ->
            check(response.isSuccessful) { "HTTP ${response.code}" }
            val body = checkNotNull(response.body)
            val total = body.contentLength().takeIf { it > 0 }
            body.byteStream().use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var done = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        done += read
                        total?.let { progress(done.toFloat() / it) }
                    }
                }
            }
        }
        val sum = digest.digest().joinToString("") { "%02x".format(it) }
        if (sum != update.sha256) {
            file.delete()
            error(tr("Файл обновления повреждён — скачай ещё раз."))
        }
        if (!sameSignature(file)) {
            file.delete()
            error(tr("Обновление подписано другим ключом — поверх этой версии оно не встанет."))
        }
        file
    }

    private fun sameSignature(apk: File): Boolean {
        val flags = PackageManager.GET_SIGNING_CERTIFICATES
        val archive = context.packageManager.getPackageArchiveInfo(apk.path, flags)?.signingInfo ?: return false
        val installed = context.packageManager.getPackageInfo(context.packageName, flags).signingInfo ?: return false
        val theirs = archive.apkContentsSigners.map { it.toByteArray().contentHashCode() }.toSet()
        val ours = installed.apkContentsSigners.map { it.toByteArray().contentHashCode() }.toSet()
        return theirs.isNotEmpty() && theirs == ours
    }

    /** Отдаёт файл системному установщику; подтверждение Android покажет сам. */
    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            // Android 12+: если Nocturne Player уже ставил себя сам, следующие обновления — без лишнего вопроса.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("nocturne.apk", 0, apk.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }
            val intent = Intent(context, UpdateStatusReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            session.commit(PendingIntent.getBroadcast(context, id, intent, flags).intentSender)
        }
    }
}

/** Ответ установщика: попросил подтверждение — показываем его; ошибку — пишем в приложение. */
class UpdateStatusReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> UpdateEvents.failed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: tr("Не удалось установить обновление."))
        }
    }
}

/** Ошибка установки приходит в приёмник, а показать её нужно в интерфейсе. */
object UpdateEvents {
    var listener: ((String) -> Unit)? = null
    fun failed(message: String) { listener?.invoke(message) }
}
