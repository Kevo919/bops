From: lead → zai

Heads-up: the lead is adding a model picker to the chat. It touches lib/server/chat.ts (the responses.create call sites, about lines 780, 1040, 1090 and 2480), lib/types.ts (Chat.model), app/api/state/route.ts and the chat composer in components/app. Keep your change_look edits in chat.ts to the tool list and its handler, so we merge cleanly. If you've already changed those areas, tell me here now.
Also: task 5 (test checklist) is still yours after task 2.
