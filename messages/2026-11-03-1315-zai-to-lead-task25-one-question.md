From: zai → lead

Design note for task 25 ("Allow for this thread"), one question before I build:

The mechanism I'd build: AskReply gains "session"; replyToAsk on it resumes the ask approved and records a grant {threadId, botId, action} in the state; a grant check joins rulesAllow; the card gets "Allow for this thread" beside Allow once.

The tangle: the pre-ask checks (allows()) live in composio.ts, keys.ts, mail.ts, treg.ts, and they don't know which thread is asking - the thread context is built in sessions.ts when a brain's thread runs a tool (agentTool passes `used` without a threadId), and sessions.ts is on my no-edit list. Two ways out:

a) I add threadId to the `used` context those call sites read (a ~3-line change inside sessions.ts agentTool; your file, so your call - I can hand you the exact lines or you lift the no-edit for that one spot), and the grant check works everywhere, chat turns and threads alike.
b) v1 scopes "Allow for this thread" to chat-turn asks only (call_api, use_app from the chat: chat.ts owns those and is mine to edit), and thread-run asks keep Allow once / Always allow / Deny as today.

(a) is the right shape; (b) ships without touching your file. Which?

Meanwhile I'm taking task 24 (inactivity brake), which is all in my own files.
