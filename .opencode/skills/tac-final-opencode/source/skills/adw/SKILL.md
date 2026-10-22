---
name: adw
description: Runs an AI Developer Workflow - chains plan, build, test, review, fix, and document steps for one task, each in a fresh specialized subagent, with run state in .tac/runs/ and bounded fix loops. Also provides a headless script (claude -p) for running the same workflow from CI, cron, or issue triggers. Use for end-to-end delivery of a task with one command, or when asked to automate the plan-build-test-review loop.
argument-hint: "[plan_build|plan_build_test|plan_build_review_fix|sdlc] [task | #issue | spec-path]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(mkdir -p .tac/*)
---

# AI Developer Workflow

Arguments: `$ARGUMENTS`. You are the orchestrator: deterministic about order, state, and limits; you delegate
all reasoning-heavy work to subagents so this context stays small.

## Workflows

| Workflow | Steps | Default when |
| --- | --- | --- |
| `plan_build` | plan, build | Tiny, low-risk change |
| `plan_build_test` | plan, build, test | **Default** if no workflow is named |
| `plan_build_review_fix` | plan, build, test, review, fix loop | Anything you would review yourself |
| `sdlc` | plan, build, test, review, fix loop, document | Features headed for a PR |

If the input is an existing spec path, skip plan. Background: [../guide/references/workflows.md](../guide/references/workflows.md).

## 0. Initialize

1. Generate a run id (8 hex chars, for example from `date +%s | sha256sum | head -c 8`, or invent one).
2. Create `.tac/runs/<run-id>/state.json` per the run-state contract in
   [../guide/references/conventions.md](../guide/references/conventions.md#run-state-tacrunsrun-idstatejson).
   Update it after every step (`steps[]`, `status`). Suggest adding `.tac/runs/` to `.gitignore` if it is not ignored.
3. Confirm validation commands exist (TAC section). If none, stop and recommend `/tac-final:setup`: a workflow
   without a test step cannot close its loop.
4. Warn if on the default branch with a dirty tree; recommend a branch or `claude --worktree <name>` session.

## 1. Plan

Delegate to the `tac-final:planner` agent: "Plan this task: <task>. Templates are in
`${CLAUDE_SKILL_DIR}/../plan/assets/`. Save to the specs directory and end with `SPEC: <path>`." Record `spec` and `type` in state. Verify the file
exists and contains `## Step by Step Tasks` and `## Validation Commands`; if not, retry once, then escalate.

**Checkpoint:** in an interactive session, show the plan summary and ask "build it?" unless the user said
to run unattended. Reviewing the plan is the highest-leverage human touch.

## 2. Build

Delegate to the `tac-final:builder` agent with the spec path. It implements, runs the plan's validation commands, and
returns a summary plus `git diff --stat` and a `BUILD:` verdict. Only `BUILD: DONE` passes the step.
`BUILD: REPLAN` -> back to step 1 with its feedback (counts as an attempt). `BUILD: FAILED` or no verdict -> mark the
run `failed` and report.

## 3. Test (closed loop)

Delegate to the `tac-final:tester` agent. It returns the test JSON. If anything still fails after its own 3 attempts,
mark the run `escalated` and stop.

## 4. Review and fix loop (`plan_build_review_fix`, `sdlc`)

Delegate to the `tac-final:reviewer` agent with the spec path; it returns the review JSON. While there are blockers and
fix attempts < 3:

1. Delegate to the `tac-final:planner` agent: "Write a patch plan for these blockers against <spec>", then to the
   `tac-final:builder` agent with the patch plan, then the `tac-final:tester` agent.
2. Re-run the reviewer.

Still blocked after 3 attempts -> `escalated`, with the remaining blockers in the report.

## 5. Document (`sdlc`)

Delegate to the `tac-final:documenter` agent with the spec path.

## 6. Finish

1. Set `status` to `passed`, `failed`, or `escalated` and record the end time.
2. Append a KPI row to `.tac/kpis.md` (create it with the header if missing):

   ```markdown
   | Date | Run | Workflow | Type | Attempts | Plan lines | Diff +/- | Result |
   | --- | --- | --- | --- | --- | --- | --- | --- |
   ```

   Attempts = 1 + re-plans + patch rounds. Plan lines from `wc -l <spec>`; diff from `git diff --shortstat`.
3. Report, then suggest `/tac-final:ship <spec>`. Do not commit or push yourself: shipping stays a deliberate step.

```markdown
## ADW <run-id>: <passed|failed|escalated>
| Step | Result | Notes |
| --- | --- | --- |
| plan | pass | specs/feature-x.md |
| build | pass | 6 files, +210/-14 |
| test | pass | 4/4 green |
| review | pass | 0 blockers, 1 tech_debt |
- Next: `/tac-final:ship specs/feature-x.md`
```

## Headless (out-loop)

To run the same workflow without a session - from a terminal, cron, or CI - use the bundled script, which
drives `claude -p` step by step and can create a worktree, commit, and open a PR:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/adw.sh" --help
```

See [references/headless.md](references/headless.md) for permissions, triggers, and safety. To run ADWs from GitHub
issues, copy [assets/github-action-adw.yml](assets/github-action-adw.yml) into `.github/workflows/`.
