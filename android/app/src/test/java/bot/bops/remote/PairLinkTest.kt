package bot.bops.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What Scan QR code (and the camera app's link) may hand to the confirm screen: PairLink.parse. */
class PairLinkTest {
    private val code = "a".repeat(43)
    private fun link(a: String, c: String = code) = "bops://pair?a=${java.net.URLEncoder.encode(a, "UTF-8")}&c=$c"

    @Test fun validTailscaleLink() =
        assertEquals(PairLink.Ok("http://100.101.102.103:3210", code), PairLink.parse(link("http://100.101.102.103:3210")))

    @Test fun validHttpsLinkTrailingSlashAndSpaces() =
        assertEquals(PairLink.Ok("https://bops.example.com", code), PairLink.parse("  " + link("https://bops.example.com/") + "\n"))

    @Test fun wrongScheme() {
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("https://pair?a=http%3A%2F%2F100.64.0.1%3A3210&c=$code"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://other?a=http%3A%2F%2F100.64.0.1%3A3210&c=$code"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("hello there"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse(null))
    }

    @Test fun plainHttpHomeAddressRefused() {
        assertEquals(PairLink.Bad(PairLink.UNSAFE), PairLink.parse(link("http://192.168.1.20:3210")))
        assertEquals(PairLink.Bad(PairLink.UNSAFE), PairLink.parse(link("http://100.128.0.1:3210")))
        assertEquals(PairLink.Bad(PairLink.UNSAFE), PairLink.parse(link("http://evil.example.com:3210")))
        assertEquals(PairLink.Bad(PairLink.UNSAFE), PairLink.parse(link("https://user@bops.example.com")))
    }

    @Test fun missingCode() {
        assertEquals(PairLink.Bad(PairLink.NO_CODE), PairLink.parse("bops://pair?a=http%3A%2F%2F100.64.0.1%3A3210"))
        assertEquals(PairLink.Bad(PairLink.NO_CODE), PairLink.parse("bops://pair?a=http%3A%2F%2F100.64.0.1%3A3210&c="))
        assertEquals(PairLink.Bad(PairLink.NO_CODE), PairLink.parse(link("http://100.64.0.1:3210", "short")))
    }

    @Test fun missingAddress() = assertEquals(PairLink.Bad(PairLink.NO_ADDRESS), PairLink.parse("bops://pair?c=$code"))

    @Test fun twoAddressesRefused() =
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse(link("http://100.64.0.1:3210") + "&a=https%3A%2F%2Fevil.example.com"))

    /** The Target server line: hidden (null) until there's a real address, never ":80". */
    @Test fun noTargetUntilAnAddressIsTyped() {
        assertNull(PairLink.targetOf(PairLink.entered("")))
        assertNull(PairLink.targetOf(PairLink.entered("   ")))
        assertNull(PairLink.targetOf(PairLink.entered("http://")))
        assertNull(PairLink.targetOf(PairLink.entered("https://")))
        assertNull(PairLink.targetOf(PairLink.entered("100.")))
    }

    @Test fun targetOnceTypedOrScanned() {
        assertEquals("100.64.0.9:3210", PairLink.targetOf(PairLink.entered("100.64.0.9:3210")))
        assertEquals("100.64.0.9:80", PairLink.targetOf(PairLink.entered("http://100.64.0.9")))
        assertEquals("bops.example.com:443", PairLink.targetOf(PairLink.entered("https://bops.example.com/")))
        val scanned = PairLink.parse(link("http://100.101.102.103:3210")) as PairLink.Ok
        assertEquals("100.101.102.103:3210", PairLink.targetOf(PairLink.entered(scanned.address)))
    }

    private val good = "a=http%3A%2F%2F100.64.0.1%3A3210&c=" + "a".repeat(43)

    @Test fun otherParamsRefused() {
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair?$good&next=https%3A%2F%2Fevil.example.com"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair?x=1&$good"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair?$good&A=http%3A%2F%2F100.64.0.2%3A3210"))
    }

    @Test fun pathOnTheLinkRefused() {
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair/?$good"))
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair/extra?$good"))
    }

    @Test fun userInfoOnTheLinkRefused() =
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://someone@pair?$good"))

    @Test fun portOnTheLinkRefused() =
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair:8080?$good"))

    @Test fun fragmentOnTheLinkRefused() =
        assertEquals(PairLink.Bad(PairLink.NOT_BOPS), PairLink.parse("bops://pair?$good#more"))

    @Test fun theExactLinkBopsMakesStillWorks() =
        assertEquals(PairLink.Ok("http://100.64.0.1:3210", "a".repeat(43)), PairLink.parse("bops://pair?$good"))
}
