#!/usr/bin/env python3
"""Проверка полного серверного сценария App Review без вывода пароля и подписанных URL."""
from pathlib import Path
import array
import hashlib
import json
import secrets
import subprocess
import urllib.parse
import urllib.request


def main():
    credentials = Path.home() / ".nocturne/review-server.env"
    config = dict(line.split("=", 1) for line in credentials.read_text().splitlines() if "=" in line)
    base = config["REVIEW_SERVER_URL"].rstrip("/")

    def fetch(endpoint, parameters=None, binary=False, byte_range=False):
        salt = secrets.token_hex(12)
        token = hashlib.md5((config["REVIEW_PASSWORD"] + salt).encode()).hexdigest()
        params = {"u": config["REVIEW_USERNAME"], "s": salt, "t": token,
                  "v": "1.16.1", "c": "NocturneReviewCheck", "f": "json", **(parameters or {})}
        query = urllib.parse.urlencode(params, doseq=True)
        request = urllib.request.Request(base + "/rest/" + endpoint + ".view?" + query,
                                         headers={"User-Agent": "Nocturne/81 CFNetwork Darwin", **({"Range": "bytes=0-4095"} if byte_range else {})})
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read()
            if binary:
                assert not response.headers.get("Content-Type", "").startswith("application/json"), endpoint
                assert len(body) > 1024 and body[4:8] == b"ftyp", endpoint
                return body, response.status
        result = json.loads(body)["subsonic-response"]
        assert result["status"] == "ok", endpoint + ": " + str(result.get("error", {}).get("code"))
        return result

    fetch("ping")
    print("HTTPS + signed login: PASS")
    albums = fetch("getAlbumList2", {"type": "alphabeticalByName", "size": 100})["albumList2"]["album"]
    assert len(albums) == 6
    songs = [song for album in albums for song in fetch("getAlbum", {"id": album["id"]})["album"]["song"]]
    assert len(songs) == 30
    assert fetch("search3", {"query": "First Light"})["searchResult3"]["song"]
    assert fetch("getArtists")["artists"]["index"]
    print("6 albums / 30 tracks + search + artists: PASS")
    song = songs[0]
    fetch("star", {"id": song["id"]})
    assert any(item["id"] == song["id"] for item in fetch("getStarred2")["starred2"].get("song", []))
    fetch("unstar", {"id": song["id"]})
    print("Favorites add/read/remove: PASS")
    playlist = fetch("createPlaylist", {"name": "Review verification " + secrets.token_hex(4), "songId": song["id"]})["playlist"]
    try:
        assert fetch("getPlaylist", {"id": playlist["id"]})["playlist"]["entry"][0]["id"] == song["id"]
        fetch("updatePlaylist", {"playlistId": playlist["id"], "songIdToAdd": songs[1]["id"]})
        assert fetch("getPlaylist", {"id": playlist["id"]})["playlist"]["songCount"] == 2
    finally:
        fetch("deletePlaylist", {"id": playlist["id"]})
    print("Playlist create/read/update/delete: PASS")
    for item in songs:
        body, _ = fetch("stream", {"id": item["id"], "format": "raw"}, binary=True)
        decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "s16le",
                                  "-acodec", "pcm_s16le", "pipe:1"], input=body,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
        samples = array.array("h", decoded)
        peak = max((abs(sample) for sample in samples), default=0)
        assert len(samples) > 22050 and peak > 100, f"Audio decode failed: {item['title']}, samples={len(samples)}, peak={peak}"
    _, status = fetch("stream", {"id": song["id"], "format": "raw"}, binary=True, byte_range=True)
    assert status == 206
    fetch("download", {"id": song["id"]}, binary=True)
    print("All 30 audio streams decoded to non-silent PCM + HTTP Range (206) + offline download: PASS")
    print("Review server: PASS")


if __name__ == "__main__":
    main()
