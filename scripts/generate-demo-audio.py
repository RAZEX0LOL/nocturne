#!/usr/bin/env python3
"""Оригинальные инструментальные примеры: без внешнего сервера и чужих фонограмм."""
import array
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parent.parent
RATE = 22050
DURATION = 24


def render(variant: int) -> array.array:
    samples = array.array("h")
    roots = [48, 53, 45, 55]
    pattern = [0, 2, 1, 3, 2, 1, 3, 1]
    transpose = [0, 2, -2, 5, -5][variant]
    for frame in range(RATE * DURATION):
        t = frame / RATE
        beat = t / 0.75
        chord = [roots[(int(beat) // 4 + variant) % 4] + transpose + n for n in (0, 4, 7, 12)]
        step = int(beat * 2)
        note = chord[pattern[(step + variant) % len(pattern)]] + 12
        age = (beat * 2 - step) * 0.375
        frequency = 440 * 2 ** ((note - 69) / 12)
        attack = min(age / 0.012, 1)
        melody = attack * math.exp(-age * 7) * (math.sin(2 * math.pi * frequency * t)
                  + 0.2 * math.sin(4 * math.pi * frequency * t))
        pad = sum(math.sin(2 * math.pi * 440 * 2 ** ((n - 69) / 12) * t) for n in chord) / 4
        bass = math.sin(2 * math.pi * 440 * 2 ** ((chord[0] - 12 - 69) / 12) * t)
        fade = min(t / 0.15, 1, (DURATION - t) / 0.7)
        samples.append(round(22000 * fade * (0.45 * melody + 0.2 * pad + 0.15 * bass)))
    return samples


def main() -> None:
    assets = ROOT / "Nocturne/Resources/Assets.xcassets"
    with tempfile.TemporaryDirectory(prefix="nocturne-demo-") as temporary:
        for variant in range(5):
            folder = assets / f"DemoAudio{variant}.dataset"
            folder.mkdir(exist_ok=True)
            source = Path(temporary) / f"{variant}.wav"
            with wave.open(str(source), "wb") as audio:
                audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
                audio.writeframes(render(variant).tobytes())
            target = folder / "sample.m4a"
            # AAC воспроизводится системным AVPlayer на iPhone, iPad и Mac Catalyst.
            subprocess.run(["afconvert", str(source), str(target), "-f", "m4af", "-d", "aac", "-b", "64000"], check=True)
            if variant == 4:
                # Ненулевой ID, отличный от 1, проверяет подготовку микса по реальной дорожке.
                remuxed = Path(temporary) / "track-seven.m4a"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(target), "-map", "0:a",
                                "-c", "copy", "-streamid", "0:7", "-use_stream_ids_as_track_ids", "1",
                                str(remuxed)], check=True)
                target.write_bytes(remuxed.read_bytes())
            (folder / "Contents.json").write_text(json.dumps({
                "data": [{"filename": "sample.m4a", "idiom": "universal"}],
                "info": {"author": "xcode", "version": 1},
            }, indent=2) + "\n")
            print(f"{target.relative_to(ROOT)}: {target.stat().st_size} bytes, {DURATION}s")


if __name__ == "__main__":
    main()
