package app.nocturne.music

import android.app.PendingIntent
import android.content.Intent
import android.content.SharedPreferences
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private var effects: AudioEffects? = null
    private var settingsStore: SharedPreferences? = null
    private var settingsWatcher: SharedPreferences.OnSharedPreferenceChangeListener? = null

    @androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])
    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
        }
        val openApp = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        session = MediaSession.Builder(this, player).setSessionActivity(openApp).build()

        // Эквалайзер живёт рядом с плеером: сессия звука принадлежит ему, а не окну приложения.
        val effects = AudioEffects(this).also { this.effects = it }
        effects.attach(player.audioSessionId)
        player.addListener(object : Player.Listener {
            override fun onAudioSessionIdChanged(audioSessionId: Int) = effects.attach(audioSessionId)
        })
        // Настройки меняются в окне, а применять их нужно здесь.
        val watcher = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == null || key.startsWith("eq.")) effects.apply()
        }
        settingsWatcher = watcher
        settingsStore = getSharedPreferences("settings", MODE_PRIVATE).also { it.registerOnSharedPreferenceChangeListener(watcher) }
    }

    @androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        if (controllerInfo.packageName == packageName || controllerInfo.isTrusted) session else null

    override fun onDestroy() {
        settingsWatcher?.let { settingsStore?.unregisterOnSharedPreferenceChangeListener(it) }
        effects?.release()
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }
}
