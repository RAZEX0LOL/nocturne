import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

/**
 * Данные подписи: из keystore.properties рядом с проектом или из переменных окружения — так
 * собирают и вручную, и в CI. Самих паролей в репозитории нет и быть не должно.
 */
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
    listOf(
        "storeFile" to "ANDROID_KEYSTORE",
        "storePassword" to "ANDROID_KEYSTORE_PASSWORD",
        "keyAlias" to "ANDROID_KEY_ALIAS",
        "keyPassword" to "ANDROID_KEY_PASSWORD",
    ).forEach { (key, variable) -> System.getenv(variable)?.let { setProperty(key, it) } }
}
val keystoreFile = signing.getProperty("storeFile")?.let(::file)?.takeIf { it.exists() }

val buildNumber: Int = System.getenv("NOCTURNE_BUILD_NUMBER")?.toIntOrNull()
    ?: providers.exec { commandLine("git", "rev-list", "--count", "HEAD"); isIgnoreExitValue = true }
        .standardOutput.asText.get().trim().toIntOrNull()
    ?: 1

android {
    namespace = "app.nocturne.music"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.nocturne.music"
        minSdk = 26
        targetSdk = 36
        // Номер сборки = число коммитов, как у iOS: обновление ставится поверх, только если он вырос.
        versionCode = buildNumber
        versionName = "1.1.$buildNumber"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        if (keystoreFile != null) create("release") {
            storeFile = keystoreFile
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            // R8 убирает неиспользованный код и имена: без него apk почти вдвое толще.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Без ключа сборка не падает, а получается неподписанной: так CI собирает проверочный apk.
            signingConfig = signingConfigs.findByName("release")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(project(":core"))
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(platform("androidx.compose:compose-bom:2025.08.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.2")
    implementation("androidx.media3:media3-exoplayer:1.8.0")
    implementation("androidx.media3:media3-session:1.8.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.documentfile:documentfile:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.08.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
