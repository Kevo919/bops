# Bops for Android

Bops on your phone: chat with your bots and answer their questions, from your own Bops (on your PC, or on a server).

1. On your computer, in Bops: **Settings → Your phone → Pair a phone**. It shows an address and a pairing code.
2. On your phone, open this app and enter both.

Away from home, your phone reaches your PC through [Tailscale](https://tailscale.com) (install it on both and sign in to the same account). The pairing code is shown once; pairing again or **Unpair** stops the old code at once.

Build: open this folder in Android Studio, or run `./gradlew assembleDebug` here (`.\gradlew.bat assembleDebug` on Windows). Requires JDK 17+ and Android SDK 35; set `ANDROID_HOME` or use an untracked `local.properties`. The APK is `app/build/outputs/apk/debug/app-debug.apk`.


## Several servers

- Existing installations migrate their address, pairing code and notification history to **My Bops** automatically. Pairing again is not necessary.
- Tap **Saved servers** from setup, or **Servers · <name>** above the running page, to open the switcher. Tap a server to open it; use **Add server** or **Rename or remove** to manage the list.
- Give each server a name such as **My PC** or **Hostinger**. An entry without a valid code stays in the list with **(pair again)**.
- QR links (`bops://pair?a=<address>&c=<code>`) prefill the setup confirmation with the address. Nothing is saved until you tap **Connect** and the server accepts the code. Pairing the same address updates that entry and preserves its identity.
- Switching destroys the old page, clears WebView cookies, and installs only the selected pairing cookie before loading the new page. Codes remain in private, non-backed-up SharedPreferences, as before.
- Notifications poll every paired server every 60 seconds independently, with separate cookies and first-run histories. Notifications include the server name and open that server. A revoked code affects only its own entry. Removing the last pairing stops the watcher.

Address policy remains HTTPS anywhere or HTTP only within Tailscale `100.64.0.0/10`. Origin checks match scheme, host and effective port. Cookies retain HttpOnly, SameSite=Strict and Secure on HTTPS. Pairing/polling requests do not follow redirects with credentials. Microphone permission is restricted to the current server and pending requests are discarded when leaving its page. Other-site links open outside the WebView.

## Regression checks (disposable emulator only)

These platform-only instrumentation checks add no libraries. **They clear Bops preferences in the test installation.** Start an Android emulator, then from this folder:

```powershell
.\gradlew.bat assembleDebug assembleDebugAndroidTest lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell pm grant bot.bops.remote android.permission.POST_NOTIFICATIONS
adb shell am instrument -w bot.bops.remote.test/bot.bops.remote.MultiServerTests
```

The last command must print `PASS:` (the custom runner prints `FAIL:` plus a stack trace on assertion failure). Tests cover migration/idempotence, list changes, per-server histories, stale revocation, address/origin policy, HTTP polling with loopback fixtures, notification attribution, switcher navigation, QR confirmation and WebView cookie isolation. Loopback fixtures call the polling method directly; production polling still rejects ordinary HTTP addresses outside Tailscale. A switcher screenshot is written to the emulator's app-specific external files directory as `multi-server-switcher.png`.

See [WORK_LOG.md](WORK_LOG.md) for verification evidence and remaining device checks.
