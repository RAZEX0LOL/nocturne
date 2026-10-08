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
        app.buttons["Подключить Navidrome"].tap()
        XCTAssertTrue(app.textFields["https://music.example.com"].waitForExistence(timeout: 30))
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
}
