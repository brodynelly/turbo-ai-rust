# tac Conventions

Every tac skill follows these conventions, so steps can be chained by people, subagents, or scripts.
They are deliberately small, and every one can be overridden from the project's TAC section.

## Contents

- How skills find project settings
- The TAC section
- File layout
- Data contracts (test, review, run state)
- Naming

## How skills find project settings

For any value (validation commands, specs directory, default branch, docs directory), resolve in this order:

1. The **TAC section** in `CLAUDE.md` or `AGENTS.md` (or `.claude/CLAUDE.md`).
2. **Detection**: run `bash <tac-plugin>/skills/setup/scripts/detect-project.sh` (skills reference it as
   `${CLAUDE_SKILL_DIR}/../setup/scripts/detect-project.sh`). It reads manifests and prints candidates.
3. **Ask** the user, then suggest `/tac-final:setup` so the answer is written down for next time.

Never guess a command silently. A wrong validation command turns a closed loop into a false green.

## The TAC section

`/tac-final:setup` writes this block into the project's memory file. Edit it by hand any time.

```markdown
## Agentic layer (tac)

- Specs: `specs/`
- Docs: `docs/`
- Default branch: `main`
- Validate (run in order, stop at first failure):
  - lint: `npm run lint`
  - typecheck: `npx tsc --noEmit`
  - test: `npm test`
  - build: `npm run build`
- E2E (optional): `npx playwright test`
```

Omit any line that does not apply. Keep the section under 20 lines.

## File layout

| Path | Written by | Purpose | Commit it? |
| --- | --- | --- | --- |
| `specs/<type>-<slug>.md` | `plan` | Plans. `<type>` is `feature`, `bug`, `chore`, or `patch` | Yes |
| `docs/<slug>.md` | `document` | Feature docs (or the repo's existing docs directory) | Yes |
| `.tac/runs/<run-id>/state.json` | `adw`, `orchestrate` | Run state and step results | No (gitignore `.tac/runs/`) |
| `.tac/kpis.md` | `adw` | One row per run: attempts, size, result | Optional |
| `.tac/events.jsonl` | plugin hooks | Tool and subagent event log, written only when `.tac/` exists (`TAC_EVENT_LOG=off` disables) | No (gitignore) |
| `.claude/experts/<domain>/expertise.yaml` | `expert` | Agent-expert mental model | Yes |
| `.claude/worktrees/<name>/` | Claude Code (`--worktree`, `isolation: worktree`) | Isolated checkouts for parallel agents | No |

If the repo already has a spec convention (for example `docs/specs/`, `.specify/`, `.kiro/specs/`), set
`Specs:` in the TAC section to that directory instead of creating a second one.

## Data contracts

### Test result (`test` -> `tester` agent -> `adw`)

```json
[
  {"test_name": "lint", "passed": true, "execution_command": "npm run lint", "error": null},
  {"test_name": "test", "passed": false, "execution_command": "npm test", "error": "FAIL auth.test.ts: expected 200, got 401"}
]
```

Failed entries first. `error` is the shortest excerpt that identifies the failure.

### Review result (`review` -> `reviewer` agent -> `adw`)

```json
{
  "success": false,
  "summary": "Two of three acceptance criteria met; CSV header row missing.",
  "issues": [
    {"severity": "blocker", "description": "Export omits header row", "resolution": "Write header before rows in export.ts", "file": "src/export.ts"}
  ]
}
```

Severities: `blocker` (spec not met or user harmed; must fix), `tech_debt` (works, but should improve; record it),
`skippable` (polish). `success` is `true` exactly when there are no blockers.

### Run state (`.tac/runs/<run-id>/state.json`)

```json
{
  "run_id": "a1b2c3d4",
  "workflow": "plan_build_review_fix",
  "task": "Add CSV export to reports",
  "issue": null,
  "type": "feature",
  "spec": "specs/feature-csv-export.md",
  "branch": "feat/a1b2c3d4-csv-export",
  "worktree": null,
  "steps": [{"name": "plan", "status": "passed", "attempt": 1}],
  "status": "running",
  "started_at": "2026-10-22T14:03:00Z"
}
```

`status` is one of `running`, `passed`, `failed`, `escalated`. Timestamps are UTC ISO-8601.

## Naming

- Run ids: 8 lowercase hex characters.
- Branches: `<feat|fix|chore>/<run-id>-<slug>` (slug: kebab-case, at most 40 characters), unless the repo's
  memory file defines another pattern.
- Commits: Conventional Commits (`feat: ...`, `fix: ...`, `chore: ...`), unless the repo defines its own style.
