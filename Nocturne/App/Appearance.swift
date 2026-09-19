import SwiftUI
import UIKit

/// User-facing look & feel settings. Views read them through `Theme`, so Observation re-renders
/// everything that depends on a colour when a setting (or the current cover) changes.
@MainActor @Observable
final class Appearance {
    static let shared = Appearance()

    enum ThemeMode: String, CaseIterable, Identifiable {
        case dark, oled, light, system
        var id: String { rawValue }
        var title: String {
            switch self {
            case .dark: String(localized: "Тёмная")
            case .oled: String(localized: "Чёрная (OLED)")
            case .light: String(localized: "Светлая")
            case .system: String(localized: "Как в системе")
            }
        }
    }

    enum AccentChoice: String, CaseIterable, Identifiable {
        case cover, lavender, mint, coral, amber, sky, rose, lime
        var id: String { rawValue }
        var title: String {
            switch self {
            case .cover: String(localized: "Из обложки")
            case .lavender: String(localized: "Лаванда")
            case .mint: String(localized: "Мята")
            case .coral: String(localized: "Коралл")
            case .amber: String(localized: "Янтарь")
            case .sky: String(localized: "Небо")
            case .rose: String(localized: "Роза")
            case .lime: String(localized: "Лайм")
            }
        }
        /// Hue/saturation of the preset; brightness is adapted to the colour scheme in `Theme`.
        var hsb: (hue: CGFloat, saturation: CGFloat) {
            switch self {
            case .cover, .lavender: (0.72, 0.34)
            case .mint: (0.44, 0.45)
            case .coral: (0.03, 0.52)
            case .amber: (0.11, 0.62)
            case .sky: (0.57, 0.48)
            case .rose: (0.93, 0.42)
            case .lime: (0.22, 0.55)
            }
        }
    }

    enum PlayerBackground: String, CaseIterable, Identifiable {
        case blur, gradient, solid
        var id: String { rawValue }
        var title: String {
            switch self {
            case .blur: String(localized: "Размытая обложка")
            case .gradient: String(localized: "Градиент")
            case .solid: String(localized: "Однотонный")
            }
        }
    }

    enum MiniButton: String, CaseIterable, Identifiable {
        case next, forward15
        var id: String { rawValue }
        var title: String { self == .next ? String(localized: "Следующий трек") : String(localized: "Вперёд на 15 с") }
    }

    enum HomeSection: String, CaseIterable, Identifiable, Codable {
        case recentlyPlayed, recentlyAdded, starredSongs, frequent, favoriteAlbums, discover
        var id: String { rawValue }
        var title: String {
            switch self {
            case .recentlyPlayed: String(localized: "Недавно слушал")
            case .recentlyAdded: String(localized: "Недавно добавлено")
            case .starredSongs: String(localized: "Любимые треки")
            case .frequent: String(localized: "Часто слушаю")
            case .favoriteAlbums: String(localized: "Любимые альбомы")
            case .discover: String(localized: "Случайные альбомы")
            }
        }
    }

    var theme: ThemeMode { didSet { store(theme.rawValue, "theme") } }
    var accent: AccentChoice { didSet { store(accent.rawValue, "accent") } }
    var playerBackground: PlayerBackground { didSet { store(playerBackground.rawValue, "playerBackground") } }
    var miniButton: MiniButton { didSet { store(miniButton.rawValue, "miniButton") } }
    var libraryGrid: Bool { didSet { store(libraryGrid, "libraryGrid") } }
    var lyricsScale: Double { didSet { store(lyricsScale, "lyricsScale") } }
    var haptics: Bool { didSet { store(haptics, "haptics") } }
    var animateCover: Bool { didSet { store(animateCover, "animateCover") } }
    var coverSwipe: Bool { didSet { store(coverSwipe, "coverSwipe") } }
    var homeOrder: [HomeSection] { didSet { store(homeOrder.map(\.rawValue), "homeOrder") } }
    var hiddenHome: Set<HomeSection> { didSet { store(hiddenHome.map(\.rawValue), "hiddenHome") } }
    /// Dominant vivid colour of the current cover; drives the "from cover" accent and the gradient background.
    var coverColor: UIColor?

    var colorScheme: ColorScheme? {
        switch theme {
        case .light: .light
        case .system: nil
        case .dark, .oled: .dark
        }
    }

    var visibleHome: [HomeSection] { homeOrder.filter { !hiddenHome.contains($0) } }

    private init() {
        let defaults = UserDefaults.standard
        theme = Self.stored("theme", ThemeMode.dark)
        accent = Self.stored("accent", AccentChoice.cover)
        playerBackground = Self.stored("playerBackground", PlayerBackground.blur)
        miniButton = Self.stored("miniButton", MiniButton.next)
        libraryGrid = defaults.bool(forKey: "appearance.libraryGrid")
        lyricsScale = defaults.object(forKey: "appearance.lyricsScale") as? Double ?? 1
        haptics = defaults.object(forKey: "appearance.haptics") as? Bool ?? true
        animateCover = defaults.object(forKey: "appearance.animateCover") as? Bool ?? true
        coverSwipe = defaults.object(forKey: "appearance.coverSwipe") as? Bool ?? true
        let saved = (defaults.stringArray(forKey: "appearance.homeOrder") ?? []).compactMap(HomeSection.init)
        // Sections added in later versions go to the end of a saved order.
        homeOrder = saved + HomeSection.allCases.filter { !saved.contains($0) }
        hiddenHome = Set((defaults.stringArray(forKey: "appearance.hiddenHome") ?? []).compactMap(HomeSection.init))
    }

    private nonisolated static func stored<T: RawRepresentable & Sendable>(_ key: String, _ fallback: T) -> T where T.RawValue == String {
        guard let raw = UserDefaults.standard.string(forKey: "appearance." + key), let value = T(rawValue: raw) else { return fallback }
        return value
    }

    func resetHome() { homeOrder = HomeSection.allCases; hiddenHome = [] }

    private func store(_ value: Any, _ key: String) { UserDefaults.standard.set(value, forKey: "appearance." + key) }
}

@MainActor
enum Theme {
    private static var appearance: Appearance { Appearance.shared }
    private static var isOLED: Bool { appearance.theme == .oled }

    static var background: Color {
        isOLED ? .black : dynamic(dark: UIColor(red: 0.055, green: 0.055, blue: 0.075, alpha: 1),
                                  light: UIColor(red: 0.965, green: 0.96, blue: 0.975, alpha: 1))
    }
    static var surface: Color {
        dynamic(dark: isOLED ? UIColor(white: 0.09, alpha: 1) : UIColor(red: 0.105, green: 0.105, blue: 0.135, alpha: 1),
                light: .white)
    }
    static let primary = dynamic(dark: .white, light: UIColor(red: 0.08, green: 0.08, blue: 0.1, alpha: 1))
    static let secondary = dynamic(dark: UIColor(red: 0.61, green: 0.61, blue: 0.68, alpha: 1),
                                   light: UIColor(red: 0.42, green: 0.42, blue: 0.48, alpha: 1))
    /// Text/icons placed on an accent-filled background.
    static let onAccent = dynamic(dark: UIColor(red: 0.055, green: 0.055, blue: 0.075, alpha: 1), light: .white)

    static var accent: Color {
        if appearance.accent == .cover, let cover = appearance.coverColor { return adapted(cover) }
        let preset = appearance.accent.hsb
        return adapted(UIColor(hue: preset.hue, saturation: preset.saturation, brightness: 1, alpha: 1))
    }

    /// Light pastel on dark backgrounds, deeper tone on light ones, so contrast stays readable either way.
    private static func adapted(_ color: UIColor) -> Color {
        var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
        color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
        return dynamic(dark: UIColor(hue: hue, saturation: min(saturation, 0.5), brightness: 0.98, alpha: 1),
                       light: UIColor(hue: hue, saturation: max(min(saturation + 0.25, 0.85), 0.45), brightness: 0.55, alpha: 1))
    }

    /// Built outside the main actor on purpose: SwiftUI resolves dynamic colours on its background
    /// render thread, and a main-actor closure there traps Swift's isolation check (crash on device).
    private nonisolated static func dynamic(dark: UIColor, light: UIColor) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .light ? light : dark })
    }
}

enum CoverPalette {
    /// Picks the most prominent vivid hue of an image (24×24 sample, hue buckets weighted by saturation × brightness).
    nonisolated static func vibrantColor(of image: UIImage) -> UIColor? {
        guard let cgImage = image.cgImage else { return nil }
        let side = 24
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: side, height: side, bitsPerComponent: 8,
                                          bytesPerRow: side * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.interpolationQuality = .medium
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
            return true
        }
        guard drawn else { return nil }
        var buckets = [(weight: CGFloat, hue: CGFloat, saturation: CGFloat)](repeating: (0, 0, 0), count: 12)
        for index in stride(from: 0, to: pixels.count, by: 4) {
            let color = UIColor(red: CGFloat(pixels[index]) / 255, green: CGFloat(pixels[index + 1]) / 255,
                                blue: CGFloat(pixels[index + 2]) / 255, alpha: 1)
            var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
            color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
            guard saturation > 0.15, brightness > 0.2 else { continue }
            let weight = saturation * brightness
            let slot = min(Int(hue * 12), 11)
            buckets[slot].weight += weight
            buckets[slot].hue += hue * weight
            buckets[slot].saturation += saturation * weight
        }
        guard let best = buckets.max(by: { $0.weight < $1.weight }), best.weight > 0.5 else { return nil }
        return UIColor(hue: best.hue / best.weight, saturation: best.saturation / best.weight, brightness: 1, alpha: 1)
    }
}
