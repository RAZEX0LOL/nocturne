#!/usr/bin/env python3
"""Манифест обновления Tauri для одной системы: darwin-aarch64.json, windows-x86_64.json, …

У каждой системы свой файл и своя версия. Общий latest.json с одной версией на всех ломался:
выложили Mac-сборку N — и Windows, у которой запись ещё на старый установщик, видела «версию N»,
ставила старый файл и предлагала обновиться снова, по кругу. Приложение спрашивает свой файл
по адресу с {{target}}-{{arch}} (tauri.conf.json → plugins.updater.endpoints).

    updater_manifest.py ВЕРСИЯ ПАПКА БАЗОВЫЙ_АДРЕС СИСТЕМА АРХИТЕКТУРА
    → печатает имя файла манифеста и кладёт его в ПАПКУ
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

# Как называется файл обновления на каждой системе. Tauri 2 подписывает сами установщики.
ARCHIVES = {
    "darwin": lambda name: name.endswith(".app.tar.gz"),
    "linux": lambda name: name.endswith(".AppImage"),
    "windows": lambda name: name.endswith("-setup.exe"),
}


def normalise(machine: str) -> str:
    """Tauri называет архитектуры по-своему: arm64 у него aarch64, amd64 — x86_64."""
    machine = machine.lower()
    if machine in ("arm64", "aarch64"):
        return "aarch64"
    if machine in ("x86_64", "amd64", "x64"):
        return "x86_64"
    return machine


def main(version: str, folder: str, base: str, system: str, machine: str) -> int:
    directory = Path(folder)
    matches = ARCHIVES[system]
    # Только файл с версией в имени: рядом лежат копии с постоянными именами для сайта
    # (Nocturne-windows-setup.exe), и подписи у них нет.
    archive = next((path for path in sorted(directory.iterdir()) if matches(path.name) and f"_{version}_" in path.name), None)
    if archive is None:
        print(f"не нашлось файла обновления для {system}", file=sys.stderr)
        return 1
    signature = archive.with_suffix(archive.suffix + ".sig")
    if not signature.exists():
        print(f"нет подписи для {archive.name}: задан ли ключ подписи?", file=sys.stderr)
        return 1
    target = f"{system}-{normalise(machine)}"
    manifest = {
        "version": version,
        "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        # В имени файла версия: старый установщик на сервере не подменяется новым под тем же именем,
        # и скачавший его в момент публикации получит целый файл.
        "url": f"{base.rstrip('/')}/{quote(archive.name)}",
        "signature": signature.read_text().strip(),
    }
    # Пункты чейнджлога (scripts/changelog.ts notes) — приложение показывает их в плашке обновления.
    if os.environ.get("NOTES"):
        manifest["notes"] = os.environ["NOTES"]
    (directory / f"{target}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"{target}.json")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 6:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(*sys.argv[1:]))
