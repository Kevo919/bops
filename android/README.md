# Bops for Android

Bops on your phone: chat with your bots and answer their questions, from your own Bops (on your PC, or on a server).

1. On your computer, in Bops: **Settings → Your phone → Pair a phone**. It shows an address and a pairing code.
2. On your phone, open this app and enter both.

Away from home, your phone reaches your PC through [Tailscale](https://tailscale.com) (install it on both and sign in to the same account). The pairing code is shown once; pairing again or **Unpair** stops the old code at once.

Build: open this folder in Android Studio, or `gradle assembleDebug` here. The APK is `app/build/outputs/apk/debug/app-debug.apk`.
