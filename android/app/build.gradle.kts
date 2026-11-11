plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI sets these (see .github/workflows/android-apk.yml); a local build without them is unchanged.
// BOPS_VERSION_CODE rises with every CI build so a newer APK installs over an older one.
val ciVersionCode = System.getenv("BOPS_VERSION_CODE")?.toIntOrNull()
// Release signing only when a keystore is supplied from outside the repo (never committed).
val releaseKeystore = System.getenv("BOPS_KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.isFile }

android {
    namespace = "bot.bops.remote"
    compileSdk = 35

    defaultConfig {
        applicationId = "bot.bops.remote"
        minSdk = 26
        targetSdk = 35
        versionCode = ciVersionCode ?: 1
        versionName = if (ciVersionCode != null) "0.1.0.$ciVersionCode" else "0.1.0"
        testInstrumentationRunner = "bot.bops.remote.MultiServerTests"
        // Which GitHub release this build checks for updates (CI sets it: android-latest or android-latest-test).
        buildConfigField("String", "RELEASE_TAG", "\"${System.getenv("BOPS_RELEASE_TAG") ?: "android-latest"}\"")
        // Flip to true once Bops is in a Play Store track: then Install from Play Store (FotMob's route) turns on.
        buildConfigField("boolean", "PLAY_LISTED", "false")
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = System.getenv("BOPS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BOPS_KEY_ALIAS")
                keyPassword = System.getenv("BOPS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseKeystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures { buildConfig = true }
    packaging { resources { excludes += setOf("META-INF/versions/9/OSGI-INF/MANIFEST.MF", "META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*") } }
}

// One library: Google's code scanner (Play services) for Scan QR code. It shows its own camera screen,
// so the app needs no camera permission. Everything else is Android's own WebView and a few screens.
dependencies {
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Second library: Wear OS Data Layer, so the Bops watch app (android/wear) can ask through this phone.
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    // Watch & updates. Kadb (Apache-2.0): installs the watch app over the watch's Wireless debugging, no PC needed.
    implementation("com.flyfishxu:kadb:2.1.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // FotMob's route once Bops is on the Play Store: open the listing on the watch.
    implementation("androidx.wear:wear-remote-interactions:1.1.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
