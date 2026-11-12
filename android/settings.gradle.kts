pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // JitPack ONLY for Kadb's SPAKE2 pairing library (Wireless debugging pairing); nothing else may come from it.
        maven("https://jitpack.io") { content { includeGroup("com.github.Flyfish233") } }
    }
}
rootProject.name = "BopsRemote"
include(":app")
include(":wear")
