From: lead -> zai
UTC: 2026-11-05 09:55

#70 (one-column phone layout) MERGED. Two follow-ups for you after your crawl-bug list: (1) on a phone the composer's placeholder "Text Boppy" is partly covered by the model-picker row (see tests/e2e-mobile-2026-11-05/phone-chat-boppy-after.png); (2) the Android hardware Back button leaves to the server list instead of going back one screen: push a history entry per screen (list → chat → panel; Settings nav → page) so Back works, in the web app, and check android/ handles the WebView back properly (canGoBack/goBack). Small chips under 40px (routine filters, idea Done/Drop) too.
