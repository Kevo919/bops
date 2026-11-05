2026-11-05T22:45Z | zai | Design note | Proposed
Kevin asked twice tonight (22:29 and 22:31): scan-a-QR pairing, and "all of the features of the desktop app" on the phone. Research done (source-read, no code changed yet) - here is the state and a plan for your assignment.

ALREADY SHIPPED (merged #77, in windows-port since 09:31):
- The Phone card (Settings) is a 3-step guide: QR to download the APK; Tailscale QR (Google Play) with same-account instructions and a Check again; a big pairing QR the Bops app scans (it leads with "Scan QR code", Google's code scanner via Play services - no camera permission needed from Bops) or the phone camera opens. Stricter pair links, no pairing without an address (e7b77e8 review fixes).
- WHY KEVIN HASN'T SEEN IT: his PC build and his phone's APK predate #77. He needs (a) the PC app rebuilt to windows-port head, (b) the new APK installed. The QR flow then replaces the find-the-address-and-type-a-code dance entirely.

TAILSCALE IN THE APP - the honest boundary:
- Tailscale is a system VPN; its login cannot live inside Bops' app (it needs VPN permission at the OS level, in Tailscale's own app). Today's flow is: scan QR -> Play Store -> install -> sign in with the SAME account as the PC. That is already about as short as it legally gets.
- A real improvement we CAN build: Tailscale auth-key join. If Kevin creates (or Bops holds) a Tailscale auth key, the PC can make a tailscale:// deep link / a one-tap join page so the phone joins the tailnet without typing the account. Needs: Tailscale API token in Keys (or Kevin pastes a key), a new endpoint, and the Phone card's step 2 gets a "Join my tailnet" button. ~2-3h. Proposing as task 66.

PHONE PARITY ("all the features of the desktop"):
- The Android app is a WebView into the same Bops web app, so screens are shared - the gap is which screens the phone exposes and how they fit. #70 (one-column layout) landed; #77 added the phone's own Settings place.
- Real gaps to close, in value order (each its own PR, needs your go):
  1. Settings on the phone: Models, Connections, Keys, Services cards are desktop-first; make each one-column and reachable from the phone's Settings place.
  2. Memory + Knowledge tab on the phone (memory-sheet fits; needs the tab reachable).
  3. Repos section + approvals on the phone (approval cards are the security-critical one to have in hand).
  4. Look by chat on the phone (the Look card fits one-column).
- What genuinely cannot move to the phone: anything that runs on the PC itself (local executor tasks on the PC hardware, the tray, desktop integration). The phone is the remote; the PC is the engine. Kevin's phrase "all features" should be answered with this boundary said plainly.

Requesting: your go on task 66 (auth-key join) and which parity PR I start first. Design-note-first per the 19 rule; nothing coded yet.
