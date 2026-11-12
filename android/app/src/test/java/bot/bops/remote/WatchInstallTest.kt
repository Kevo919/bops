package bot.bops.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchInstallTest {
    private val sha = "a".repeat(64)

    @Test fun parsesTheReleaseFeed() {
        val r = UpdateFeed.parse("""{"versionCode":12,"phone":{"asset":"bops-remote.apk","sha256":"$sha"},"watch":{"asset":"bops-watch.apk","sha256":"${"b".repeat(64)}"}}""")
        assertNotNull(r); assertEquals(12, r!!.versionCode); assertEquals("bops-remote.apk", r.phone.name); assertEquals("bops-watch.apk", r.watch!!.name)
    }

    @Test fun rejectsBadFeeds() {
        assertNull(UpdateFeed.parse("nope"))
        assertNull(UpdateFeed.parse("""{"versionCode":0,"phone":{"asset":"a.apk","sha256":"$sha"}}"""))
        assertNull(UpdateFeed.parse("""{"versionCode":3,"phone":{"asset":"../evil.apk","sha256":"$sha"}}"""))
        assertNull(UpdateFeed.parse("""{"versionCode":3,"phone":{"asset":"a.apk","sha256":"short"}}"""))
        assertNull(UpdateFeed.parse("""{"versionCode":3,"phone":{"asset":"a.apk","sha256":"$sha"},"watch":{"asset":"w.apk","sha256":"x"}}""")!!.watch)
    }

    @Test fun downloadsOnlyFromGithubOverHttps() {
        assertTrue(UpdateFeed.allowedHost("https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk"))
        assertTrue(UpdateFeed.allowedHost("https://objects.githubusercontent.com/x"))
        assertTrue(UpdateFeed.allowedHost("https://release-assets.githubusercontent.com/x"))
        assertFalse(UpdateFeed.allowedHost("http://github.com/x"))
        assertFalse(UpdateFeed.allowedHost("https://github.com.evil.example/x"))
        assertFalse(UpdateFeed.allowedHost("https://evil.example/github.com"))
    }

    @Test fun sha256IsHex() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", UpdateFeed.sha256(ByteArray(0)))
    }

    @Test fun checksWhatTheUserTyped() {
        assertNull(WatchSideload.problem(WatchSideload.Target("192.168.1.40", 37755, "643102", 41899)))
        assertNull(WatchSideload.problem(WatchSideload.Target("192.168.1.40", null, null, 41899)))
        assertNotNull(WatchSideload.problem(WatchSideload.Target("watch.local; rm", null, null, 41899)))
        assertNotNull(WatchSideload.problem(WatchSideload.Target("192.168.1.40", 37755, null, 41899)))
        assertNotNull(WatchSideload.problem(WatchSideload.Target("192.168.1.40", 37755, "12ab56", 41899)))
        assertNotNull(WatchSideload.problem(WatchSideload.Target("192.168.1.40", null, null, 70000)))
    }
}
