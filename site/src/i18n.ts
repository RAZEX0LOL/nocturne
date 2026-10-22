/**
 * Язык сайта. Ключ — русская строка, как в самом приложении: исходный текст остаётся в коде
 * читаемым, а перевод лежит рядом одним списком.
 *
 * Язык берётся из адреса (`?lang=en`), затем из прошлого выбора, затем из языка браузера.
 * Выбор запоминается и подставляется в `<html lang>` — поисковикам и читалкам это важно.
 */

export type Language = 'ru' | 'en'

const english: Record<string, string> = {
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
  'Nocturne — плеер для своего сервера Navidrome. Красивый, быстрый и родной на каждой системе: начни слушать на компьютере и продолжи с того же места на телефоне.':
    'Nocturne is a player for your own Navidrome server. Beautiful, fast and native on every system: start listening on your computer and pick up at the same spot on your phone.',
  'Скачать для {name}': 'Download for {name}',
  'Установить через TestFlight': 'Install via TestFlight',
  'Все платформы': 'All platforms',
  'Бесплатно · без рекламы · без аккаунтов, кроме твоего сервера': 'Free · no ads · no accounts beyond your own server',
  'Nocturne на компьютере: альбом, полноэкранный плеер с текстом песни и светлая тема':
    'Nocturne on a computer: an album, the full-screen player with lyrics and the light theme',
  'Nocturne на Mac: полноэкранный плеер с синхронным текстом песни': 'Nocturne on Mac: the full-screen player with synced lyrics',
  'Nocturne на iPhone: плеер': 'Nocturne on iPhone: the player',

  // Возможности
  'Всё, что нужно от плеера — и ничего лишнего': 'Everything a player needs — and nothing more',
  'Nocturne подключается к Navidrome (и любому Subsonic-совместимому серверу) и превращает домашнюю медиатеку в музыкальный сервис, который принадлежит тебе.':
    'Nocturne connects to Navidrome (and any Subsonic-compatible server) and turns your home library into a music service that belongs to you.',
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
  'Открой образ и перетащи Nocturne в «Программы». Приложение подписано и проверено Apple — откроется без предупреждений.':
    'Open the image and drag Nocturne into Applications. The app is signed and notarized by Apple, so it opens without warnings.',
  'Скачать .dmg': 'Download .dmg',
  'Windows 10 и 11, x64': 'Windows 10 and 11, x64',
  'Если SmartScreen предупредит о новом приложении — «Подробнее» → «Выполнить в любом случае».':
    'If SmartScreen warns about an unrecognized app, choose “More info” → “Run anyway”.',
  'Скачать установщик': 'Download the installer',
  'Android 8 и новее': 'Android 8 and newer',
  'Открой скачанный файл и разреши установку из браузера — это нужно один раз.':
    'Open the downloaded file and allow installs from your browser — this is needed once.',
  'Скачать APK': 'Download APK',
  'iPhone и iPad': 'iPhone and iPad',
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
  'Navidrome — бесплатный сервер для своей музыкальной коллекции: ставится на домашний компьютер, NAS или VPS и раздаёт музыку по сети. Nocturne — плеер к нему. Подойдёт и любой другой сервер с API Subsonic.':
    'Navidrome is a free server for your own music collection: it runs on a home computer, a NAS or a VPS and serves the music over the network. Nocturne is a player for it. Any other server with the Subsonic API works too.',
  'Поставить за 10 минут': 'Set it up in 10 minutes',
  'Можно без сервера?': 'Can I use it without a server?',
  'Да. На компьютере и Android можно слушать свои файлы прямо с устройства — сервер не нужен. На iPhone есть демоверсия, чтобы посмотреть плеер.':
    'Yes. On a computer and on Android you can play files straight from the device — no server needed. On iPhone there is a demo library so you can look around.',
  'Как подключиться?': 'How do I connect?',
  'Открой приложение, введи адрес сервера, логин и пароль Navidrome. Пароль хранится в системном хранилище — Связке ключей, Keystore или менеджере учётных данных Windows.':
    'Open the app and enter the server address, your Navidrome username and password. The password is kept in the system store — Keychain, Keystore or Windows Credential Manager.',
  'Как приходят обновления?': 'How do updates arrive?',
  'Приложение само проверяет новую версию, скачивает её и ставит поверх — настройки, загрузки и вход остаются. На Android система один раз попросит разрешить установку из Nocturne. На iPhone обновления приходят через TestFlight.':
    'The app checks for a new version itself, downloads it and installs it over the old one — settings, downloads and the sign-in stay. On Android the system asks once to allow installs from Nocturne. On iPhone updates come through TestFlight.',
  'Почему Windows предупреждает при первом запуске?': 'Why does Windows warn me on first launch?',
  'Версия для Windows пока не подписана сертификатом Microsoft, поэтому SmartScreen её не знает. Нажми «Подробнее» → «Выполнить в любом случае» — это нужно один раз. Версия для Mac подписана и проверена Apple, там предупреждений нет.':
    'The Windows build is not signed with a Microsoft certificate yet, so SmartScreen does not know it. Choose “More info” → “Run anyway” — once is enough. The Mac build is signed and notarized by Apple, so there are no warnings there.',
  'Сколько стоит?': 'How much does it cost?',
  'Нисколько. Без рекламы, без подписок и без сбора данных: приложение общается только с твоим сервером (и с LRCLIB, если ты сам включишь поиск текстов).':
    'Nothing. No ads, no subscriptions and no data collection: the app talks only to your server (and to LRCLIB, if you turn lyrics search on yourself).',

  // Подвал
  'Nocturne — плеер для Navidrome': 'Nocturne — a player for Navidrome',
  'Сделано для своей музыки · {year}': 'Made for your own music · {year}',

  // Страница «С чего начать»
  'Свой музыкальный сервер за 10 минут': 'Your own music server in 10 minutes',
  'Nocturne — это плеер, а музыка живёт на твоём сервере Navidrome: на домашнем компьютере, NAS или VPS. Ставится он одной командой. Ниже — весь путь от пустой папки до музыки в телефоне.':
    'Nocturne is the player; the music lives on your own Navidrome server — a home computer, a NAS or a VPS. It installs with one command. Below is the whole path from an empty folder to music on your phone.',
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
  '— Navidrome попросит придумать логин и пароль администратора. Их же ты введёшь в Nocturne. Первое сканирование большой коллекции занимает несколько минут.':
    '— Navidrome will ask you to create an admin username and password. Those are what you enter in Nocturne. The first scan of a large collection takes a few minutes.',
  'Подключи Nocturne': 'Connect Nocturne',
  'Скачай приложение': 'Download the app',
  'для своей системы и введи три поля: адрес сервера, логин и пароль.': 'for your system and fill in three fields: server address, username and password.',
  'Если плеер на том же компьютере, адрес —': 'If the player runs on the same computer, the address is',
  '. Если на другом устройстве в той же сети — адрес этого компьютера в сети, например': '. On another device in the same network, use that computer’s address, for example',
  '. Пароль хранится в системном хранилище устройства, а не в файле.': '. The password is kept in the device’s system store, not in a file.',
  'Слушай вне дома': 'Listen away from home',
  'Пока сервер доступен только из домашней сети. Чтобы музыка играла и в дороге, есть три пути — от простого к надёжному:':
    'For now the server is reachable only from your home network. There are three ways to take the music with you, from simplest to sturdiest:',
  'Скачать заранее.': 'Download in advance.',
  'Ничего настраивать не нужно: отметь альбомы и плейлисты в Nocturne — они будут играть без сети.':
    'Nothing to set up: mark albums and playlists in Nocturne and they play without a network.',
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
  'Скачать Nocturne': 'Download Nocturne',
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
