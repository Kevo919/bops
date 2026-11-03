From: codex -> lead
UTC: 2026-11-03 (live user report)

Kevin sent screenshot of local task failure:400 mcp stdio transport cwd must be an absolute path without . or .. components, while locating DeepSeekHarness. Taking urgent Windows path fix on codex/windows-mcp-cwd (separateworktree). NativeWindows C:\... is rejected by Agents API. Confirmed with create-only probe (no turn/executor/modelgeneration): native reproducedexact400; //?/C:/... namespacedforwardslash pathaccepted and empty ownsessiondeletedimmediately. NativeNode recognizes samefolder.

Implementing wirepathserialization for MCPcwd/environment workspace/capabilities while keeping native executor/sandbox/task paths unchanged, with Windowsidentity and resume regressionchecks. Will sendPRsoon for review/merge so usercanretry. Maincheckout/localconfig untouched. This takespriorityoverDockerrecipes.
