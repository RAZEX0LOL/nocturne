#!/usr/bin/env python3
"""Minimal Subsonic/Navidrome mock for simulator checks: 1 album, 3 short WAV tracks, PNG covers."""
import hashlib, io, json, math, os, struct, sys, time, wave, zlib
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

TRACK_SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 8
# Пароль, которым подписаны запросы: тестовый, для проверки алгоритма подписи.
PASSWORD = os.environ.get("NOCTURNE_MOCK_PASSWORD", "demo")
FAIL_STREAMS = set()  # song ids whose stream returns 500 once (retry check)

# 22 кГц, а не телефонные 8: WebKit пропускает 8-килогерцовый звук через Web Audio тишиной, и
# десктопная версия с эквалайзером казалась бы немой, хотя с настоящей музыкой всё в порядке.
def wav(freq, seconds=TRACK_SECONDS, rate=22050):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(int(seconds * rate))))
    return buf.getvalue()

def png(r, g, b, size=64):
    raw = b"".join(b"\x00" + bytes([r, g, b]) * size for _ in range(size))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

SONGS = [{"id": f"t{i}", "title": f"Тестовый трек {i + 1}", "artist": "Mock Artist", "album": "Mock Album",
          "albumId": "al-1", "artistId": "ar-1", "coverArt": "al-1", "duration": TRACK_SECONDS, "track": i + 1} for i in range(3)]
AUDIO = {s["id"]: wav(330 + 110 * i) for i, s in enumerate(SONGS)}
SONG_BY_ID = {s["id"]: s for s in SONGS}
PLAYLISTS = {}
RATINGS = {}
NATIVE_TOKEN = "mock-native-token"
PLAY_QUEUE = {}
STARRED = {"t0"}
ALBUM = {"id": "al-1", "name": "Mock Album", "artist": "Mock Artist", "artistId": "ar-1", "coverArt": "al-1", "songCount": 3, "year": 2026}
ARTIST = {"id": "ar-1", "name": "Mock Artist", "albumCount": 1, "coverArt": "al-1"}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def reply(self, body, ctype="application/json", status=200):
        self.send_response(status); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.cors(); self.end_headers(); self.wfile.write(body)

    def cors(self):
        # Веб-версия ходит сюда с другого порта (Vite), иначе браузер отклонит ответ.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    # Собственный API Navidrome (не Subsonic): вход по JSON и плейлисты с правилами умных.
    def native(self, method):
        url = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        if url.path == "/auth/login" and method == "POST":
            if body.get("password") != PASSWORD: return self.reply(b'{"error":"Invalid credentials"}', status=401)
            return self.reply(json.dumps({"id": "u1", "name": body.get("username"), "token": NATIVE_TOKEN}).encode())
        if self.headers.get("X-ND-Authorization") != f"Bearer {NATIVE_TOKEN}": return self.reply(b"{}", status=401)
        parts = url.path.rstrip("/").split("/")
        if url.path.rstrip("/") == "/api/playlist":
            if method == "GET":
                return self.reply(json.dumps([{"id": pid, "name": p["name"], "rules": p.get("rules")} for pid, p in PLAYLISTS.items()]).encode())
            if method == "POST":
                pid = f"pl{len(PLAYLISTS) + 1}"; PLAYLISTS[pid] = {"name": body["name"], "songs": [], "rules": body.get("rules")}
                return self.reply(json.dumps({"id": pid}).encode())
        if len(parts) == 4 and parts[2] == "playlist" and parts[3] in PLAYLISTS:
            p = PLAYLISTS[parts[3]]
            if method == "GET": return self.reply(json.dumps({"id": parts[3], "name": p["name"], "rules": p.get("rules")}).encode())
            if method == "PUT":
                p["name"] = body.get("name", p["name"]); p["rules"] = body.get("rules"); return self.reply(b"{}")
        return self.reply(b"{}", status=404)

    def do_POST(self): return self.native("POST")
    def do_PUT(self): return self.native("PUT")

    @staticmethod
    def smart_songs(rules):
        """Грубая сборка умного плейлиста: «в избранном» — избранные, иначе все; потом лимит."""
        conditions = (rules or {}).get("all") or (rules or {}).get("any") or []
        loved = any(c.get("is", {}).get("loved") is True for c in conditions)
        songs = [s for s in SONGS if s["id"] in STARRED] if loved else list(SONGS)
        return songs[: rules.get("limit") or len(songs)]

    def ok(self, **payload):
        self.reply(json.dumps({"subsonic-response": {"status": "ok", "version": "1.16.1", **payload}}).encode())

    def failed(self, code, message):
        # Subsonic отвечает кодом 200 даже на ошибку: важен status внутри тела.
        body = {"status": "failed", "version": "1.16.1", "error": {"code": code, "message": message}}
        self.reply(json.dumps({"subsonic-response": body}).encode())

    def signed(self, q):
        """Токен из пароля и соли — то же правило, что в shared/spec/api.md."""
        token, salt = q.get("t"), q.get("s")
        if not token or not salt:
            return False
        return token.lower() == hashlib.md5((PASSWORD + salt).encode()).hexdigest()

    def do_GET(self):
        url = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(url.query).items()}
        endpoint = url.path.rsplit("/", 1)[-1].replace(".view", "")
        # Интернет-радио — чужой поток без подписи Subsonic и без CORS, как у настоящих станций.
        if url.path.startswith("/api/"): return self.native("GET")
        if url.path == "/radio":
            data = next(iter(AUDIO.values()))
            self.send_response(200); self.send_header("Content-Type", "audio/wav"); self.send_header("Content-Length", str(len(data)))
            self.end_headers(); self.wfile.write(data); return
        # Подпись проверяется по-настоящему: иначе ошибку в алгоритме заметит только живой Navidrome.
        if not self.signed(q):
            print(time.strftime("%H:%M:%S"), endpoint, "неверная подпись", flush=True)
            return self.failed(40, "Wrong username or password.")
        extra = {k: q[k] for k in ("id", "query", "size", "format", "maxBitRate", "offset", "type", "submission", "name", "genre", "playlistId", "songIdToAdd", "songIndexToRemove") if k in q}
        print(time.strftime("%H:%M:%S"), endpoint, extra, "range=" + self.headers.get("Range", "-"), flush=True)
        if endpoint == "ping": return self.ok()
        if endpoint == "getAlbumList2": return self.ok(albumList2={"album": [] if q.get("offset", "0") != "0" else [ALBUM]})
        if endpoint == "getArtists": return self.ok(artists={"index": [{"name": "M", "artist": [ARTIST]}]})
        if endpoint == "getArtist": return self.ok(artist={**ARTIST, "album": [ALBUM]})
        if endpoint == "search3":
            # Поиск по подстроке без учёта регистра — как у Navidrome для простых запросов.
            needle = q.get("query", "").lower()
            match = lambda text: needle in (text or "").lower()
            return self.ok(searchResult3={
                "song": [s for s in SONGS if match(s["title"]) or match(s["artist"])],
                "album": [ALBUM] if match(ALBUM["name"]) or match(ALBUM["artist"]) else [],
                "artist": [ARTIST] if match(ARTIST["name"]) else [],
            })
        if endpoint == "getPlaylists":
            return self.ok(playlists={"playlist": [{"id": pid, "name": p["name"], "songCount": len(p["songs"]), "coverArt": "al-1"} for pid, p in PLAYLISTS.items()]})
        if endpoint == "getPlaylist":
            p = PLAYLISTS[q["id"]]
            entries = self.smart_songs(p["rules"]) if p.get("rules") else [SONG_BY_ID[i] for i in p["songs"]]
            return self.ok(playlist={"id": q["id"], "name": p["name"], "entry": entries})
        if endpoint == "createPlaylist":
            pid = f"pl{len(PLAYLISTS) + 1}"; PLAYLISTS[pid] = {"name": q["name"], "songs": parse_qs(url.query).get("songId", [])}; return self.ok()
        if endpoint == "updatePlaylist":
            p = PLAYLISTS[q["playlistId"]]; multi = parse_qs(url.query)
            if "name" in q: p["name"] = q["name"]
            for idx in sorted((int(i) for i in multi.get("songIndexToRemove", [])), reverse=True): p["songs"].pop(idx)
            p["songs"] += multi.get("songIdToAdd", []); return self.ok()
        if endpoint == "deletePlaylist": PLAYLISTS.pop(q["id"], None); return self.ok()
        if endpoint == "getStarred2": return self.ok(starred2={"song": [SONG_BY_ID[i] for i in STARRED], "album": [ALBUM]})
        if endpoint == "star": STARRED.add(q.get("id")) if "id" in q else None; return self.ok()
        if endpoint == "unstar": STARRED.discard(q.get("id")); return self.ok()
        if endpoint == "getGenres": return self.ok(genres={"genre": [{"value": "Ambient", "albumCount": 1, "songCount": 3}]})
        if endpoint == "getTopSongs": return self.ok(topSongs={"song": SONGS[::-1]})
        if endpoint == "getLyricsBySongId":
            return self.ok(lyricsList={"structuredLyrics": [{"lang": "rus", "synced": True, "line": [{"start": i * 5000, "value": f"Строка {i + 1}"} for i in range(8)]}]})
        if endpoint == "getAlbum": return self.ok(album={**ALBUM, "song": SONGS})
        if endpoint == "savePlayQueue":
            PLAY_QUEUE.update(ids=parse_qs(url.query).get("id", []), current=q.get("current"), position=int(q.get("position", 0)),
                              changed=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), changedBy=q.get("c", "")); return self.ok()
        if endpoint == "getPlayQueue":
            if not PLAY_QUEUE.get("ids"): return self.ok()
            return self.ok(playQueue={"entry": [SONG_BY_ID[i] for i in PLAY_QUEUE["ids"] if i in SONG_BY_ID], "current": PLAY_QUEUE["current"],
                                      "position": PLAY_QUEUE["position"], "changed": PLAY_QUEUE["changed"], "changedBy": PLAY_QUEUE["changedBy"], "username": "test"})
        if endpoint == "getSimilarSongs2": return self.ok(similarSongs2={"song": [x for x in SONGS if x["id"] != q.get("id")]})
        if endpoint == "getArtistInfo2":
            return self.ok(artistInfo2={"biography": "Mock Artist — вымышленный исполнитель для проверок. <a href=\"https://last.fm\">Read more on Last.fm</a>", "similarArtist": [{"id": "ar-2", "name": "Похожий исполнитель", "albumCount": 0}]})
        if endpoint == "getAlbumInfo2": return self.ok(albumInfo={"notes": "Альбом для проверок: три синусоиды разной частоты."})
        if endpoint == "getInternetRadioStations":
            return self.ok(internetRadioStations={"internetRadioStation": [{"id": "rd1", "name": "Тестовое радио", "streamUrl": "http://127.0.0.1:4533/radio"}]})
        if endpoint == "setRating": RATINGS[q.get("id")] = int(q.get("rating", 0)); return self.ok()
        if endpoint == "scrobble": return self.ok()
        if endpoint == "getCoverArt": return self.reply(png(140, 90, 200, min(int(q.get("size", 64)), 256)), "image/png")
        if endpoint == "stream":
            sid = q.get("id")
            if sid in FAIL_STREAMS:
                FAIL_STREAMS.discard(sid); return self.reply(b"fail", "text/plain", 500)
            data = AUDIO.get(sid)
            if data is None: return self.reply(b"", "text/plain", 404)
            rng = self.headers.get("Range")
            if rng:
                start, _, end = rng.replace("bytes=", "").partition("-")
                start = int(start); end = int(end) if end else len(data) - 1
                part = data[start:end + 1]
                self.send_response(206); self.send_header("Content-Type", "audio/wav"); self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}"); self.send_header("Content-Length", str(len(part)))
                self.cors(); self.end_headers(); self.wfile.write(part); return
            self.send_response(200); self.send_header("Content-Type", "audio/wav"); self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(len(data))); self.cors(); self.end_headers(); self.wfile.write(data); return
        self.ok()

ThreadingHTTPServer(("127.0.0.1", 4533), Handler).serve_forever()
