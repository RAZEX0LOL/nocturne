package app.nocturne.music

import java.util.Locale

/**
 * Язык интерфейса. Ключ — русская строка, как в каталоге на iPhone: исходный текст остаётся
 * в коде читаемым, а перевод лежит рядом одним списком. Язык берётся системный: в Android
 * его можно задать и на одно приложение, отдельной настройки для этого не нужно.
 *
 * Подстановки помечаются фигурными скобками: `tr("Треков: {n}", "n" to 12)`.
 */
private val english = mapOf(
    "Сохранить для офлайна" to "Keep for offline playback",
    "Готовить очередь для офлайна" to "Prepare the queue for offline playback",
    "До трёх следующих треков на неограниченной сети, до 256 МБ. Ручные загрузки не удаляются." to "Up to three upcoming tracks on an unmetered connection, up to 256 MB. Manual downloads are kept.",
    "Лимит места" to "Storage limit",
    "Без лимита" to "Unlimited",
    "Не удалось сохранить очередь загрузок." to "Could not save the download queue.",
    "Не удалось скачать «{title}». Задание сохранено для повтора." to "Could not download “{title}”. The job is saved for retry.",
    "Загрузка музыки" to "Downloading music",
    "Раздел ещё не сохранён для офлайна." to "This section has not been saved for offline use yet.",

    // Вход
    "Твоя музыка.\nТвоё пространство." to "Your music.\nYour space.",
    "Подключи Navidrome и забери любимую музыку с собой." to "Connect Navidrome and take your favourite music with you.",
    "Адрес сервера" to "Server address",
    "Логин" to "Username",
    "Пароль Navidrome" to "Navidrome password",
    "Подключиться" to "Connect",
    "Данные входа зашифрованы ключом из Android Keystore и исключены из резервной копии." to
        "The sign-in details are encrypted with a key from the Android Keystore and left out of backups.",
    "Слушать музыку с телефона — без сервера" to "Play music from this phone — no server",
    "Посмотреть демоверсию" to "See the demo",
    "Демоверсия · Подключить Navidrome" to "Demo · Connect Navidrome",

    // Разделы
    "Главная" to "Home",
    "Медиатека" to "Library",
    "Поиск" to "Search",
    "На телефоне" to "On this phone",
    "Загрузки" to "Downloads",
    "Альбомы" to "Albums",
    "Артисты" to "Artists",
    "Исполнители" to "Artists",
    "Исполнитель" to "Artist",
    "Плейлисты" to "Playlists",
    "Избранное" to "Favourites",
    "Любимые треки" to "Favourite songs",
    "Недавно добавлено" to "Recently added",
    "Моя музыка" to "My music",
    "Доступно без сети" to "Available offline",
    "Треки" to "Songs",
    "Назад" to "Back",
    "Обновить" to "Refresh",
    "Загрузить ещё" to "Load more",
    "Повторить" to "Try again",

    // Пустые экраны
    "Здесь пока тихо" to "Quiet in here",
    "Добавь музыку в Navidrome и обнови медиатеку." to "Add music to Navidrome and refresh the library.",
    "Твоя музыка будет здесь" to "Your music will be here",
    "Здесь появится твоя музыка." to "Your music will show up here.",
    "Открой «Медиатека → На телефоне» и добавь файлы или папку." to "Open “Library → On this phone” and add files or a folder.",
    "На телефоне пока нет музыки" to "No music on this phone yet",
    "Добавь файлы или папку кнопками выше. Поддерживаются MP3, M4A, AAC, FLAC, WAV, OGG." to
        "Add files or a folder with the buttons above. MP3, M4A, AAC, FLAC, WAV and OGG are supported.",
    "Загрузок пока нет" to "No downloads yet",
    "Открой альбом и нажми «Скачать», чтобы слушать без сети." to "Open an album and tap “Download” to listen offline.",
    "Избранного пока нет" to "No favourites yet",
    "Отмечай треки сердцем — они соберутся здесь." to "Tap the heart on a song and it lands here.",
    "Плейлистов пока нет" to "No playlists yet",
    "Плейлисты из Navidrome появятся здесь." to "Playlists from Navidrome will show up here.",
    "Ничего не найдено" to "Nothing found",
    "Попробуй другое название или исполнителя." to "Try another title or artist.",
    "Пока пусто" to "Nothing yet",
    "Найди своё звучание" to "Find your sound",
    "Альбомы, исполнители и любимые треки." to "Albums, artists and favourite songs.",
    "Поиск в медиатеке" to "Search the library",
    "Нет связи с сервером" to "No connection to the server",
    "Играет то, что на телефоне и в загрузках." to "Playing what is on this phone and in downloads.",
    "Треки с сервера, сохранённые для прослушивания без сети." to "Songs from the server, kept for offline listening.",
    " Сейчас скачивается: {n}." to " Downloading now: {n}.",
    "Папка на телефоне: {folder}" to "Folder on this phone: {folder}",
    "Треков: {n}" to "Songs: {n}",
    "Альбомов: {n}" to "Albums: {n}",
    "Треков на телефоне: {n}" to "Songs on this phone: {n}",

    // Действия
    "Слушать" to "Play",
    "Слушать избранное" to "Play favourites",
    "Перемешать" to "Shuffle",
    "Перемешать всё" to "Shuffle everything",
    "Скачать" to "Download",
    "Скачано" to "Downloaded",
    "Файлы" to "Files",
    "Папка" to "Folder",
    "Добавляю музыку…" to "Adding music…",
    "Действия с треком" to "Song actions",
    "Сыграть следующим" to "Play next",
    "В конец очереди" to "Add to queue",
    "В избранное" to "Add to favourites",
    "Убрать из избранного" to "Remove from favourites",
    "Убрать из очереди" to "Remove from queue",
    "Удалить загрузку" to "Delete download",
    "Удалить с телефона" to "Delete from this phone",
    "Понятно" to "Got it",
    "Готово" to "Done",
    "Неизвестный исполнитель" to "Unknown artist",

    // Плеер
    "СЕЙЧАС ИГРАЕТ" to "NOW PLAYING",
    "Свернуть" to "Collapse",
    "Очередь" to "Queue",
    "Очередь · {n}" to "Queue · {n}",
    "Воспроизведение / пауза" to "Play / pause",
    "Предыдущий трек" to "Previous song",
    "Следующий трек" to "Next song",
    "Перемешивать" to "Shuffle",
    "Режим повтора" to "Repeat mode",
    "Текст" to "Lyrics",
    "Текст песни" to "Lyrics",
    "Navidrome не нашёл текст для этого трека." to "Navidrome has no lyrics for this song.",
    "Таймер сна" to "Sleep timer",
    "Таймер включён" to "Timer on",
    "Выключить таймер" to "Turn the timer off",
    "В конце трека" to "At the end of the song",
    "{n} мин" to "{n} min",

    // Настройки
    "Настройки" to "Settings",
    "Качество потока" to "Stream quality",
    "Мобильная сеть" to "Mobile data",
    "Новое качество применяется со следующего трека." to "The new quality applies from the next song.",
    "Оригинал" to "Original",
    "Громкость" to "Volume",
    "Выключено" to "Off",
    "По треку" to "Per song",
    "По альбому" to "Per album",
    "Без затухания" to "No fade",
    "{n} с" to "{n} s",
    "Затухание между треками." to "Fades between songs.",
    "Эквалайзер" to "Equaliser",
    "Включить" to "Turn on",
    "Ровно" to "Flat",
    "Бас" to "Bass",
    "Верх" to "Treble",
    "Вокал" to "Vocal",
    "Громко" to "Loudness",
    "{n}к" to "{n}k",
    "Оформление" to "Appearance",
    "Фиолетовый" to "Violet",
    "Мятный" to "Mint",
    "Рассвет" to "Dawn",
    "Серый" to "Grey",
    "Только по Wi-Fi" to "Wi-Fi only",
    "Скачивать избранное" to "Download favourites",
    "Сервер" to "Server",
    "Подключить Navidrome" to "Connect Navidrome",
    "Отключить сервер" to "Disconnect the server",

    // Сообщения
    "Сыграет следующим" to "Plays next",
    "Следующими: {n}" to "Next in line: {n}",
    "Добавлено в очередь" to "Added to the queue",
    "В очередь: {n}" to "Added to the queue: {n}",
    "Трек скачан" to "Song downloaded",
    "Скачано треков: {n}" to "Songs downloaded: {n}",
    "Уже скачано" to "Already downloaded",
    "Трек не скачан — недоступен без сети" to "Not downloaded — unavailable offline",
    "Добавлено на телефон: {n}" to "Added to this phone: {n}",
    "Новых треков не найдено" to "No new songs found",
    "Добавлено в «{playlist}»" to "Added to “{playlist}”",
    "Плейлист «{name}» создан" to "Playlist “{name}” created",
    "Таймер сна: музыка остановлена" to "Sleep timer: the music has stopped",
    "Загрузка только по Wi-Fi — включи Wi-Fi или измени настройку." to
        "Downloads are Wi-Fi only — turn Wi-Fi on or change the setting.",
    "Не удалось скачать «{title}»" to "Could not download “{title}”",
    "Не удалось воспроизвести трек. Проверь сеть и транскодирование Navidrome." to
        "Could not play the song. Check the network and Navidrome transcoding.",
    "Не удалось выполнить действие. Проверь подключение." to "Could not do that. Check the connection.",
    "Не удалось прочитать сохранённый вход. Подключи сервер заново." to
        "Could not read the saved sign-in. Connect the server again.",
    "Не удалось удалить сохранённый вход." to "Could not delete the saved sign-in.",
    "Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку." to
        "This is the demo library. Connect Navidrome to listen to your own music.",
    "Аудиосервис ещё подключается. Попробуй через секунду." to "The audio service is still starting. Try again in a second.",
    "Аудиосервис недоступен. Перезапусти приложение." to "The audio service is unavailable. Restart the app.",
    "Не удалось применить эквалайзер" to "Could not apply the equaliser",
    "Эквалайзер недоступен на этом устройстве" to "The equaliser is not available on this device",

    // Сообщения ядра: приходят из общего слоя, поэтому переводятся там, где показываются
    "Введи логин и пароль." to "Enter a username and a password.",
    "Укажи адрес сервера по HTTPS без логина и параметров." to "Enter an HTTPS server address without a login or parameters.",
    "Неверный логин или пароль." to "Wrong username or password.",
    "Сервер вернул неожиданный ответ." to "The server returned an unexpected response.",
    "Не удалось связаться с сервером. Проверь сеть и адрес Navidrome." to
        "Could not reach the server. Check the network and the Navidrome address.",
    "Ошибка Navidrome ({code})." to "Navidrome error ({code}).",
    "Сервер вернул HTTP {status}." to "The server returned HTTP {status}.",
    // Синхронизация очереди и LRCLIB
    "Играло на компьютере" to "From your computer",
    "Играло на другом устройстве" to "From another device",
    "«{title}», с {time}" to "“{title}”, from {time}",
    "Продолжить" to "Continue",
    "Закрыть" to "Close",
    "Искать тексты в LRCLIB" to "Find lyrics on LRCLIB",
    "Если у Navidrome текста нет, он берётся из открытой базы lrclib.net. Туда уходят название, исполнитель и длительность трека." to "If Navidrome has no lyrics, they come from the open lrclib.net database. The song title, artist and duration are sent there.",
    "Искать в LRCLIB" to "Search LRCLIB",
    "Из обложки" to "From cover",
    "Янтарь" to "Amber",
    "Небо" to "Sky",
    "Лайм" to "Lime",
    "Острые" to "Sharp",
    "Обычные" to "Normal",
    "Круглые" to "Round",
    "Градиент" to "Gradient",
    "Размытая обложка" to "Blurred cover",
    "Однотонный" to "Solid",
    "Углы" to "Corners",
    "Фон плеера" to "Player background",
    "Размер текста песни" to "Lyrics size",
    "Мелкий" to "Small",
    "Обычный" to "Normal",
    "Крупный" to "Large",
    "Огромный" to "Huge",
    "Текст песни по центру" to "Centre the lyrics",
    "Доступно обновление" to "Update available",
    "Версия {version} — встанет поверх, ничего не потеряется" to "Version {version} — installs over this one, nothing is lost",
    "Скачиваю… {percent}%" to "Downloading… {percent}%",
    "Обновить" to "Update",
    "Приложение" to "App",
    "Обновления ставятся поверх установленной версии — настройки, загрузки и вход на сервер остаются." to "Updates install over the current version — settings, downloads and the server sign-in stay.",
    "Проверить" to "Check",
    "Установлена последняя версия" to "You have the latest version",
    "Не удалось проверить обновления." to "Could not check for updates.",
    "Не удалось установить обновление." to "Could not install the update.",
    "Разреши установку из Nocturne Player и нажми «Обновить» ещё раз" to "Allow installs from Nocturne Player, then tap Update again",
    "Файл обновления повреждён — скачай ещё раз." to "The update file is damaged — download it again.",
    "Обновление подписано другим ключом — поверх этой версии оно не встанет." to "The update is signed with another key — it can't install over this version.",
    "Можно поискать в открытой базе lrclib.net — туда уйдут название и исполнитель." to "You can search the open lrclib.net database — the title and artist will be sent there.",
    // ТРИЗ: темы, скорость, бесконечное воспроизведение, микс, «Поделиться»
    "Тёмная" to "Dark",
    "OLED-чёрная" to "OLED black",
    "Светлая" to "Light",
    "Как в системе" to "System",
    "Авто" to "Auto",
    "Бесконечное воспроизведение" to "Endless playback",
    "Очередь закончилась — дальше играет похожая музыка, как радио по последнему треку." to "When the queue ends, similar music keeps playing, like a radio from the last song.",
    "Микс по треку" to "Song mix",
    "Поделиться" to "Share",
    "Похожих треков не нашлось" to "No similar songs found",
    "Не удалось создать ссылку. Включи «Поделиться» в настройках Navidrome (EnableSharing)." to "Could not create a link. Turn on sharing in Navidrome (EnableSharing).",
    "Язык" to "Language",
    "English" to "English",
    "Ранее" to "Earlier",
    "Дальше" to "Up next",
)

/**
 * Язык интерфейса. По умолчанию — как в системе: русская система оставляет исходный текст, любая
 * другая получает английский. Выбор в настройках это переопределяет (на Android 12 и старше
 * системного выбора языка для приложения нет, а людям он нужен).
 */
enum class AppLanguage(val title: String) { system("Как в системе"), ru("Русский"), en("English") }

@Volatile internal var appLanguage: AppLanguage = AppLanguage.system

private val useEnglish: Boolean
    get() = when (appLanguage) {
        AppLanguage.ru -> false
        AppLanguage.en -> true
        AppLanguage.system -> Locale.getDefault().language != "ru"
    }

internal fun tr(text: String, vararg values: Pair<String, Any?>): String {
    var result = if (useEnglish) english[text] ?: text else text
    for ((key, value) in values) result = result.replace("{$key}", value.toString())
    return result
}
