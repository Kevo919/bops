# Put Bops on your Android phone

The Bops app for Android isn't in the Play Store. You download it from this repo and install it yourself. It takes about five minutes.

You need Android 8 or newer.

## 1. Download it

On your phone, open this link in Chrome (or your usual browser):

**https://github.com/Kevo919/bops/releases/download/android-latest/bops-remote.apk**

There's only one link. Every time the app changes, the file at that link is replaced, so you can bookmark it.

Chrome may warn that "this type of file can harm your device". Tap **Download anyway**. That warning shows up for any app downloaded outside the Play Store.

## 2. Let your browser install apps

When the download finishes, tap **Open** (or find `bops-remote.apk` in your **Files** or **Downloads** app and tap it).

The first time, Android stops you with a message like "For your security, your phone is not allowed to install unknown apps from this source":

1. Tap **Settings** in that message.
2. Turn on **Allow from this source** for Chrome (or whichever app you opened the file from).
3. Go back. The install screen comes up again.

This only lets that one app (your browser) install apps. To turn it back off later: **Settings → Apps → Chrome → Install unknown apps**. The wording is a little different on Samsung and other phones, so look for "unknown apps".

## 3. Install

Tap **Install**. Google Play Protect may say it doesn't recognize the developer. Tap **More details → Install anyway**. That's expected, because this app comes from your own repo and not from the Play Store.

You'll find **Bops** in your app list.

## 4. Add your Bops server

The app connects to a Bops that's already running, on your PC or on your server. Choose the address type that matches where Bops runs:

| Where Bops runs | Address to type in the app | Notes |
|---|---|---|
| Your PC, reached over Tailscale | `http://100.x.y.z:3210` | That's your PC's Tailscale address (it starts with `100.`). You'll find it in the Tailscale app on the PC. |
| Your server (or PC) behind `tailscale serve` | `https://<name>.<tailnet>.ts.net` | Copy the https address that `tailscale serve` printed. It has a real certificate, so no port is needed. |
| A server with its own https address | `https://bops.example.com` | Any https address works. |

For either of the first two, install **Tailscale** on your phone and sign in to the same account as your PC or server. That's how the phone reaches them, both at home and away.

**Your home Wi-Fi address won't work** (such as `http://192.168.1.20:3210`). The app refuses plain `http://` to anything except a Tailscale `100.x` address, because otherwise your pairing code would be sent over the network unencrypted. Use the Tailscale address instead. It works at home too.

## 5. Pair the phone

1. On the computer, in Bops: **Settings → Your phone → Pair a phone**. Bops shows an address, a pairing code and a QR code.
2. On the phone, open **Bops**, enter the address (from the table above) and the code, and tap **Connect**.
   - You can also scan the QR code with the phone's camera instead. It opens the app with the address filled in, and the app asks before connecting.
3. Bops opens on your phone. Allow notifications if it asks, so it can tell you when a bot needs you.

The code is shown only once. If you lose it, pair again: that also cancels the old code right away. **Unpair** in Bops' Settings cancels it too.

You can add more servers later (your PC and the Hostinger server, for example). Tap **Saved servers** on the setup screen, or **Servers · <name>** at the top of the app, then **Add server**.

## Watch (Wear OS / Galaxy Watch)

Bops on your wrist: what's waiting for your OK (with **Allow** / **Deny**), what's new, and a mic to **Ask Boppy**. The watch goes through the Bops app on your phone, so the watch never needs Tailscale or the pairing code. (Even without the watch app, Bops notifications from your phone already show on a paired watch.)

### Install it from the phone (no PC)

When the phone sees a connected watch without Bops, it offers **Get Bops on your watch** (like FotMob). You can also open **Watch & updates** from the bar above Bops any time.

1. On the watch, once: **Settings → About watch → Software information → tap Software version 5 times**. Then **Settings → Developer options**: turn on **ADB debugging** and **Wireless debugging**. Watch and phone must be on the same Wi-Fi.
2. On the watch, tap **Wireless debugging** and note the **IP address & port**. Tap **Pair new device** and note the **6-digit code** and its **port**.
3. On the phone, in **Watch & updates → Install directly**, type those four things and tap **Install**. The phone downloads the matching watch app from the release, checks its fingerprint, and installs it on the watch.
4. Turn **Wireless debugging** off again on the watch.

**Install from Play Store** shows greyed out with "not set up yet": it turns on once Bops is in a Play Store test track. Then the button opens the Play Store on the watch, the way FotMob does it.

### Updates

- **Phone app:** when a newer build is out, Bops asks once. **Watch & updates → Update this phone app** downloads it, checks its fingerprint, and Android asks you to confirm. The first time, Android asks you to allow Bops to install apps.
- **Watch app:** after the phone is updated, **Send update to watch** sends the matching watch app over the watch's own link. Open Bops on the watch and tap **Install update**.
- Updates install over the old app because every build is signed with one permanent key (`android/signing/`, unlocked in CI by the `ANDROID_SIGNING_PASSWORD` secret). Builds made before that key existed need one uninstall first.

### From a PC instead
`adb pair <ip:pairing-port> <code>`, `adb connect <ip:port>`, `adb install bops-watch.apk` (Google's platform-tools).

## Updating

Open the same link again, download, and tap **Install** (or **Update**).

The release page says how this build was signed:

- **release-signed**: the new version installs over the old one. Your saved servers stay.
- **debug-signed**: Android will say the app "conflicts with an existing package" or "isn't installed". Uninstall Bops first (long-press the icon → **Uninstall**), then install the new one and pair again. This happens because no signing key has been set up for the repo yet. Once one has, updates install normally. The first release-signed build also needs this one-time uninstall.

To see the release notes and earlier details: https://github.com/Kevo919/bops/releases/tag/android-latest

## If something goes wrong

- **"App not installed"**: there's an older Bops signed with a different key on the phone. Uninstall it and install again.
- **The app can't reach the server**: check that Tailscale is on (on the phone, and on the PC or server), that Bops is running, and that the address is exactly right, including `http://` or `https://` and `:3210` for a PC address.
- **"Use your computer's Tailscale address (100.x.y.z) or an https address"**: you typed a home Wi-Fi address. See step 4.
- **The code is rejected**: it was already used or replaced. Make a new one in **Settings → Your phone → Pair a phone**.

More about the app itself: [android/README.md](../android/README.md).
