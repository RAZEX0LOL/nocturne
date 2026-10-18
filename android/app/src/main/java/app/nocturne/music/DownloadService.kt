package app.nocturne.music

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.content.ContextCompat
import app.nocturne.core.NavidromeClient
import kotlinx.coroutines.*

/** Время жизни загрузки принадлежит сервису; экран только добавляет задания. */
class DownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var worker: Job? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("downloads", "Nocturne", NotificationManager.IMPORTANCE_LOW))
        startForeground(42, Notification.Builder(this, "downloads").setSmallIcon(app.nocturne.music.R.drawable.ic_nocturne)
            .setContentTitle("Nocturne").setContentText(tr("Загрузка музыки")).setOngoing(true).build())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (worker?.isActive != true) worker = scope.launch {
            val store = DownloadStore.get(this@DownloadService)
            while (isActive) {
                val vault = CredentialVault(this@DownloadService)
                if (vault.prefersOnDevice()) break
                val credentials = runCatching { vault.load() }.getOrNull() ?: break
                store.restoreOwner(credentials.account)
                if (store.activeAccount() != credentials.account) break
                if (store.jobs(credentials.account).isEmpty()) break
                store.run(NavidromeClient(credentials), Settings(this@DownloadService))
                if (store.jobs(credentials.account).isEmpty()) break
                delay(15_000)
            }
            stopSelf()
        }
        return START_STICKY
    }
    override fun onTimeout(startId: Int, fgsType: Int) { scope.cancel(); stopSelf() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        fun resume(context: Context) {
            runCatching { ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java)) }
        }
    }
}
