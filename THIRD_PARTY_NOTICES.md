# Сторонние компоненты / Third-party notices

Лицензия [PolyForm Noncommercial](LICENSE) распространяется на собственные материалы
Nocturne. Сторонние библиотеки, шрифты и инструменты сохраняют исходные лицензии,
включая разрешения на коммерческое использование. Запрет Nocturne не меняет их условия.

Third-party components retain their original licenses. Nocturne's noncommercial
restriction does not relicense those components or remove permissions they grant.

## Инвентаризация зависимостей

[docs/dependency-licenses.json](docs/dependency-licenses.json) содержит версии,
заявленные лицензии и ссылки на исходники npm, Rust и Android-компонентов на момент
подготовки репозитория. Список npm включает инструменты сборки, Rust — зависимости
из lock-файла для всех платформ и возможностей; не все они попадают в каждую сборку.
При обновлении зависимостей список нужно пересоздать и проверить новые условия.

- React и React DOM — MIT.
- Tauri и его плагины, многие Rust-компоненты — MIT / Apache-2.0 по условиям пакета.
- AndroidX, Compose, Media3, Kotlin, Coil, OkHttp — см. лицензии конкретных Maven-модулей.
- Lucide — ISC; сохраняются уведомления авторов проекта.
- Lightning CSS, cssparser, selectors, dtoa-short, option-ext — MPL-2.0.
  Исходники соответствующих версий доступны по ссылкам в инвентаризации. MPL-файлы
  сохраняют свою лицензию; изменения таких файлов нельзя выдавать за собственный
  код под PolyForm. Для распространения бинарников соблюдаются требования MPL
  о доступности соответствующего исходного кода.
- caniuse-lite — CC-BY-4.0; это данные инструмента сборки, права сохраняются за авторами
  Can I Use и Browserslist. [Исходники](https://github.com/browserslist/caniuse-lite).
- Gradle Wrapper — Apache-2.0. JAR и дистрибутив проверяются механизмами Gradle;
  исходники доступны в [gradle/gradle](https://github.com/gradle/gradle).

При упаковке стороннего кода сохраняйте его LICENSE / NOTICE и уведомления об авторстве.
Инвентаризация помогает найти их и не заменяет полные тексты лицензий пакетов.

## Manrope

Шрифты `site/public/fonts/manrope-*.woff2` — Manrope, SIL Open Font License 1.1.
Copyright 2018 The Manrope Project Authors.
[Исходники](https://github.com/googlefonts/manrope),
[полный текст OFL](site/public/fonts/OFL.txt). Этот текст распространяется вместе с сайтом.

## Системные элементы и демонстрационные материалы

SF Symbols и системные шрифты Apple / Microsoft загружаются из соответствующей ОС;
их самостоятельное распространение лицензией Nocturne не разрешается.
Название Navidrome и знаки платформ принадлежат их правообладателям; проект Nocturne
не заявляет официального партнёрства с ними.

Встроенные демонстрационные аудиопримеры и процедурные обложки — материалы проекта.
Скриншоты сайта создавались на демонстрационной медиатеке; персональная музыка
пользователей в репозиторий не включается.
