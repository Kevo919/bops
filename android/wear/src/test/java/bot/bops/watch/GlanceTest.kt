package bot.bops.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GlanceTest {
    @Test fun approvalsComeFirstAndCount() {
        val g = Glance.parse("""{"server":"Hostinger","pings":[{"key":"m:1","title":"Sam","body":"done"},{"key":"a:9","title":"Boppy","body":"Waiting for your OK: send email"}]}""")
        assertNull(g.error)
        assertEquals("Hostinger", g.server)
        assertEquals("a:9", g.items.first().key)
        assertEquals(1, g.waiting)
        assertEquals("1 waiting for your OK", g.headline)
    }

    @Test fun emptyIsAllClear() {
        assertEquals("All clear on My PC", Glance.parse("""{"server":"My PC","pings":[]}""").headline)
    }

    @Test fun phoneErrorIsShown() {
        val g = Glance.parse("""{"error":"Can't reach My PC. Is Tailscale on and Bops running?"}""")
        assertTrue(g.headline.startsWith("Can't reach"))
    }

    @Test fun garbageAndBlankAreSafe() {
        assertEquals("The phone sent something odd.", Glance.parse("not json").error)
        assertEquals("No answer from the phone.", Glance.parse(null).error)
        assertEquals(0, Glance.parse("""{"pings":[{"title":"no key"}]}""").items.size)
    }
}
