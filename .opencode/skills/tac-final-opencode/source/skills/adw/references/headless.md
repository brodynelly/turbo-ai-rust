# Headless ADWs (Out-Loop)

`scripts/adw.sh` is a deterministic ADW: bash owns step order, retries, run state, and git; every step is a
fresh `claude -p` agent that uses one tac skill. Run `bash adw.sh --help` for all options.

## Contents

- Quick start
- How a run works
- Permissions
- Triggers (PITER)
- Safety checklist

## Quick start

```bash
ADW="$(find ~/.claude/plugins -path '*tac-final/skills/adw/scripts/adw.sh' | head -1)"   # installed plugin copy
bash "$ADW" --dry-run "Add CSV export to the reports page"         # print the steps, change nothing
bash "$ADW" -w plan_build_review_fix --worktree "Add CSV export"   # isolated run, no commit
bash "$ADW" -w sdlc --worktree --pr --issue 123                    # issue in, PR out
```

Inside a Claude Code session the path is available as `${CLAUDE_SKILL_DIR}/scripts/adw.sh` (the `adw` skill prints it).

## How a run works

```text
plan  -> "SPEC: <path>"          (tac-final:plan)
build -> "BUILD: DONE|REPLAN|FAILED" (tac-final:implement; anything but DONE fails the run)
test  -> "TESTS: PASS|FAIL"      (tac-final:test, with its own fix loop)
review-> "REVIEW: PASS|FAIL"     (tac-final:review --patch) --FAIL--> fix (tac-final:implement patch) -> test -> review
document                         (tac-final:document, sdlc only)
--pr  -> commit, push, gh pr create
```

- Steps communicate only through files and the marker lines above, so each agent starts with a clean context.
- Logs: `.tac/runs/<run-id>/<step>-<attempt>.log`; state: `.tac/runs/<run-id>/state.json`; KPIs: `.tac/kpis.md`.
- Exit code 0 means passed; 1 means failed or escalated (read the logs, fix the plan or the leverage point,
  re-run with `--spec <path>` to skip planning).
- `--worktree` creates `.claude/worktrees/adw-<run-id>` on branch `adw/<run-id>`. Worktrees from headless runs
  are not removed automatically: `git worktree remove <path>` when done. Untracked files such as `.env` are not
  copied into the worktree; provide them if your tests need them.

## Permissions

Headless steps cannot answer permission prompts. Grant exactly what the workflow needs through `TAC_CLAUDE_ARGS`
(default `--permission-mode acceptEdits`, which allows file edits but not arbitrary shell commands):

```bash
export TAC_CLAUDE_ARGS='--permission-mode acceptEdits --max-turns 60 --allowedTools "Bash(npm run *)" "Bash(npx tsc *)" "Bash(git diff *)" "Bash(git status *)"'
```

Alternatives: add the same rules to `permissions.allow` in the project's `.claude/settings.json`, or run inside a
disposable container or CI runner where broader permissions are acceptable. Prefer allowlists over skipping
permission checks entirely.

The plugin must be available to the headless `claude`. If it is not installed for the user running the script
(for example in CI), add `--plugin-dir <path-to-tac>` to `TAC_CLAUDE_ARGS`.

## Triggers (PITER)

| Element | Option |
| --- | --- |
| Prompt input | `--issue <n>` (GitHub issue), a task string, or `--spec <path>` |
| Trigger | You, `cron`, a webhook handler, or a CI workflow on `issues: [labeled]` |
| Environment | `--worktree` locally; a CI runner or container for unattended runs |
| Review | `--pr` opens a pull request; humans (or a review bot) approve |

A ready-to-copy GitHub Actions workflow is bundled at
[../assets/github-action-adw.yml](../assets/github-action-adw.yml): label an issue `adw` and the job installs Claude
Code and this plugin, runs `adw.sh -w plan_build_review_fix --pr --issue <n>`, uploads `.tac/` logs as an artifact,
and comments on the issue if the run fails. Copy it to `.github/workflows/tac-adw.yml`, add an `ANTHROPIC_API_KEY`
secret, pin `PLUGIN_REF`, and adapt the `--allowedTools` list to your validation commands.

For interactive triggers (`@claude` in issue and PR comments), the official
[Claude Code GitHub Action](https://code.claude.com/docs/en/github-actions) is the simpler route; point its prompt
at the same tac skills.

## Safety checklist

- Start in-loop (`/tac-final:adw` in a session) and move a workflow headless only after it passes repeatedly.
- Always `--worktree` or a disposable environment for unattended runs.
- Keep `--pr` (human review) until KPIs justify more: see the zero-touch gates in
  [../../guide/references/workflows.md](../../guide/references/workflows.md#in-loop-out-loop-zero-touch).
- Bound every run: `--max-turns` in `TAC_CLAUDE_ARGS`, `--max-fix` for review rounds.
- Keep the plugin guardrail hooks on (`TAC_GUARDRAILS` unset or `on`): they deny catastrophic commands and ask
  before force pushes, hard resets, and secret-file edits. In headless runs an "ask" cannot be answered, so the
  action is refused, which is the safe outcome.
- Never give headless agents production credentials; the script never merges or deploys.
