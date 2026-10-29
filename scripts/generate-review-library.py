#!/usr/bin/env python3
"""Медиатека тестового Navidrome из оригинальных встроенных фонограмм."""
from pathlib import Path
import argparse
import subprocess

ROOT = Path(__file__).resolve().parent.parent
ALBUMS = [
    ("Parallels", "Inner Light"), ("Quiet Days", "Coralie"),
    ("Further Away", "Monolith"), ("Late July", "Nearby Sky"),
    ("Afterglow", "North Coast"), ("Dreams on Repeat", "Stone Rivers"),
]
TITLES = ["First Light", "Between Us", "Silence", "Afterglow", "Stay"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    for index, (album, artist) in enumerate(ALBUMS):
        folder = args.destination / artist / album
        folder.mkdir(parents=True, exist_ok=True)
        for track, title in enumerate(TITLES):
            source = ROOT / f"Nocturne/Resources/Assets.xcassets/DemoAudio{track}.dataset/sample.m4a"
            destination = folder / f"{track + 1:02d} {title}.m4a"
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-i", str(source), "-c", "copy", "-movflags", "+faststart",
                "-metadata", f"title={title}", "-metadata", f"artist={artist}",
                "-metadata", f"album_artist={artist}", "-metadata", f"album={album}",
                "-metadata", f"track={track + 1}/5", "-metadata", f"date={2025 - index % 3}",
                "-metadata", "genre=Electronic", "-metadata",
                "comment=Original instrumental sample created for the Nocturne demo. No third-party recordings.",
                str(destination),
            ], check=True)
        print(f"{artist} / {album}: 5 tracks")


if __name__ == "__main__":
    main()
