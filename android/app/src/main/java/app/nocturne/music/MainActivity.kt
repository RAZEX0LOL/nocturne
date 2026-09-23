package app.nocturne.music

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationsIfNeeded()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        setContent {
            val vm: MusicViewModel = viewModel()
            // Акцент оформления выбирают в настройках, поэтому тема читает его из состояния.
            NocturneTheme(vm.settings.accent) { NocturneApp(vm) }
            connectFromIntentIfDebug(vm)
        }
    }

    /**
     * Отладочный вход без набора на клавиатуре: adb ... -e server ... -e user ... -e password ...
     * Только для отладочной сборки — в релизе этого пути нет.
     */
    @androidx.compose.runtime.Composable
    private fun connectFromIntentIfDebug(vm: MusicViewModel) {
        if (!BuildConfig.DEBUG) return
        val server = intent.getStringExtra("server") ?: return
        val user = intent.getStringExtra("user") ?: return
        val password = intent.getStringExtra("password") ?: return
        androidx.compose.runtime.LaunchedEffect(server, user) {
            if (vm.client == null) vm.connect(server, user, password) {}
        }
    }

    /** Без этого разрешения Android 13+ прячет уведомление плеера, и музыкой не поуправлять из шторки. */
    private fun requestNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {}.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
