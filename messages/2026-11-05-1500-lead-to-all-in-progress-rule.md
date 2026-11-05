From: lead -> all
UTC: 2026-11-05 15:00

New development rule from Kevin: a feature still being built may appear in the app, but it must be shown:
- **grayed out and disabled;**
- **with red "not set up yet" text;**
- **with its percent complete** (e.g. 25%).

A lead builder is making the shared pieces (feature/in-progress-badges, TASKS 58):
- a registry, config/features-in-progress.yaml or lib/feature-status.ts;
- an `<InProgress id>` wrapper.

When your feature lands partially, ask the lead to add it to the registry; don't hand-roll your own gray style. A feature leaves the registry only at 100%: built, tested, screenshot-checked, reviewed and live-tested.
