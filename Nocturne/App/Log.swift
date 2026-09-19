import Foundation
import os

/// Unified logging. Never log request URLs: they carry Subsonic auth tokens.
/// Levels: `.notice` for events worth reading later (persisted on device), `.error` for failures,
/// `.info` only for chatty diagnostics — iOS keeps `.info` in memory, not in the device log.
/// Read on a Mac: Console.app → device → filter `subsystem:app.nocturne.music`.
enum Log {
    static let player = Logger(subsystem: "app.nocturne.music", category: "player")
    static let library = Logger(subsystem: "app.nocturne.music", category: "library")

    /// Domain and code only — descriptions of URL errors can embed the failing URL.
    static func describe(_ error: Error?) -> String {
        guard let error else { return "none" }
        let ns = error as NSError
        return "\(ns.domain)#\(ns.code)"
    }
}
