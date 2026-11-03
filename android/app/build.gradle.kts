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
}

// No libraries: the app is Android's own WebView and two screens, so there's nothing to keep up to date but Android.
dependencies {}
