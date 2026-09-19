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
        XCTAssertTrue(app.buttons["Подключиться"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["Подключиться"].isEnabled)
        XCTAssertTrue(app.secureTextFields["Пароль Navidrome"].exists)
        app.buttons["Посмотреть демоверсию"].tap()
        XCTAssertTrue(app.staticTexts["Недавно добавлено"].waitForExistence(timeout: 5))
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.staticTexts["Демоверсия"].waitForExistence(timeout: 5))
        app.buttons["Подключить Navidrome"].tap()
        XCTAssertTrue(app.textFields["https://music.example.com"].waitForExistence(timeout: 5))
    }
}
