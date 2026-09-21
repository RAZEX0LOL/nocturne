#!/usr/bin/env python3
"""Minimal Subsonic/Navidrome mock for simulator checks: 1 album, 3 short WAV tracks, PNG covers."""
import io, json, math, struct, sys, time, wave, zlib
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

TRACK_SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 8
FAIL_STREAMS = set()  # song ids whose stream returns 500 once (retry check)

def wav(freq, seconds=TRACK_SECONDS, rate=8000):
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
          "coverArt": "al-1", "duration": TRACK_SECONDS, "track": i + 1} for i in range(3)]
AUDIO = {s["id"]: wav(330 + 110 * i) for i, s in enumerate(SONGS)}
SONG_BY_ID = {s["id"]: s for s in SONGS}
PLAYLISTS = {}
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
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def ok(self, **payload):
        self.reply(json.dumps({"subsonic-response": {"status": "ok", "version": "1.16.1", **payload}}).encode())

    def do_GET(self):
        url = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(url.query).items()}
        endpoint = url.path.rsplit("/", 1)[-1].replace(".view", "")
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
            p = PLAYLISTS[q["id"]]; return self.ok(playlist={"id": q["id"], "name": p["name"], "entry": [SONG_BY_ID[i] for i in p["songs"]]})
        if endpoint == "createPlaylist":
            pid = f"pl{len(PLAYLISTS) + 1}"; PLAYLISTS[pid] = {"name": q["name"], "songs": parse_qs(url.query).get("songId", [])}; return self.ok()
        if endpoint == "updatePlaylist":
            p = PLAYLISTS[q["playlistId"]]; multi = parse_qs(url.query)
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
