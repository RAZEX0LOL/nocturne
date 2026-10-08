import SwiftUI
import UIKit

struct AppearanceSettingsView: View {
    @Bindable private var appearance = Appearance.shared
    @State private var iconName = UIApplication.shared.alternateIconName

    private static let icons: [(name: String?, title: String, preview: String)] = [
        (nil, String(localized: "Ночь"), "IconPreview-Default"), ("AppIcon-Dawn", String(localized: "Рассвет"), "IconPreview-Dawn"),
        ("AppIcon-Mint", String(localized: "Мята"), "IconPreview-Mint"), ("AppIcon-Mono", String(localized: "Моно"), "IconPreview-Mono"),
        ("AppIcon-Light", String(localized: "Светлая"), "IconPreview-Light")
    ]

    var body: some View {
        Form {
            Section(String(localized: "Тема")) {
                Picker(String(localized: "Тема"), selection: $appearance.theme) {
                    ForEach(Appearance.ThemeMode.allCases) { Text($0.title).tag($0) }
                }.pickerStyle(.inline).labelsHidden()
            }
            Section {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
                    ForEach(Appearance.AccentChoice.allCases) { choice in
                        Button { appearance.accent = choice } label: {
                            VStack(spacing: 6) {
                                swatch(choice)
                                    .frame(width: 40, height: 40)
                                    .overlay(Circle().stroke(Theme.primary, lineWidth: appearance.accent == choice ? 2.5 : 0).padding(-4))
                                Text(choice.title).font(.caption2).foregroundStyle(Theme.secondary).lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }.buttonStyle(.plain)
                            .accessibilityLabel(choice.title)
                            .accessibilityAddTraits(appearance.accent == choice ? .isSelected : [])
                    }
                }.padding(.vertical, 8)
            } header: { Text(String(localized: "Акцентный цвет")) } footer: {
                Text(String(localized: "«Из обложки» подбирает цвет под текущий трек."))
            }
            Section(String(localized: "Плеер")) {
                Picker(String(localized: "Фон"), selection: $appearance.playerBackground) {
                    ForEach(Appearance.PlayerBackground.allCases) { Text($0.title).tag($0) }
                }
                Toggle(String(localized: "Уменьшать обложку на паузе"), isOn: $appearance.animateCover)
                Toggle(String(localized: "Свайп по обложке — смена трека"), isOn: $appearance.coverSwipe)
                Toggle(String(localized: "Виброотклик"), isOn: $appearance.haptics)
                Picker(String(localized: "Кнопка мини-плеера"), selection: $appearance.miniButton) {
                    ForEach(Appearance.MiniButton.allCases) { Text($0.title).tag($0) }
                }
                LabeledContent(String(localized: "Размер текста песен")) {
                    Slider(value: $appearance.lyricsScale, in: 0.8...1.6, step: 0.1).frame(maxWidth: 160)
                }
                Toggle(String(localized: "Текст песни по центру"), isOn: $appearance.lyricsCentered)
            }
            Section(String(localized: "Форма")) {
                Picker(String(localized: "Углы"), selection: $appearance.corners) {
                    ForEach(Appearance.Corners.allCases) { Text($0.title).tag($0) }
                }.pickerStyle(.segmented)
                Toggle(String(localized: "Скруглённый шрифт"), isOn: $appearance.roundedFont)
            }
            Section(String(localized: "Медиатека")) {
                Toggle(String(localized: "Альбомы сеткой"), isOn: $appearance.libraryGrid)
                NavigationLink(String(localized: "Разделы главной")) { HomeSectionsView() }
            }
            Section(String(localized: "Иконка приложения")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 16) {
                        ForEach(Self.icons, id: \.title) { icon in
                            Button { setIcon(icon.name) } label: {
                                VStack(spacing: 6) {
                                    Image(icon.preview).resizable().frame(width: 60, height: 60)
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.accent, lineWidth: iconName == icon.name ? 3 : 0).padding(-3))
                                    Text(icon.title).font(.caption2).foregroundStyle(Theme.secondary)
                                }
                            }.buttonStyle(.plain).accessibilityLabel(String(localized: "Иконка \(icon.title)"))
                        }
                    }.padding(.vertical, 8).padding(.horizontal, 4)
                }
            }
        }
        .scrollContentBackground(.hidden).background(Theme.background)
        .navigationTitle(String(localized: "Оформление")).navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func swatch(_ choice: Appearance.AccentChoice) -> some View {
        if choice == .cover {
            Circle().fill(AngularGradient(colors: [.red, .orange, .yellow, .green, .blue, .purple, .red], center: .center))
                .overlay(Image(systemName: "photo").font(.caption).foregroundStyle(.white))
        } else {
            let hsb = choice.hsb
            Circle().fill(Color(hue: hsb.hue, saturation: hsb.saturation + 0.1, brightness: 0.9))
        }
    }

    private func setIcon(_ name: String?) {
        guard UIApplication.shared.supportsAlternateIcons, name != iconName else { return }
        Task {
            do {
                try await UIApplication.shared.setAlternateIconName(name)
                iconName = name
            } catch { Log.library.error("Icon change failed: \(Log.describe(error), privacy: .public)") }
        }
    }
}

struct HomeSectionsView: View {
    @Bindable private var appearance = Appearance.shared
    var body: some View {
        List {
            Section {
                ForEach(appearance.homeOrder) { section in
                    Toggle(section.title, isOn: Binding(
                        get: { !appearance.hiddenHome.contains(section) },
                        set: { visible in if visible { appearance.hiddenHome.remove(section) } else { appearance.hiddenHome.insert(section) } }))
                }
                .onMove { appearance.homeOrder.move(fromOffsets: $0, toOffset: $1) }
            } footer: { Text(String(localized: "Перетащи, чтобы изменить порядок; выключи, чтобы скрыть раздел.")) }
            Button(String(localized: "Вернуть по умолчанию")) { appearance.resetHome() }
        }
        .environment(\.editMode, .constant(.active))
        .scrollContentBackground(.hidden).background(Theme.background)
        .navigationTitle(String(localized: "Разделы главной")).navigationBarTitleDisplayMode(.inline)
    }
}
