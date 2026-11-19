# Release notes

User-visible changes to **dsh-dev-hub**. Dates are in the author's local time zone.

## 0.1.0 — 2026-11-19

### Added

- A dedicated **Requirement clarification** workspace for drafts that are not yet flows, with status, resume, new and delete actions.
- Three-step onboarding on an empty workbench, plus clarification-first navigation.
- **Refactor** as a fourth flow type, with its own plan template: preserve behavior, add a safety net, split changes and update callers.
- **Automation settings** with a left-hand section navigation:
  - full automation by default;
  - manual step-by-step mode;
  - an independent-review on/off switch;
  - automation stops before submit/push.
- Size-aware independent review: S skips review, M uses one reviewer, L/XL uses two; review can be disabled globally.
- Review round limit (3) after which the decision returns to the user instead of looping automatically.
- Explicit manual review override, reviewer correction hand-off, and a re-review path.
- Clickable image attachment previews in clarification chats; sent attachments are cleared from the composer.
- Pluggable locale dictionaries under `locale/*.json`, with English/Chinese UI switching.

### Changed

- Clicking a repository card switches the target only; it no longer reopens that repository's last flow.
- Worktree submissions push back to the branch the flow started from (or a new branch when selected), rebasing onto the remote tip when needed.
- A running review is treated as **in progress**, not as work waiting for the user.
- Clarification questions now support true multi-select, including legacy questions that only say “multi-select” in their text.

### Fixed

- Manual review approval now keeps the flow on the post-review path instead of falling back to development.
- Aborted reviewer sessions are retried once, use a longer timeout, and report the underlying diagnostic.
- Clarification JSON survives fenced blocks, trailing commas, smart quotes and truncated output; long prompts are bounded and fall back to a compact retry before local rules.
- Rapid repository/flow switching no longer renders the previous flow's details.
- Empty workspaces no longer show duplicate “start” calls to action.
