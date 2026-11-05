package bot.bops.remote

import org.junit.Assert.assertEquals
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
}
