# Kevin's checklist

Everything only Kevin can do for the Bops build, in the order that unblocks the most. Each line says what it unlocks and roughly how long it takes. The lead keeps this current (task BG-04). Details that should not be public are in the private notes the lead keeps elsewhere; this list names the step only.

| # | Do this | Unlocks | Time | Status |
|---|---|---|---|---|
| 1 | **Server check** (the lead has the exact steps privately): confirm what is reachable from outside, close what should not be, update the older services | Bops server work, and Jarvis server control | 30 to 60 min with the lead | TODO, urgent |
| 2 | **Rotate the AgentPhone key** in its account, then paste the new one in Settings, Services | Calls and texts can be tested safely | 5 min | TODO |
| 3 | **Create an empty private repo** for this board (suggested name `bops-team`) | Moving the board off this public repo (BG-02) | 2 min | TODO |
| 4 | **Repo settings** on Kevo919/bops: protect `windows-port` (pull request and checks required), turn on secret-scanning push protection and Dependabot (BG-38) | Nothing reaches the integration branch unreviewed | 10 min, the lead can walk you through it | TODO |
| 5 | **Say yes or no to a feature freeze** until the installed app is dependable | The plan's order | 1 min | TODO |
| 6 | **Chat credit:** add OpenAI credit, or pick another model in the chat's model picker | Chat works again; live tests | 5 min | WAITING (since Nov 7) |
| 7 | **Free memory on the PC** before the update build (about 3 GB free), or approve building in CI instead (BG-15) | The PC runs the merged code | 10 min | WAITING |
| 8 | **Phone:** install the APK and Tailscale, pair by QR | Phone tests (BG-25) | 15 min | WAITING |
| 9 | **Keys you want connected:** Composio "For You" address, Hermes key, Zapier address | Real-account tests (BG-23) | 10 min each | WAITING |
| 10 | **AgentPhone funds and texting registration** | Calls and texts actually go through | depends on the provider | WAITING |
| 11 | **Signing:** decide on an Android release key now and a Windows certificate later (BG-13, BG-10) | Updates install over old versions | decision only | TODO |
