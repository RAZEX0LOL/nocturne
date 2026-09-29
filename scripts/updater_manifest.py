#!/usr/bin/env python3
"""Собирает latest.json для обновлялки Tauri из того, что лежит в папке сборки.

Приложение спрашивает один файл и само выбирает строку под свою систему, поэтому на сервере
достаточно статики: нужен nginx и папка, никакого приложения на стороне сервера.

Собрать все три системы на одной машине нельзя, поэтому файл дополняется, а не переписывается:
записи чужих систем берутся из того latest.json, что уже лежит на сервере.

    updater_manifest.py ВЕРСИЯ ПАПКА [АДРЕС_LATEST_JSON] [АРХИТЕКТУРА]
"""
import json
import platform
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Как называется архив обновления на каждой системе — по нему и определяется платформа.
ARCHIVES = {
    "darwin": lambda name: name.endswith(".app.tar.gz"),
    "linux": lambda name: name.endswith(".AppImage.tar.gz"),
    "windows": lambda name: name.endswith(".nsis.zip"),
}


def normalise(machine: str) -> str:
    """Тauri называет архитектуры по-своему: arm64 у него aarch64, amd64 — x86_64."""
    machine = machine.lower()
    if machine in ("arm64", "aarch64"):
        return "aarch64"
    if machine in ("x86_64", "amd64", "x64"):
        return "x86_64"
    return machine


def system() -> str:
    name = platform.system().lower()
    return "darwin" if name == "darwin" else "windows" if name == "windows" else "linux"


def existing(url: str) -> dict:
    """То, что уже лежит на сервере: записи других систем переносим как есть."""
    if not url:
        return {}
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            return json.loads(response.read()).get("platforms", {})
    except (urllib.error.URLError, ValueError, OSError):
        print(f"не удалось прочитать {url} — записи других систем не сохранятся", file=sys.stderr)
        return {}


def main(version: str, folder: str, base_url: str, machine: str) -> int:
    directory = Path(folder)
    base = base_url.rsplit("/", 1)[0] if base_url else ""
    matches = ARCHIVES[system()]
    archive = next((path for path in sorted(directory.iterdir()) if matches(path.name)), None)
    if archive is None:
        print("не нашлось архива обновления для этой системы", file=sys.stderr)
        return 1
    signature = archive.with_suffix(archive.suffix + ".sig")
    if not signature.exists():
        print(f"нет подписи для {archive.name}: задан ли ключ подписи?", file=sys.stderr)
        return 1

    platforms = existing(base_url)
    platforms[f"{system()}-{normalise(machine)}"] = {
        "signature": signature.read_text().strip(),
        "url": f"{base}/{archive.name}" if base else archive.name,
    }
    manifest = {
        "version": version,
        "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "platforms": platforms,
    }
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else "",
        sys.argv[4] if len(sys.argv) > 4 else platform.machine(),
    ))
