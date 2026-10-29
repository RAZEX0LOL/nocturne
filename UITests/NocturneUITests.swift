import XCTest

final class NocturneUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    @MainActor private func selectTab(_ name: String, in app: XCUIApplication) {
        // На iPad вкладки находятся в верхней панели, которая не всегда имеет тип TabBar.
        let tab = app.buttons[name].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.press(forDuration: 0.15)
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab)
        if XCTWaiter.wait(for: [selected], timeout: 5) != .completed {
            // Во время появления системной панели первый тап может попасть в переходную анимацию.
            tab.press(forDuration: 0.15)
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
        XCTAssertTrue(app.buttons["Пауза"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.alerts["Воспроизведение"].exists)
        app.buttons["Пауза"].tap()
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

    /// Без mock-сервера: настоящие аудиоресурсы из Release-сборки должны играть на чистой установке.
    @MainActor func testDemoAudioPlayback() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        let demo = app.buttons["Посмотреть демоверсию"]
        XCTAssertTrue(demo.waitForExistence(timeout: 20))
        demo.press(forDuration: 0.15)
        XCTAssertTrue(app.staticTexts["Недавно добавлено"].waitForExistence(timeout: 15), "Один тап должен открыть демомедиатеку")
        selectTab("Медиатека", in: app)
        let album = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Параллели")).firstMatch
        XCTAssertTrue(album.waitForExistence(timeout: 15))
        let play = app.buttons["Слушать"]
        album.press(forDuration: 0.15)
        XCTAssertTrue(play.waitForExistence(timeout: 10))
        play.press(forDuration: 0.15)
        let open = app.buttons["player.open"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.press(forDuration: 0.15)
        let elapsed = app.staticTexts["player.elapsed"]
        XCTAssertTrue(elapsed.waitForExistence(timeout: 10))
        func waitForAudio() {
            let advancing = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                guard let label = elapsed.label.split(separator: ":").last, let seconds = Int(label) else { return false }
                return seconds >= 1
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [advancing], timeout: 10), .completed, "AVPlayer не продвигается")
            XCTAssertFalse(app.alerts["Воспроизведение"].exists)
        }
        for title in ["Первый свет", "Между нами", "Тишина", "Afterglow", "Остаться"] {
            let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", title), object: app.staticTexts["player.title"])
            XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 10), .completed)
            waitForAudio()
            if title == "Первый свет" {
                app.buttons["player.toggle"].press(forDuration: 0.15)
                XCTAssertEqual(app.buttons["player.toggle"].label, "Воспроизвести")
                let paused = elapsed.label
                let moved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", paused), object: elapsed)
                moved.isInverted = true
                XCTAssertEqual(XCTWaiter.wait(for: [moved], timeout: 2), .completed)
                app.buttons["player.toggle"].press(forDuration: 0.15)
                let resumed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", paused), object: elapsed)
                XCTAssertEqual(XCTWaiter.wait(for: [resumed], timeout: 5), .completed)
                // Проверяем автоматический переход в конце файла, а не только реакцию кнопки Next.
                app.sliders["Позиция воспроизведения"].adjust(toNormalizedSliderPosition: 0.95)
            } else if title != "Остаться" {
                app.buttons["player.next"].press(forDuration: 0.15)
            }
        }
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Bundled demo audio playing"
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

    /// Обычный вход из Release-сборки: аргумент --connect обходит форму и не проверяет путь ревьюера.
    @MainActor func testAppReviewServerLoginAndPlayback() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let server = environment["REVIEW_SERVER_URL"],
              let username = environment["REVIEW_USERNAME"],
              let password = environment["REVIEW_PASSWORD"] else {
            throw XCTSkip("Тестовый доступ задаётся в защищённом xctestrun вне репозитория")
        }
        let passwordPrompt = addUIInterruptionMonitor(withDescription: "Save password") { alert in
            for title in ["Not Now", "Not now", "Не сейчас"] {
                let button = alert.buttons[title]
                if button.exists { button.press(forDuration: 0.15); return true }
            }
            return false
        }
        defer { removeUIInterruptionMonitor(passwordPrompt) }
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let address = app.textFields["https://music.example.com"]
        XCTAssertTrue(address.waitForExistence(timeout: 20))
        address.press(forDuration: 0.15); address.typeText(server)
        let login = app.textFields["Username"]
        XCTAssertTrue(login.exists)
        login.press(forDuration: 0.15); login.typeText(username)
        let secret = app.secureTextFields.firstMatch
        secret.press(forDuration: 0.15); secret.typeText(password)
        app.buttons["Connect"].press(forDuration: 0.15)
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 45))
        // На iPadOS 27 сохранение пароля показывается удалённым системным view, а не UIAlert.
        let later = app.buttons.matching(NSPredicate(format: "label IN %@", ["Not Now", "Not now", "Не сейчас"] as NSArray)).firstMatch
        if later.waitForExistence(timeout: 10) { later.press(forDuration: 0.15) }
        selectTab("Library", in: app)
        let album = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Parallels")).firstMatch
        XCTAssertTrue(album.waitForExistence(timeout: 45))
        album.press(forDuration: 0.15)
        let play = app.buttons["Play"]
        XCTAssertTrue(play.waitForExistence(timeout: 15))
        play.press(forDuration: 0.15)
        let open = app.buttons["player.open"]
        XCTAssertTrue(open.waitForExistence(timeout: 15))
        open.press(forDuration: 0.15)
        let elapsed = app.staticTexts["player.elapsed"]
        XCTAssertTrue(elapsed.waitForExistence(timeout: 10))
        let advancing = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard let text = elapsed.label.split(separator: ":").last, let seconds = Int(text) else { return false }
            return seconds >= 2
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [advancing], timeout: 20), .completed)
        XCTAssertFalse(app.alerts.firstMatch.exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "App Review server playback"
        attachment.lifetime = .keepAlways
        add(attachment)
        // Удаляем только добавленный тестом локальный вход, чтобы следующие тесты начинались с формы.
        app.buttons["Minimise player"].press(forDuration: 0.15)
        selectTab("Home", in: app)
        app.buttons["Settings"].press(forDuration: 0.15)
        let disconnect = app.buttons["Disconnect current server"]
        XCTAssertTrue(disconnect.waitForExistence(timeout: 10))
        disconnect.press(forDuration: 0.15)
        app.buttons["Disconnect"].press(forDuration: 0.15)
        XCTAssertTrue(address.waitForExistence(timeout: 15))
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
        let mini = app.buttons["player.open"]
        for _ in 0..<3 {
            last.tap()
            let started = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "Тестовый трек 3"), object: mini)
            if XCTWaiter.wait(for: [started], timeout: 3) == .completed { break }
        }
        XCTAssertTrue(mini.label.contains("Тестовый трек 3"), "нажатие не запустило выбранный серверный трек")
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
