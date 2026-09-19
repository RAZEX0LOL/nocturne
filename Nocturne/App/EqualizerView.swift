import SwiftUI

struct EqualizerView: View {
    @State private var settings = AudioEffects.shared.settings
    @AppStorage(AudioEffects.presetKey) private var preset = AudioEffects.Preset.flat

    var body: some View {
        Form {
            Section {
                Toggle(String(localized: "Эквалайзер"), isOn: Binding(get: { settings.enabled }, set: { value in apply { $0.enabled = value } }))
                Picker(String(localized: "Пресет"), selection: Binding(get: { preset }, set: select)) {
                    ForEach(AudioEffects.Preset.allCases) { Text($0.title).tag($0) }
                }
            } footer: { Text(String(localized: "Работает для потока и скачанных треков. Изменения слышны сразу.")) }
            Section(String(localized: "Полосы, дБ")) {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(AudioEffects.frequencies.indices, id: \.self) { band in
                        VStack(spacing: 8) {
                            Text(String(format: "%+.0f", settings.gains[band])).font(.caption2.monospacedDigit()).foregroundStyle(Theme.secondary)
                            Slider(value: Binding(get: { Double(settings.gains[band]) }, set: { value in
                                preset = .custom
                                apply { $0.gains[band] = Float(value.rounded()) }
                            }), in: -12...12, step: 1)
                            .frame(width: 170).rotationEffect(.degrees(-90)).frame(width: 36, height: 170)
                            .accessibilityLabel(String(localized: "Полоса \(label(AudioEffects.frequencies[band]))"))
                            Text(label(AudioEffects.frequencies[band])).font(.caption2).foregroundStyle(Theme.secondary)
                        }.frame(maxWidth: .infinity)
                    }
                }.padding(.vertical, 8)
                .disabled(!settings.enabled).opacity(settings.enabled ? 1 : 0.4)
            }
        }
        .scrollContentBackground(.hidden).background(Theme.background)
        .navigationTitle(String(localized: "Эквалайзер")).navigationBarTitleDisplayMode(.inline)
    }

    private func label(_ frequency: Double) -> String {
        frequency >= 1_000 ? String(localized: "\(Int(frequency / 1_000))к") : "\(Int(frequency))"
    }

    private func select(_ newValue: AudioEffects.Preset) {
        preset = newValue
        guard let gains = newValue.gains else { return }
        apply { $0.gains = gains; $0.enabled = true }
    }

    private func apply(_ change: (inout AudioEffects.Settings) -> Void) {
        AudioEffects.shared.update(change)
        settings = AudioEffects.shared.settings
    }
}
