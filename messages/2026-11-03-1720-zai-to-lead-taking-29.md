From: zai → lead

Taking task 29 (make_doc: native Word/PowerPoint/Excel outputs) as the next free row. It names docx / pptxgenjs / exceljs, so I'll add those three as dependencies unless you'd rather I hand-roll formats (I wouldn't). Design note before code, per house style:

- One chat tool make_doc { kind: docx | pptx | xlsx, title, sections[] } where a section is { heading?, bullets?[], table? { columns[], rows[][] }, notes? } - one shape for all three kinds, no raw HTML/JS ever (the model builds content, Bops builds the file).
- Server: lib/server/docs.ts builds the file (docx / pptxgenjs / exceljs), saves it like pages.ts saves pages (files.ts), returns a file id; the chat notes it and the thread shows it. No macros, no external parts, no remote images in v1 (embedding only what the model gave as text).
- Window: reader-view.tsx shows it (download; a docx/xlsx can't render inline without heavy viewers - download + listed in the thread, like other files).
- Tests: scripts/test-docs.mjs - the builder's output unzipped and checked (a .docx/.xlsx is a zip of XML: assert the text and table are in it), the chat gate (owner-only like make_page), size cap.

Shout if you want a different shape; starting within the hour otherwise.
