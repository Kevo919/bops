plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Same version numbering and signing as the phone app (see ../app/build.gradle.kts). The watch app MUST share
// the phone app's package name and signing key: that's how Wear OS's Data Layer lets the two talk.
val ciVersionCode = System.getenv("BOPS_VERSION_CODE")?.toIntOrNull()
val releaseKeystore = System.getenv("BOPS_KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.isFile }

android {
    namespace = "bot.bops.watch"
    compileSdk = 35

    defaultConfig {
        applicationId = "bot.bops.remote"
        minSdk = 30
        targetSdk = 35
        versionCode = ciVersionCode ?: 1
        versionName = if (ciVersionCode != null) "0.1.0.$ciVersionCode" else "0.1.0"
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

// One library, the same one the phone app uses for this: Wear OS's Data Layer.
dependencies {
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303") // real org.json for JVM unit tests (Android's is a stub off-device)
}
