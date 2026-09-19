import CryptoKit
import ImageIO
import UIKit

/// Two-level cover cache: decoded images in memory, original bytes on disk (Caches, so iOS may purge it).
/// Keys contain the account, cover id and size bucket — never the request URL, which carries an auth token.
actor ArtworkCache {
    static let shared = ArtworkCache()
    static let diskLimit = 300 * 1024 * 1024

    nonisolated(unsafe) private static let memory: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 80 * 1024 * 1024
        return cache
    }()
    private let directory: URL
    private var inFlight: [String: Task<UIImage?, Never>] = [:]

    init() {
        directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("Artwork", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Server-side size requested for a view of `points`; buckets keep the number of variants small.
    nonisolated static func bucket(for points: CGFloat, scale: CGFloat) -> Int {
        let pixels = Int(points * scale)
        return [160, 320, 640].first { pixels <= $0 } ?? 1200
    }

    nonisolated static func key(account: String, id: String, bucket: Int) -> String { "\(account)|\(id)|\(bucket)" }

    /// Synchronous memory lookup so views can render a cached cover on their first frame.
    nonisolated static func memoryImage(_ key: String) -> UIImage? { memory.object(forKey: key as NSString) }

    func image(id: String, bucket: Int, client: NavidromeClient) async -> UIImage? {
        let key = Self.key(account: client.credentials.account, id: id, bucket: bucket)
        if let image = Self.memoryImage(key) { return image }
        if let running = inFlight[key] { return await running.value }
        let file = fileURL(for: key)
        let task = Task<UIImage?, Never> {
            if let data = try? Data(contentsOf: file), let image = Self.decode(data, maxPixels: bucket) {
                try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
                return image
            }
            guard let url = try? client.url("getCoverArt", parameters: ["id": id, "size": String(bucket)]),
                  let (data, response) = try? await client.session.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let image = Self.decode(data, maxPixels: bucket) else { return nil }
            try? data.write(to: file, options: .atomic)
            return image
        }
        inFlight[key] = task
        let image = await task.value
        inFlight[key] = nil
        if let image {
            Self.memory.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
        }
        return image
    }

    /// Artwork extracted from an on-device track's tags.
    func localImage(id: String, bucket: Int) -> UIImage? {
        let key = Self.key(account: "local", id: id, bucket: bucket)
        if let image = Self.memoryImage(key) { return image }
        guard let data = try? Data(contentsOf: LocalLibrary.artworkURL(for: id)), let image = Self.decode(data, maxPixels: bucket) else { return nil }
        Self.memory.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
        return image
    }

    func diskUsage() -> Int {
        files().reduce(0) { $0 + $1.size }
    }

    func clear() {
        Self.memory.removeAllObjects()
        for file in files() { try? FileManager.default.removeItem(at: file.url) }
    }

    /// Drops least recently used files until the cache fits `diskLimit`.
    func trim() {
        var total = diskUsage()
        guard total > Self.diskLimit else { return }
        for file in files().sorted(by: { $0.date < $1.date }) where total > Self.diskLimit {
            try? FileManager.default.removeItem(at: file.url)
            total -= file.size
        }
    }

    private func fileURL(for key: String) -> URL {
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(name)
    }

    private func files() -> [(url: URL, size: Int, date: Date)] {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys)) ?? []
        return urls.map { url in
            let values = try? url.resourceValues(forKeys: Set(keys))
            return (url, values?.fileSize ?? 0, values?.contentModificationDate ?? .distantPast)
        }
    }

    /// Decodes straight to the target size, so a 3000px cover never lands in memory at full resolution.
    nonisolated private static func decode(_ data: Data, maxPixels: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}
