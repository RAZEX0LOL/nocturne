# Security policy / Сообщения об уязвимостях

Напиши приватно на [rasulhattaev715@gmail.com](mailto:rasulhattaev715@gmail.com?subject=Nocturne%20security)
с темой **Nocturne security**. Не открывай публичный Issue с действующими данными доступа.

Report vulnerabilities privately to the address above. Include the affected platform,
app version, reproduction steps, impact and a minimal proof of concept. Use a disposable
test account; never send real credentials or private music.

Удаляй из вложений пароли, приватные ключи, `Authorization`, cookies и параметры
`u`, `t`, `s`, `p` из URL Subsonic. Для примера используй тестовые значения.

Исправления выпускаются для актуальной версии. Исторические ветки и CI-артефакты
не являются поддерживаемыми релизами. Гарантированного SLA и денежных вознаграждений нет.

## Разработка

Секреты хранятся вне Git. Перед PR проверь историю ветки:

```sh
gitleaks git . --log-opts="--all --full-history" --redact=100
```

Точечное исключение в `.gitleaksignore` относится к проверенному публичному ключу
проверки обновлений Tauri и не разрешает хранить приватный ключ подписи.
Отчёты сканера и сетевые логи не публикуй без проверки содержимого.
