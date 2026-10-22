#!/usr/bin/env python3
"""Витрина для скриншотов сайта: Subsonic-сервер с демомедиатекой Nocturne.

Те же альбомы, что в демоверсии iPhone и Android, обложки-пейзажи рисуются Pillow,
у треков синхронный текст и тихий звук нужной длины — плеер выглядит как с настоящей музыкой.
Подпись запросов не проверяется: это не тест, а декорации. Порт 4533, как у тестового мока.

    <python с Pillow> site/tools/showcase_server.py
"""
import io, json, math, os, random, struct, wave
from array import array
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from PIL import Image, ImageDraw, ImageFilter

# NOCTURNE_SHOWCASE_LANG=en — те же альбомы по-английски, для англоязычных скриншотов.
ENGLISH = os.environ.get("NOCTURNE_SHOWCASE_LANG", "ru") == "en"

ALBUMS_RU = [
    ("Параллели", "Свет внутри", 2025, (0x95, 0x64, 0x7E)),
    ("Тихие дни", "Корали", 2024, (0xC8, 0xAB, 0x78)),
    ("Где-то дальше", "Монолит", 2025, (0x7F, 0xA9, 0xB8)),
    ("Поздний июль", "Небо рядом", 2024, (0xA6, 0x6B, 0x83)),
    ("Afterglow", "North Coast", 2025, (0x78, 0x61, 0x9C)),
    ("Сны на повторе", "Каменные реки", 2023, (0x58, 0x92, 0x8A)),
]
ALBUMS_EN = [
    ("Parallels", "Inner Light", 2025, (0x95, 0x64, 0x7E)),
    ("Quiet Days", "Corali", 2024, (0xC8, 0xAB, 0x78)),
    ("Somewhere Further", "Monolith", 2025, (0x7F, 0xA9, 0xB8)),
    ("Late July", "Sky Nearby", 2024, (0xA6, 0x6B, 0x83)),
    ("Afterglow", "North Coast", 2025, (0x78, 0x61, 0x9C)),
    ("Dreams on Repeat", "Stone Rivers", 2023, (0x58, 0x92, 0x8A)),
]
ALBUMS = ALBUMS_EN if ENGLISH else ALBUMS_RU
TITLES = (["First Light", "Between Us", "Silence", "Afterglow", "To Stay", "Far Shore", "Neon", "Night Train"] if ENGLISH
          else ["Первый свет", "Между нами", "Тишина", "Afterglow", "Остаться", "Дальний берег", "Неон", "Ночной поезд"])
LYRICS_EN = [
    "The city fades outside the window", "And we are left, the two of us", "Someone writes to us at night",
    "You stay silent — so do I", "The light comes from far away", "Through our hands, through centuries",
    "And if the sky should ever fall", "It will not let us down", "The city fades outside the window", "We stay — and we sing",
]
LYRICS_RU = [
    "Город гаснет за окном", "И остаёмся мы вдвоём", "Кто-то пишет нам в ночи",
    "Ты молчишь — и я молчи", "Свет идёт издалека", "Сквозь ладони, сквозь века",
    "Если небо упадёт", "Нас оно не подведёт", "Город гаснет за окном", "Мы остаёмся — и поём",
]
LYRICS = LYRICS_EN if ENGLISH else LYRICS_RU

albums, songs, artists = [], [], {}
for index, (name, artist, year, color) in enumerate(ALBUMS):
    album_id, artist_id = f"al{index}", f"ar{index}"
    tracks = [{"id": f"al{index}-{n}", "title": TITLES[(n + index) % len(TITLES)], "artist": artist, "album": name,
               "albumId": album_id, "artistId": artist_id, "coverArt": album_id, "duration": 196 + (n * 23 + index * 11) % 90,
               "track": n + 1, "year": year, "genre": ["Indie", "Ambient", "Synthpop"][index % 3], "suffix": "flac", "bitRate": 1411}
              for n in range(6 + index % 3)]
    songs += tracks
    albums.append({"id": album_id, "name": name, "artist": artist, "artistId": artist_id, "coverArt": album_id,
                   "songCount": len(tracks), "duration": sum(t["duration"] for t in tracks), "year": year,
                   "genre": tracks[0]["genre"], "song": tracks})
    artists[artist_id] = {"id": artist_id, "name": artist, "albumCount": 1, "coverArt": album_id}
SONG = {s["id"]: s for s in songs}
STARRED = {"al0-1", "al1-0", "al4-2", "al2-3", "al5-1"}
PLAYLISTS = ({"pl1": ("Evening", ["al0-0", "al1-2", "al4-1", "al3-0", "al5-2"]), "pl2": ("On the Road", ["al2-0", "al2-1", "al4-3", "al0-4"])} if ENGLISH
             else {"pl1": ("Вечер", ["al0-0", "al1-2", "al4-1", "al3-0", "al5-2"]), "pl2": ("В дорогу", ["al2-0", "al2-1", "al4-3", "al0-4"])})


def cover(index, size=600):
    """Пейзаж как у демоверсии: небо цвета альбома, солнце и четыре слоя холмов."""
    top, bottom = ALBUMS[index][3], (0x14, 0x23, 0x38)
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / size
        draw.line([(0, y), (size, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    sun = size * 0.085
    draw.ellipse([size * 0.72 - sun, size * 0.28 - sun, size * 0.72 + sun, size * 0.28 + sun], fill=(0xE3, 0xC7, 0xA0))
    for layer in range(4):
        points = [(0, size)]
        for step in range(49):
            x = step / 48 * size
            y = size * (0.55 + layer * 0.12 + math.sin(step * 0.14 + (index + layer) * 1.8) * 0.1)
            points.append((x, y))
        points.append((size, size))
        alpha = 0.35 + layer * 0.16
        overlay = Image.new("RGB", (size, size), bottom)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).polygon(points, fill=int(255 * alpha))
        image.paste(overlay, (0, 0), mask)
    return image.filter(ImageFilter.SMOOTH)


COVERS = {f"al{i}": cover(i) for i in range(len(ALBUMS))}
ART = {}
AUDIO = {}


def cover_png(album_id, size):
    key = (album_id, size)
    if key not in ART:
        buffer = io.BytesIO()
        COVERS.get(album_id, COVERS["al0"]).resize((size, size), Image.LANCZOS).save(buffer, "PNG")
        ART[key] = buffer.getvalue()
    return ART[key]


def audio(song_id):
    """Тихий аккорд с медленным «дыханием» — длиной ровно в трек."""
    if song_id not in AUDIO:
        rate, seconds = 16000, SONG[song_id]["duration"]
        rng = random.Random(song_id)
        base = rng.choice([220, 246.9, 261.6, 293.7])
        chord = [base, base * 1.26, base * 1.5]
        samples = array("h", (int(2200 * (1 + 0.3 * math.sin(i / rate * 0.6)) *
                                  sum(math.sin(2 * math.pi * f * i / rate) for f in chord) / 3)
                              for i in range(int(seconds * rate))))
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(samples.tobytes())
        AUDIO[song_id] = buffer.getvalue()
    return AUDIO[song_id]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")

    def reply(self, body, ctype="application/json", status=200):
        self.send_response(status); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.cors(); self.end_headers(); self.wfile.write(body)

    def ok(self, **payload):
        self.reply(json.dumps({"subsonic-response": {"status": "ok", "version": "1.16.1", "type": "navidrome",
                                                     "serverVersion": "0.58.0", "openSubsonic": True, **payload}}).encode())

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def do_POST(self): self.reply(b"{}", status=404)

    def do_GET(self):
        url = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(url.query).items()}
        endpoint = url.path.rsplit("/", 1)[-1].replace(".view", "")
        plain = lambda album: {k: v for k, v in album.items() if k != "song"}
        if endpoint == "getAlbumList2":
            kind = q.get("type", "newest")
            order = {"newest": albums, "recent": albums[2:] + albums[:2], "frequent": albums[3:] + albums[:3],
                     "random": random.sample(albums, len(albums))}.get(kind, albums)
            return self.ok(albumList2={"album": [] if q.get("offset", "0") != "0" else [plain(a) for a in order]})
        if endpoint == "getAlbum": return self.ok(album=next(a for a in albums if a["id"] == q.get("id")))
        if endpoint == "getArtists": return self.ok(artists={"index": [{"name": a["name"][0], "artist": [a]} for a in artists.values()]})
        if endpoint == "getArtist":
            artist = artists[q["id"]]
            return self.ok(artist={**artist, "album": [plain(a) for a in albums if a["artistId"] == q["id"]]})
        if endpoint == "getStarred2":
            return self.ok(starred2={"song": [SONG[i] for i in STARRED], "album": [plain(albums[0]), plain(albums[4])]})
        if endpoint == "search3":
            needle = q.get("query", "").lower().strip('"')
            hit = lambda text: needle in text.lower()
            return self.ok(searchResult3={"song": [s for s in songs if hit(s["title"]) or hit(s["artist"])][:20],
                                          "album": [plain(a) for a in albums if hit(a["name"]) or hit(a["artist"])],
                                          "artist": [a for a in artists.values() if hit(a["name"])]})
        if endpoint == "getPlaylists":
            return self.ok(playlists={"playlist": [{"id": pid, "name": name, "songCount": len(ids), "coverArt": SONG[ids[0]]["coverArt"],
                                                    "duration": sum(SONG[i]["duration"] for i in ids)} for pid, (name, ids) in PLAYLISTS.items()]})
        if endpoint == "getPlaylist":
            name, ids = PLAYLISTS[q["id"]]
            return self.ok(playlist={"id": q["id"], "name": name, "entry": [SONG[i] for i in ids]})
        if endpoint == "getGenres":
            return self.ok(genres={"genre": [{"value": g, "albumCount": 2, "songCount": 14} for g in ("Indie", "Ambient", "Synthpop")]})
        if endpoint in ("getTopSongs", "getRandomSongs"): return self.ok(**{"topSongs" if endpoint == "getTopSongs" else "randomSongs": {"song": songs[:10]}})
        if endpoint == "getSimilarSongs2": return self.ok(similarSongs2={"song": [s for s in songs if s["id"] != q.get("id")][:20]})
        if endpoint == "getLyricsBySongId":
            return self.ok(lyricsList={"structuredLyrics": [{"lang": "rus", "synced": True,
                                                             "line": [{"start": 2000 + i * 4500, "value": line} for i, line in enumerate(LYRICS)]}]})
        if endpoint == "getArtistInfo2":
            return self.ok(artistInfo2={"biography": ("A fictional artist from the Nocturne demo library." if ENGLISH else "Вымышленный исполнитель из демомедиатеки Nocturne."), "similarArtist": list(artists.values())[:3]})
        if endpoint == "getAlbumInfo2": return self.ok(albumInfo={"notes": ("An album from the Nocturne demo library." if ENGLISH else "Альбом из демомедиатеки Nocturne.")})
        if endpoint == "getInternetRadioStations":
            return self.ok(internetRadioStations={"internetRadioStation": [{"id": "rd1", "name": ("Night Radio" if ENGLISH else "Ночное радио"), "streamUrl": "http://127.0.0.1:4533/radio"}]})
        if endpoint == "getCoverArt": return self.reply(cover_png(q.get("id", "al0"), max(32, min(int(q.get("size", 600)), 1200))), "image/png")
        if endpoint == "stream":
            data = audio(q["id"]) if q.get("id") in SONG else b""
            if not data: return self.reply(b"", "text/plain", 404)
            rng = self.headers.get("Range")
            start, end = 0, len(data) - 1
            if rng:
                a, _, b = rng.replace("bytes=", "").partition("-")
                start, end = int(a), int(b) if b else len(data) - 1
            part = data[start:end + 1]
            self.send_response(206 if rng else 200); self.send_header("Content-Type", "audio/wav"); self.send_header("Accept-Ranges", "bytes")
            if rng: self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
            self.send_header("Content-Length", str(len(part))); self.cors(); self.end_headers(); self.wfile.write(part); return
        self.ok()


if __name__ == "__main__":
    print("showcase on http://127.0.0.1:4533", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 4533), Handler).serve_forever()
