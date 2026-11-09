/**
 * Язык сайта. Ключ — русская строка, как в самом приложении: исходный текст остаётся в коде
 * читаемым, а перевод лежит рядом одним списком.
 *
 * Язык берётся из адреса (`?lang=en`), затем из прошлого выбора, затем из языка браузера.
 * Выбор запоминается и подставляется в `<html lang>` — поисковикам и читалкам это важно.
 */

export type Language = 'ru' | 'en'

const english: Record<string, string> = {
  'Обновлено 9 ноября 2026 года.': 'Updated November 9, 2026.',
  "Версия из App Store": "App Store version",
  "Nocturne Player — плеер для Navidrome": "Nocturne Player — a player for Navidrome",
  "Nocturne Player: музыка с Navidrome и файлы с устройства. Бесплатно на iPhone, iPad, Mac, Windows, Linux и Android. iPhone и iPad — в App Store.": "Nocturne Player: your Navidrome library and local music. Free on iPhone, iPad, Mac, Windows, Linux and Android. Available on the App Store for iPhone and iPad.",
  "С чего начать — Nocturne Player": "Getting started — Nocturne Player",
  "Как слушать локальную музыку без сервера или подключить Nocturne Player к своей медиатеке Navidrome: пошаговая инструкция.": "Play local music without a server or connect Nocturne Player to your own Navidrome library: a step-by-step guide.",
  "Поддержка — Nocturne Player": "Support — Nocturne Player",
  "Помощь с Nocturne Player: установка из App Store, музыка с телефона без сервера, подключение к Navidrome и воспроизведение.": "Nocturne Player help: App Store installation, local music without a server, connecting to Navidrome and playback.",
  "Политика конфиденциальности — Nocturne Player": "Privacy policy — Nocturne Player",
  "Nocturne Player: локальное хранение музыки и настроек, подключение к своему серверу и внешним сервисам, без рекламы и аналитики.": "Nocturne Player: local music and settings, connections to your server and external services, with no ads or analytics.",
  "Скачать в App Store": "Download on the App Store",
  "Новая версия сохраняет настройки, загрузки и вход на сервер. На iPhone и iPad обновления приходят через App Store.": "New versions keep your settings, downloads and server sign-in. On iPhone and iPad, updates arrive through the App Store.",
  "На компьютере и Android обновления доступны в приложении: настройки, загрузки и вход сохраняются. На Android разреши установку из Nocturne Player, когда система попросит. Версии из App Store обновляются через App Store.": "On desktop and Android, updates are available in the app and keep your settings, downloads and sign-in. On Android, allow installation from Nocturne Player when prompted. App Store versions update through the App Store.",
  "Бесплатно, без рекламы и подписок. Разработчик не собирает историю прослушиваний. О подключениях к серверу, поиске текстов и проверке обновлений — в политике конфиденциальности.": "Free, with no ads or subscriptions. The developer does not collect your listening history. See the privacy policy for details about server connections, lyrics search and update checks.",
  "Общая медиатека и привычное управление, с интерфейсом под каждую систему.": "Your library and familiar controls, with an interface tailored to each system.",
  "Nocturne Player играет файлы с устройства и музыку с сервера Navidrome. Для локальных файлов сервер не нужен. Эта инструкция — для своей сетевой медиатеки на домашнем компьютере, NAS или VPS.": "Nocturne Player plays files from your device and music from a Navidrome server. Local files do not need a server. This guide covers setting up your own network library on a home computer, NAS or VPS.",
  "Для сетевой медиатеки подключи свой Navidrome на домашнем компьютере, NAS или VPS. Если сервера ещё нет, воспользуйся инструкцией:": "For a network library, connect your own Navidrome on a home computer, NAS or VPS. If you do not have a server yet, follow the guide:",
  "Можно начать без сервера: выбери прослушивание музыки с устройства на экране входа и добавь свои файлы. Или открой «Посмотреть демоверсию», чтобы попробовать плеер на встроенных треках.": "You can start without a server: choose music from your device on the connection screen and add your own files. Or choose “See the demo” to try the player with bundled tracks.",
  "Проверь громкость и выбранный аудиовыход, затем перезапусти трек. На Android проверь ограничения работы приложения в фоне и настройки батареи. Для серверного трека попробуй другое качество потока: сервер мог не справиться с перекодированием. Если звук снова пропадёт, напиши модель устройства, версию системы и приложения, а также продолжает ли двигаться время трека.": "Check the volume and selected audio output, then restart the track. On Android, check background activity and battery restrictions. For a server track, try a different streaming quality: the server may have failed to transcode it. If sound drops again, send your device model, OS and app versions, and whether the track timer keeps moving.",
  "— только на компьютере и если ты включил статус. Информация о треке передаётся локально приложению Discord; Discord может показать её другим пользователям в твоём статусе.": "— only on desktop, when you enable the status. Track information is passed locally to the Discord app; Discord may show it to other users in your activity status.",
  "Данные входа защищены системным хранилищем устройства. Импортированная и скачанная музыка, обложки и настройки хранятся локально. Чтобы удалить данные входа, отключи сервер в приложении: удаление приложения не всегда очищает системное хранилище паролей. Исходные файлы и музыка на твоём сервере остаются у тебя.": "Sign-in details are protected by the device’s secure storage. Imported and downloaded music, artwork and settings are stored locally. Disconnect the server in the app to remove its sign-in details: uninstalling an app does not always clear system password storage. Your original files and music on your server remain yours.",
  "iOS и iPadOS 17 и новее": "iOS and iPadOS 17 or later",
  "Открыть в App Store": "Open in the App Store",
  "Установи Nocturne Player из App Store. Обновления приходят через App Store; TestFlight не нужен.": "Install Nocturne Player from the App Store. Updates arrive through the App Store; TestFlight is not required.",
  "iPhone и iPad": "iPhone and iPad",
  "или": "or",
  "Без сервера: музыка с устройства": "No server: music from your device",
  "На Android открой «Медиатека → На телефоне» и нажми «Файлы» или «Папка». Выбранная музыка копируется в приложение и играет без интернета. Если сервер уже подключён, отключать его не нужно.": "On Android, open “Library → On this phone” and choose “Files” or “Folder”. Selected music is copied into the app and plays offline. You do not need to disconnect an existing server.",
  "На iPhone и iPad открой раздел музыки на устройстве и добавь файлы или папку. Можно также отправить аудиофайл через «Поделиться → Nocturne Player». На компьютере добавь файлы или папку в локальную медиатеку.": "On iPhone and iPad, open the on-device music section and add files or a folder. You can also send an audio file via “Share → Nocturne Player”. On desktop, add files or a folder to the local library.",
  "Установить приложение": "Install the app",
  "На iPhone и iPad Nocturne Player доступен в App Store. Для Android, Windows, Linux и Mac установщики находятся на главной странице.": "On iPhone and iPad, Nocturne Player is available on the App Store. Android, Windows, Linux and Mac installers are on the home page.",
  // Шапка и главный экран
  'Возможности': 'Features',
  'Скриншоты': 'Screenshots',
  'Скачать': 'Download',
  'Что нового': "What's new",
  'Вопросы': 'FAQ',
  'С чего начать': 'Getting started',
  'Версия {version}': 'Version {version}',
  'Твоя музыка.': 'Your music.',
  'Твоё пространство.': 'Your space.',
  'Nocturne Player — плеер для своего сервера Navidrome. Красивый, быстрый и родной на каждой системе: начни слушать на компьютере и продолжи с того же места на телефоне.':
    'Nocturne Player is a player for your own Navidrome server. Beautiful, fast and native on every system: start listening on your computer and pick up at the same spot on your phone.',
  'Скачать для {name}': 'Download for {name}',
  'Установить через TestFlight': 'Install via TestFlight',
  'Все платформы': 'All platforms',
  'Бесплатно · без рекламы · без аккаунтов, кроме твоего сервера': 'Free · no ads · no accounts beyond your own server',
  'Nocturne Player на компьютере: альбом, полноэкранный плеер с текстом песни и светлая тема':
    'Nocturne Player on a computer: an album, the full-screen player with lyrics and the light theme',
  'Nocturne Player на Mac: полноэкранный плеер с синхронным текстом песни': 'Nocturne Player on Mac: the full-screen player with synced lyrics',
  'Nocturne Player на iPhone: плеер': 'Nocturne Player on iPhone: the player',

  // Возможности
  'Всё, что нужно от плеера — и ничего лишнего': 'Everything a player needs — and nothing more',
  'Nocturne Player подключается к Navidrome (и любому Subsonic-совместимому серверу) и превращает домашнюю медиатеку в музыкальный сервис, который принадлежит тебе.':
    'Nocturne Player connects to Navidrome (and any Subsonic-compatible server) and turns your home library into a music service that belongs to you.',
  'Продолжи на другом устройстве': 'Pick up on another device',
  'Очередь и место в треке сохраняются на сервере. Выключил музыку на компьютере — телефон предложит продолжить с той же секунды.':
    'The queue and your position are saved on the server. Stop the music on your computer and your phone offers to continue from the same second.',
  'Тексты, которые идут за песней': 'Lyrics that follow the song',
  'Синхронный текст подсвечивает строку и сам листается. Нет у сервера — найдётся в открытой базе LRCLIB, даже для треков с кривыми тегами.':
    'Synced lyrics highlight the current line and scroll by themselves. If the server has none, they come from the open LRCLIB database — even for songs with messy tags.',
  'Музыка не кончается': 'The music never ends',
  'Альбом закончился — дальше играет похожее, как радио по последнему треку. Без пауз между треками и с плавным переходом.':
    'When an album ends, something similar keeps playing, like a radio built from the last track. No gaps between songs, with a smooth crossfade.',
  'Офлайн': 'Offline',
  'Скачай альбомы и плейлисты — они играют в метро и в самолёте. Без сервера тоже можно: слушай файлы с компьютера или телефона.':
    'Download albums and playlists — they play on the subway and on a plane. You can also go without a server and play files from your computer or phone.',
  'Звук под себя': 'Sound your way',
  'Эквалайзер с пресетами, выравнивание громкости ReplayGain, скорость от 0,5× до 2× и таймер сна, который гасит звук плавно.':
    'An equalizer with presets, ReplayGain volume levelling, speed from 0.5× to 2× and a sleep timer that fades the sound out gently.',
  'Оформление': 'Appearance',
  'Тёмная, светлая и OLED-чёрная темы, цвет акцента из обложки, размер текста, форма углов — подстрой интерфейс под себя.':
    'Dark, light and OLED-black themes, an accent colour taken from the cover, text size, corner style — make the interface yours.',
  'Родной на каждой системе': 'Native on every system',
  'На Mac — значки SF Symbols и стекло, на Windows — Mica и медиаклавиши, на телефоне — шторка, виджеты и экран блокировки.':
    'SF Symbols and vibrancy on Mac, Mica and media keys on Windows, the notification shade, widgets and lock screen on a phone.',
  'Обновляется сам': 'Updates itself',
  'Новая версия ставится поверх старой: настройки, загрузки и вход на сервер остаются. На iPhone — через TestFlight.':
    'A new version installs over the old one: settings, downloads and the server sign-in stay. On iPhone it comes through TestFlight.',

  // Скриншоты
  'Один плеер — три характера': 'One player, three characters',
  'Интерфейс подстраивается под систему, а возможности везде одинаковые.': 'The interface follows the system; the features are the same everywhere.',
  'Платформа': 'Platform',
  'Компьютер': 'Computer',
  'Главная: недавно слушал, новинки и любимое': 'Home: recently played, new arrivals and favourites',
  'Альбом: оценки, загрузка и очередь': 'Album: ratings, downloads and the queue',
  'Полноэкранный плеер с текстом и визуализатором': 'The full-screen player with lyrics and a visualizer',
  'Светлая тема и настройки оформления': 'The light theme and appearance settings',
  'Главная': 'Home',
  'Плеер': 'Player',
  'Текст песни': 'Lyrics',
  'Поиск': 'Search',

  // Скачать
  'Поставь на все свои устройства': 'Install it on all your devices',
  'Сейчас актуальна версия {version}. Дальше приложение обновится само.': 'The current version is {version}. After that the app updates itself.',
  'Дальше приложение обновится само.': 'After that the app updates itself.',
  'Твоя система': 'Your system',
  'Все файлы — на': 'All files are on',
  '. Каждое обновление подписано: приложение не поставит файл, который подменили по дороге.':
    '. Every update is signed: the app will not install a file that was tampered with on the way.',
  'Mac на Apple Silicon (M1 и новее)': 'Mac with Apple Silicon (M1 and newer)',
  'Открой образ и перетащи Nocturne Player в «Программы». Приложение подписано и проверено Apple — откроется без предупреждений.':
    'Open the image and drag Nocturne Player into Applications. The app is signed and notarized by Apple, so it opens without warnings.',
  'Скачать .dmg': 'Download .dmg',
  'Windows 10 и 11, x64': 'Windows 10 and 11, x64',
  'Если SmartScreen предупредит о новом приложении — «Подробнее» → «Выполнить в любом случае».':
    'If SmartScreen warns about an unrecognized app, choose “More info” → “Run anyway”.',
  'Скачать установщик': 'Download the installer',
  'Android 8 и новее': 'Android 8 and newer',
  'Открой скачанный файл и разреши установку из браузера — это нужно один раз.':
    'Open the downloaded file and allow installs from your browser — this is needed once.',
  'Скачать APK': 'Download APK',
  'iOS 17+, бета через TestFlight': 'iOS 17+, beta through TestFlight',
  'Поставь TestFlight из App Store и открой ссылку на телефоне. Обновления придут через TestFlight.':
    'Install TestFlight from the App Store and open the link on your phone. Updates arrive through TestFlight.',
  'Открыть в TestFlight': 'Open in TestFlight',
  'x86-64, Ubuntu 22.04 и новее': 'x86-64, Ubuntu 22.04 and newer',
  'AppImage достаточно сделать исполняемым (chmod +x) и запустить. Для Debian и Ubuntu есть .deb.':
    'Make the AppImage executable (chmod +x) and run it. There is a .deb for Debian and Ubuntu.',
  'Скачать AppImage': 'Download AppImage',
  'Скачать .deb': 'Download .deb',

  // История версий
  'История версий': 'Version history',
  'Каждое обновление — что появилось, что стало лучше и что исправлено.': 'Every update: what was added, what got better and what was fixed.',
  'Все': 'All',
  'Последняя': 'Latest',
  'Новое': 'New',
  'Лучше': 'Better',
  'Исправлено': 'Fixed',
  'Показать все версии ({n})': 'Show all versions ({n})',
  'iPhone': 'iPhone',

  // Вопросы
  'Частые вопросы': 'Frequently asked questions',
  'Что такое Navidrome и зачем он нужен?': 'What is Navidrome and why do I need it?',
  'Navidrome — бесплатный сервер для своей музыкальной коллекции: ставится на домашний компьютер, NAS или VPS и раздаёт музыку по сети. Nocturne Player — плеер к нему. Подойдёт и любой другой сервер с API Subsonic.':
    'Navidrome is a free server for your own music collection: it runs on a home computer, a NAS or a VPS and serves the music over the network. Nocturne Player is a player for it. Any other server with the Subsonic API works too.',
  'Поставить за 10 минут': 'Set it up in 10 minutes',
  'Можно без сервера?': 'Can I use it without a server?',
  'Да, на любой системе. На компьютере, iPhone, iPad и Android можно слушать файлы прямо с устройства: на экране входа выбери «Слушать музыку с этого устройства». Есть и демоверсия — посмотреть плеер, ничего не подключая.':
    'Yes, on every system. On a computer, iPhone, iPad and Android you can play files straight from the device: pick “Play music from this device” on the sign-in screen. There is also a demo library, so you can look around without connecting anything.',
  'Как подключиться?': 'How do I connect?',
  'Открой приложение, введи адрес сервера, логин и пароль Navidrome. Пароль хранится в системном хранилище — Связке ключей, Keystore или менеджере учётных данных Windows.':
    'Open the app and enter the server address, your Navidrome username and password. The password is kept in the system store — Keychain, Keystore or Windows Credential Manager.',
  'Как приходят обновления?': 'How do updates arrive?',
  'Приложение само проверяет новую версию, скачивает её и ставит поверх — настройки, загрузки и вход остаются. На Android система один раз попросит разрешить установку из Nocturne Player. На iPhone обновления приходят через TestFlight.':
    'The app checks for a new version itself, downloads it and installs it over the old one — settings, downloads and the sign-in stay. On Android the system asks once to allow installs from Nocturne Player. On iPhone updates come through TestFlight.',
  'Почему Windows предупреждает при первом запуске?': 'Why does Windows warn me on first launch?',
  'Версия для Windows пока не подписана сертификатом Microsoft, поэтому SmartScreen её не знает. Нажми «Подробнее» → «Выполнить в любом случае» — это нужно один раз. Версия для Mac подписана и проверена Apple, там предупреждений нет.':
    'The Windows build is not signed with a Microsoft certificate yet, so SmartScreen does not know it. Choose “More info” → “Run anyway” — once is enough. The Mac build is signed and notarized by Apple, so there are no warnings there.',
  'Сколько стоит?': 'How much does it cost?',
  'Нисколько. Без рекламы, без подписок и без сбора данных: приложение общается только с твоим сервером (и с LRCLIB, если ты сам включишь поиск текстов).':
    'Nothing. No ads, no subscriptions and no data collection: the app talks only to your server (and to LRCLIB, if you turn lyrics search on yourself).',

  // Подвал
  'Сделано для своей музыки · {year}': 'Made for your own music · {year}',

  // Страница «С чего начать»
  'Свой музыкальный сервер за 10 минут': 'Your own music server in 10 minutes',
  'Nocturne Player — это плеер, а музыка живёт на твоём сервере Navidrome: на домашнем компьютере, NAS или VPS. Ставится он одной командой. Ниже — весь путь от пустой папки до музыки в телефоне.':
    'Nocturne Player is the player; the music lives on your own Navidrome server — a home computer, a NAS or a VPS. It installs with one command. Below is the whole path from an empty folder to music on your phone.',
  'Нужен компьютер, который может быть включён, когда ты слушаешь музыку, и': 'You need a computer that can stay on while you listen, and',
  '. Подойдёт и домашний ПК, и мини-компьютер, и арендованный сервер.': '. A home PC, a mini computer or a rented server all work.',
  'Пусть сканирует папку каждую минуту: закинул файлы — они сразу в медиатеке.':
    'Rescan every minute: drop files in and they show up in the library right away.',
  // Пример раскладки папок: на английской версии — латиницей, иначе он выглядит чужим.
  'ПРИМЕР_ПАПОК': `music/
  Pink Floyd/
    1973 — The Dark Side of the Moon/
      01 Speak to Me.flac
      02 Breathe.flac`,
  'Скопировать': 'Copy',
  'Скопировано': 'Copied',
  'Создай папку и файл': 'Create a folder and a file',
  'Заведи папку, например': 'Make a folder, for example',
  ', и положи в неё файл': ', and put this file in it:',
  'Рядом будут две папки:': 'Two folders will appear next to it:',
  '— твоя музыка,': '— your music,',
  '— то, что сервер хранит о ней сам (оценки, прослушивания). Музыку он только читает и никогда не меняет.':
    '— what the server keeps about it (ratings, play counts). It only reads your music and never changes it.',
  'Положи музыку': 'Add your music',
  'Скопируй файлы в папку': 'Copy the files into the',
  '. Раскладка любая, но удобнее так:': ' folder. Any layout works, but this one is convenient:',
  'Navidrome читает теги внутри файлов, а не имена папок. Если теги пустые, альбомы разъедутся — поправить их заранее помогает':
    'Navidrome reads the tags inside the files, not the folder names. With empty tags albums fall apart — fix them beforehand with',
  '. Форматы: mp3, flac, m4a, ogg, opus, wav.': '. Formats: mp3, flac, m4a, ogg, opus, wav.',
  'Запусти сервер': 'Start the server',
  'В той же папке выполни:': 'Run this in the same folder:',
  'Открой': 'Open',
  '— Navidrome попросит придумать логин и пароль администратора. Их же ты введёшь в Nocturne Player. Первое сканирование большой коллекции занимает несколько минут.':
    '— Navidrome will ask you to create an admin username and password. Those are what you enter in Nocturne Player. The first scan of a large collection takes a few minutes.',
  'Подключи Nocturne Player': 'Connect Nocturne Player',
  'Скачай приложение': 'Download the app',
  'для своей системы и введи три поля: адрес сервера, логин и пароль.': 'for your system and fill in three fields: server address, username and password.',
  'Если плеер на том же компьютере, адрес —': 'If the player runs on the same computer, the address is',
  '. Если на другом устройстве в той же сети — адрес этого компьютера в сети, например': '. On another device in the same network, use that computer’s address, for example',
  '. Пароль хранится в системном хранилище устройства, а не в файле.': '. The password is kept in the device’s system store, not in a file.',
  'Слушай вне дома': 'Listen away from home',
  'Пока сервер доступен только из домашней сети. Чтобы музыка играла и в дороге, есть три пути — от простого к надёжному:':
    'For now the server is reachable only from your home network. There are three ways to take the music with you, from simplest to sturdiest:',
  'Скачать заранее.': 'Download in advance.',
  'Ничего настраивать не нужно: отметь альбомы и плейлисты в Nocturne Player — они будут играть без сети.':
    'Nothing to set up: mark albums and playlists in Nocturne Player and they play without a network.',
  'Своя сеть поверх интернета': 'A private network over the internet',
  '. Ставится на сервер и на телефон, адрес остаётся внутренним, наружу ничего не торчит. Самый простой безопасный способ.':
    '. Install it on the server and on your phone; the address stays private and nothing is exposed. The simplest safe option.',
  'Свой домен.': 'Your own domain.',
  'Домен, обратный прокси (nginx или Caddy) и сертификат — тогда сервер открыт из любой точки. Сложнее и требует аккуратности: наружу смотрит настоящий сервер.':
    'A domain, a reverse proxy (nginx or Caddy) and a certificate — then the server is reachable from anywhere. Harder, and it needs care: a real server faces the internet.',
  'Что-то не получилось?': 'Something went wrong?',
  'Самое частое: Navidrome не видит музыку — проверь, что файлы лежат в папке': 'The most common one: Navidrome does not see the music. Check that the files are in the',
  'рядом с': 'folder next to',
  ', и загляни в': ', and look at',
  '. Подробности — в': '. Details are in the',
  'документации Navidrome': 'Navidrome documentation',
  'Скачать Nocturne Player': 'Download Nocturne Player',

  // Конфиденциальность и поддержка
  'Конфиденциальность': 'Privacy',
  'Политика конфиденциальности': 'Privacy policy',
  'Коротко: Nocturne Player не собирает о тебе никаких данных. У приложения нет серверов, аккаунтов, аналитики и рекламы. Музыка и всё, что с ней связано, остаются между твоим устройством и твоим сервером.':
    'In short: Nocturne Player collects no data about you. The app has no servers, no accounts, no analytics and no ads. Your music and everything around it stays between your device and your server.',
  'Действует с 22 октября 2026 года.': 'In effect since 22 October 2026.',
  'Какие данные мы собираем': 'What data we collect',
  'Никаких. У Nocturne Player нет собственного сервера, который мог бы что-то получать: разработчик не видит ни твою медиатеку, ни то, что ты слушаешь, ни адрес твоего сервера.':
    'None. Nocturne Player has no server of its own that could receive anything: the developer sees neither your library, nor what you listen to, nor your server’s address.',
  'Куда приложение обращается': 'Where the app connects',
  'Твой сервер Navidrome': 'Your Navidrome server',
  '— адрес, логин и пароль вводишь ты. Туда уходят запросы за музыкой, обложками и плейлистами, а также отметки о прослушивании, оценки и очередь. Этим сервером распоряжаешься ты.':
    '— you enter the address, username and password yourself. It receives requests for music, covers and playlists, plus scrobbles, ratings and the queue. That server is yours to control.',
  '— открытая база текстов песен. Приложение обращается к ней, только если ты включил поиск текстов в настройках. Отправляются название трека, исполнитель и длительность — без сведений о тебе и твоём сервере.':
    '— an open lyrics database. The app contacts it only if you turned lyrics search on in settings. It sends the track title, artist and duration — nothing about you or your server.',
  '— оттуда скачиваются обновления на компьютере и Android. Это обычная загрузка файла, без учётных записей. В App Store обновления приходят через Apple.':
    '— updates for the desktop and Android are downloaded from there. It is a plain file download, with no accounts. On the App Store updates come through Apple.',
  '— только на компьютере и только если ты включил статус. Название трека передаётся запущенному на том же компьютере приложению Discord, напрямую, без интернета.':
    '— desktop only, and only if you switched the status on. The track title is handed to the Discord app running on the same computer, directly, without the internet.',
  'Встроенное окно браузера (добавление музыки из интернета) открывает те сайты, которые ты сам в нём открываешь, и ведёт себя как обычный браузер.':
    'The built-in browser window (for adding music from the web) opens the sites you open in it and behaves like an ordinary browser.',
  'Что хранится на устройстве': 'What is stored on the device',
  'Пароль от сервера — в системном хранилище устройства: Связке ключей на Apple, Keystore на Android, менеджере учётных данных на Windows. Скачанная музыка, обложки и настройки лежат в папке приложения. Всё это исчезает вместе с приложением при удалении.':
    'The server password lives in the device’s system store: Keychain on Apple, Keystore on Android, Credential Manager on Windows. Downloaded music, covers and settings sit in the app’s folder. All of it goes away with the app when you delete it.',
  'Дети': 'Children',
  'Приложение не предназначено специально для детей и не собирает данные ни у кого, включая детей.':
    'The app is not directed at children, and it collects no data from anyone, children included.',
  'Изменения': 'Changes',
  'Если что-то в этой политике изменится, новая версия появится на этой странице с новой датой. Приложение не начнёт собирать данные молча.':
    'If anything in this policy changes, a new version appears on this page with a new date. The app will not start collecting data quietly.',
  'Связаться': 'Get in touch',
  'Вопросы о приложении и о приватности — на странице поддержки:': 'Questions about the app and about privacy go to the support page:',
  'Поддержка': 'Support',
  'Помощь с Nocturne Player': 'Nocturne Player help',
  'Nocturne Player — плеер для своего сервера Navidrome. Ниже — ответы на то, с чем люди сталкиваются чаще всего, и способ написать, если ответа здесь нет.':
    'Nocturne Player is a player for your own Navidrome server. Below are the things people run into most often, and a way to write in if the answer is not here.',
  'Первый запуск': 'First launch',
  'Приложению нужен сервер Navidrome — свой, на домашнем компьютере, NAS или VPS. Если его ещё нет, поставь за десять минут по инструкции:':
    'The app needs a Navidrome server of your own — on a home computer, a NAS or a VPS. If you do not have one yet, set it up in ten minutes:',
  'Сервер не обязателен: на экране входа есть «Слушать музыку с этого устройства» — плеер возьмёт файлы, добавленные через «Файлы» или из интернета. И «Посмотреть демоверсию» — осмотреться, ничего не подключая.':
    'A server is optional: the sign-in screen offers “Play music from this device” — the player picks up files added through Files or from the web. There is also “See the demo” to look around without connecting anything.',
  'Не подключается к серверу': 'It will not connect to the server',
  'Проверь адрес целиком, вместе с http:// или https:// и портом, например http://192.168.1.50:4533.':
    'Check the whole address, including http:// or https:// and the port, for example http://192.168.1.50:4533.',
  'Телефон и сервер должны быть в одной сети, если адрес внутренний.': 'The phone and the server must be on the same network if the address is a local one.',
  'Логин и пароль — те же, что на странице Navidrome в браузере.': 'The username and password are the same ones you use on the Navidrome page in a browser.',
  'Адреса без шифрования разрешены только для домашней сети: 192.168.x.x, 10.x.x.x и имена .local.':
    'Unencrypted addresses are allowed only on a home network: 192.168.x.x, 10.x.x.x and .local names.',
  'Нет текста песни': 'No lyrics',
  'Сначала текст берётся с твоего сервера. Если его там нет, включи «Искать тексты в LRCLIB» в настройках — это открытая база, туда уходят только название и исполнитель трека.':
    'Lyrics come from your server first. If it has none, switch on “Find lyrics on LRCLIB” in settings — it is an open database, and only the track title and artist are sent.',
  'Музыка не играет в фоне или пропадает звук': 'Music does not play in the background, or the sound drops',
  'Проверь, что приложению разрешены уведомления: без них система может остановить воспроизведение в фоне. Если трек не играет вовсе, попробуй другое качество потока в настройках — сервер мог не справиться с перекодированием.':
    'Check that notifications are allowed for the app: without them the system can stop background playback. If a track does not play at all, try a different stream quality in settings — the server may have failed to transcode it.',
  'Написать': 'Write in',
  'Опиши, что происходит, на каком устройстве и какая версия приложения (она написана в настройках). Ответ придёт на почту.':
    'Describe what happens, on which device, and which version of the app (it is written in settings). The reply comes by email.',
  'Русский': 'Русский',
  'Английский': 'English',
}

function detect(): Language {
  const fromUrl = new URLSearchParams(location.search).get('lang')
  if (fromUrl === 'ru' || fromUrl === 'en') return fromUrl
  try {
    const saved = localStorage.getItem('nocturne.lang')
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    // Приватное окно без доступа к хранилищу — не беда, решит язык браузера.
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export const language: Language = detect()
document.documentElement.lang = language

export function setLanguage(next: Language) {
  try {
    localStorage.setItem('nocturne.lang', next)
  } catch {
    // Не сохранилось — язык всё равно применится к этой странице.
  }
  const url = new URL(location.href)
  url.searchParams.set('lang', next)
  location.href = url.toString()
}

/** `t('Треков: {n}', { n })` — подстановки в фигурных скобках. */
/** Куски, которые на русском выглядят иначе, чем ключ: пример раскладки папок. */
const russian: Record<string, string> = {
  'ПРИМЕР_ПАПОК': `music/
  Кино/
    1988 — Группа крови/
      01 Группа крови.flac
      02 Закрой за мной дверь.flac`,
}

export function t(text: string, values?: Record<string, string | number>): string {
  const translated = language === 'en' ? (english[text] ?? text) : (russian[text] ?? text)
  if (!values) return translated
  return translated.replace(/\{(\w+)\}/g, (whole, key) => String(values[key] ?? whole))
}

/** Внутренние ссылки сохраняют язык независимо от настроек браузера и хранилища. */
export function localizePath(path: string): string {
  const url = new URL(path, location.origin)
  url.searchParams.set('lang', language)
  return url.pathname + url.search + url.hash
}

document.title = t(document.title)
for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:title"], meta[property="og:description"]')) {
  meta.content = t(meta.content)
}
