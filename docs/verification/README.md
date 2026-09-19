# Проверка Nocturne — 18 сентября 2026

Среда: Xcode 27.0, Swift 6.4, iPhone 17 Pro Simulator / iOS 26.4.

## Core

```sh
swift test
```

```text
Executed 9 tests, with 0 failures (0 unexpected)
Test Suite 'All tests' passed
```

Полный вывод: `core-tests.txt`.

## Сборка

```sh
xcodebuild -project Nocturne.xcodeproj -scheme Nocturne \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

```text
** BUILD SUCCEEDED **
```

Вывод: `build.txt`. Финальное изменение расчёта размеров обложек также скомпилировано в последующих UI-прогонах.

## UI

```sh
xcodebuild -project Nocturne.xcodeproj -scheme Nocturne \
  -destination 'platform=iOS Simulator,id=F4587F25-5387-4C65-907A-202891369EA6' \
  -derivedDataPath build -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test
```

Первый прогон: оба UI-теста прошли. После исправления предупреждения об отрицательном размере при первом layout экран подключения снова прошёл, но тест навигации один раз не переключил вкладку. В тест добавлено ожидание подтверждения выбранной вкладки с одной повторной попыткой; проверки содержимого экранов сохранены.

Последний результат проверки подключения:

```text
Test Case 'testConnectionScreen' passed (30.395 seconds).
```

Повторная проверка навигации после уточнения ожиданий:

```sh
xcodebuild -project Nocturne.xcodeproj -scheme Nocturne \
  -destination 'platform=iOS Simulator,id=F4587F25-5387-4C65-907A-202891369EA6' \
  -derivedDataPath build -parallel-testing-enabled NO \
  -only-testing:NocturneUITests/NocturneUITests/testDemoNavigationAndSearch \
  CODE_SIGNING_ALLOWED=NO test
```

```text
Executed 1 test, with 0 failures (0 unexpected)
** TEST SUCCEEDED **
```

На последнем прогоне обе вкладки выбраны с первого нажатия; предупреждение `Invalid frame dimension` отсутствует.

Логи: `navigation-test.txt`, `ui-tests-before-navigation-retry.txt` (сохранён и промежуточный неудачный прогон).

## Визуальная проверка

Приложение установлено и запущено в симуляторе. Главная проверена по скриншоту `../home-simulator.png`: текст, карточки и панель вкладок не выходят за границы. UI-тесты дополнительно проверили экран подключения, альбом, сообщение деморежима и поиск. Снимок поиска сохранён во вложениях xcresult в `build/Logs/Test/`.

## Ещё не проверено

Реальные учётные данные и сервер не предоставлялись. Авторизация на конкретном Navidrome, транскодирование, воспроизведение реального аудио, фон, аппаратные наушники, AirPlay и экран блокировки требуют проверки на сервере пользователя и физическом iPhone. Подписание и публикация не выполнялись. Android-приложение — следующий этап.
