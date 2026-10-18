import XCTest

final class NocturneUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    @MainActor private func selectTab(_ name: String, in app: XCUIApplication) {
        let tab = app.tabBars.buttons[name]
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab)
        if XCTWaiter.wait(for: [selected], timeout: 5) != .completed {
            // Во время появления системной панели первый тап может попасть в переходную анимацию.
            tab.tap()
            let retry = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab)
            XCTAssertEqual(XCTWaiter.wait(for: [retry], timeout: 10), .completed)
        }
    }

    @MainActor func testDemoNavigationAndSearch() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Недавно добавлено"].waitForExistence(timeout: 30))
        selectTab("Медиатека", in: app)
        XCTAssertTrue(app.buttons["Альбомы"].waitForExistence(timeout: 15))
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Параллели")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Слушать"].waitForExistence(timeout: 5))
        app.buttons["Слушать"].tap()
        XCTAssertTrue(app.alerts["Воспроизведение"].waitForExistence(timeout: 5))
        app.alerts.buttons["Понятно"].tap()
        selectTab("Поиск", in: app)
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        // Поле должно быть видно сразу, а не только после того, как список потянут вниз.
        XCTAssertTrue(search.isHittable, "поле поиска спрятано")
        search.tap()
        search.typeText("Afterglow")
        XCTAssertTrue(app.staticTexts["Треки"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Search results"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testConnectionScreen() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Подключиться"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["Подключиться"].isEnabled)
        XCTAssertTrue(app.secureTextFields["Пароль Navidrome"].exists)
        // На первом запуске экран входа ещё перестраивается (клавиатура, поля) — нажатие может
        // потеряться, как с вкладками выше; повторяем, пока главная не появится.
        let home = app.staticTexts["Недавно добавлено"]
        for _ in 0..<3 where !home.exists {
            if app.buttons["Посмотреть демоверсию"].exists { app.buttons["Посмотреть демоверсию"].tap() }
            _ = home.waitForExistence(timeout: 10)
        }
        XCTAssertTrue(home.exists)
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.staticTexts["Демоверсия"].waitForExistence(timeout: 30))
        // Лист настроек ещё выезжает — нажатие может прийтись на анимацию; повторяем, как выше.
        let address = app.textFields["https://music.example.com"]
        for _ in 0..<3 where !address.exists {
            if app.buttons["Подключить Navidrome"].exists { app.buttons["Подключить Navidrome"].tap() }
            _ = address.waitForExistence(timeout: 10)
        }
        XCTAssertTrue(address.exists)
    }

    /// Regression: theme colours were closures isolated to the main actor and crashed when
    /// SwiftUI resolved them on its background render thread (tapping shuffle/repeat on device).
    @MainActor func testThemeColorsResolveOffMainThread() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--check-threading"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Недавно добавлено"].waitForExistence(timeout: 30))
        sleep(2)
        XCTAssertEqual(app.state, .runningForeground, "resolving theme colours off the main thread must not crash the app")
    }

    /// Живая проверка против mock-сервера с короткими треками (`mock_navidrome.py 8`, нужен запущенный):
    /// после последнего трека альбома играет похожий, а скорость меняется из полноэкранного плеера.
    /// Без сервера тест пропускается.
    @MainActor func testEndlessPlaybackAndSpeedAgainstMockServer() throws {
        let probe = URL(string: "http://127.0.0.1:4533/radio")!
        guard (try? Data(contentsOf: probe)) != nil else { throw XCTSkip("mock-сервер не запущен") }
        let app = XCUIApplication()
        app.launchArguments = ["--connect", "http://127.0.0.1:4533", "test", "demo"]
        app.launch()
        let album = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Mock Album")).firstMatch
        XCTAssertTrue(album.waitForExistence(timeout: 30))
        let last = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Тестовый трек 3")).firstMatch
        // Пока главная дорисовывает карусели, первый тап может не дойти — как с вкладками выше.
        for _ in 0..<3 where !last.exists {
            album.tap()
            _ = last.waitForExistence(timeout: 5)
        }
        XCTAssertTrue(last.exists, "страница альбома не открылась")
        last.tap()
        // Трек 8 секунд, потом очередь кончается — должен заиграть похожий, которого не было в альбоме.
        let similar = app.staticTexts["Похожий трек"]
        XCTAssertTrue(similar.waitForExistence(timeout: 30), "после конца альбома не заиграла похожая музыка")
        similar.tap()
        let speed = app.buttons["Скорость воспроизведения"]
        XCTAssertTrue(speed.waitForExistence(timeout: 10))
        speed.tap()
        app.buttons["1,5×"].tap()
        XCTAssertTrue(app.buttons["Скорость воспроизведения"].staticTexts["1,5×"].waitForExistence(timeout: 5) || speed.label.contains("1,5"))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Endless + speed"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    @MainActor func testOfflinePreparationSettingSurvivesRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        func openSetting() -> XCUIElement {
            let settings = app.buttons["Настройки"]
            XCTAssertTrue(settings.waitForExistence(timeout: 20))
            settings.tap()
            let toggle = app.switches["Готовить очередь для офлайна"]
            for _ in 0..<8 {
                if toggle.exists && toggle.isHittable && toggle.frame.maxY < app.frame.maxY - 80 { break }
                app.swipeUp()
            }
            XCTAssertTrue(toggle.exists)
            return toggle
        }
        app.launch()
        let toggle = openSetting()
        let initial = toggle.value as? String
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let expected = initial == "1" ? "0" : "1"
        let switched = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", expected), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [switched], timeout: 5), .completed)
        let changed = toggle.value as? String
        XCTAssertNotEqual(initial, changed)
        app.terminate()
        app.launch()
        let restored = openSetting()
        XCTAssertEqual(restored.value as? String, changed)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Offline preparation settings"
        attachment.lifetime = .keepAlways
        add(attachment)
        // Возвращаем настройку выделенного симулятора к исходному значению.
        restored.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let reverted = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", initial ?? "0"), object: restored)
        XCTAssertEqual(XCTWaiter.wait(for: [reverted], timeout: 5), .completed)
    }

}
