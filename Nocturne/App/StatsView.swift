import Charts
import SwiftUI

struct StatsView: View {
    private var stats: StatsStore { StatsStore.shared }
    @State private var confirmClear = false

    var body: some View {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let weekStart = calendar.date(byAdding: .day, value: -6, to: today) ?? today
        let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: today)) ?? today
        let week = stats.plays(since: weekStart)
        let month = stats.plays(since: monthStart)
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: weekStart) }.map { day in
            (day: day, minutes: week.filter { calendar.isDate($0.date, inSameDayAs: day) }.reduce(0) { $0 + $1.seconds } / 60)
        }
        List {
            Section {
                HStack(spacing: 12) {
                    tile(String(localized: "За месяц"), hours(month), String(localized: "\(month.count) прослуш."))
                    tile(String(localized: "За всё время"), hours(stats.plays), String(localized: "\(stats.plays.count) прослуш."))
                }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
            }
            Section(String(localized: "Последние 7 дней, минут")) {
                Chart(days, id: \.day) { item in
                    BarMark(x: .value(String(localized: "День"), item.day, unit: .day), y: .value(String(localized: "Минуты"), item.minutes))
                        .foregroundStyle(Theme.accent).cornerRadius(4)
                }
                .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisValueLabel(format: .dateTime.weekday(.abbreviated)) } }
                .frame(height: 160).padding(.vertical, 8)
                .accessibilityLabel(String(localized: "Минут прослушивания по дням"))
            }
            ranking(String(localized: "Исполнители месяца"), stats.top(\.artist, in: month))
            ranking(String(localized: "Треки месяца"), stats.top(\.title, in: month))
            Section {
                Button(String(localized: "Очистить статистику"), role: .destructive) { confirmClear = true }.disabled(stats.plays.isEmpty)
            } footer: {
                Text(String(localized: "Статистика хранится только на этом устройстве. Прослушивание засчитывается после половины трека или 4 минут."))
            }
        }
        .scrollContentBackground(.hidden).background(Theme.background)
        .navigationTitle(String(localized: "Статистика")).navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(String(localized: "Очистить статистику?"), isPresented: $confirmClear, titleVisibility: .visible) {
            Button(String(localized: "Очистить"), role: .destructive) { stats.clear() }
        }
    }

    private func hours(_ plays: [StatsStore.Play]) -> String {
        let minutes = Int(plays.reduce(0) { $0 + $1.seconds } / 60)
        return minutes < 60 ? String(localized: "\(minutes) мин") : String(localized: "\(minutes / 60) ч \(minutes % 60) мин")
    }

    private func tile(_ title: String, _ value: String, _ caption: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(Theme.secondary)
            Text(value).font(.title3.bold()).foregroundStyle(Theme.primary)
            Text(caption).font(.caption2).foregroundStyle(Theme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius(14)))
    }

    @ViewBuilder private func ranking(_ title: String, _ items: [(name: String, count: Int)]) -> some View {
        Section(title) {
            if items.isEmpty { Text(String(localized: "Пока пусто")).foregroundStyle(Theme.secondary) }
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack {
                    Text("\(index + 1)").font(.callout.monospacedDigit()).foregroundStyle(Theme.accent).frame(width: 22)
                    Text(item.name).foregroundStyle(Theme.primary).lineLimit(1)
                    Spacer()
                    Text("\(item.count)").font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary)
                }
            }
        }
    }
}
