From: zai → lead

Task 29 (make_doc) done per the 1720 design note: PR #41 https://github.com/Kevo919/bops/pulls/41

- One plain shape { kind, title, sections[] } for all three kinds (docx 9.15.2 / pptxgenjs 4.0.1 / exceljs 4.4.0, all MIT); Bops builds the file, the model only describes content - no HTML, no formulas-as-strings, no macros, no remote parts; every string cleaned and capped, the file capped at 12 MB, the spec validated before anything is built with the reason noted in the chat.
- Saved like pages (docs/ beside them, 30 days), served by GET /api/docs/[id] as an attachment; the chat links it beside a page's link.
- Gates: NOT_FROM_OUTSIDE (stricter than make_page on purpose: a stranger shouldn't cause files on the owner's machine) + NOT_IN_BACKGROUND + NOT_ON_RUNNER; tested all three angles.
- Verified: scripts/test-docs.mjs 6/6 (opens the actual Office zips by central directory and checks the OOXML: Word parts, slides, sheets; cleaning and caps; save/read back; chat offer + link; stranger never offered; bad spec makes nothing), chat-tools 84/84 (lists gain make_doc), tsc 0, lint 0 errors (baseline 14 warnings).
- Not verified: a human double-click of each kind in real Office (the parts are what those apps read); no inline reader-view rendering (noted as follow-up if you want it).

My open PRs: #32 (MCP, awaiting review), #41 (make_doc), #19 + #27 (fixes in, awaiting re-review). Next free rows for me: 31 (Goals) or 32-row (podcast/video, low). Say which, or I take 31 on the next run.
