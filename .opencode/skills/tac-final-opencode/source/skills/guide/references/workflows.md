# Workflows: SDLC, ADWs, and the Road to Zero-Touch

Condensed from TAC lessons 4-7 and 14.

## Contents

- The SDLC as questions
- Composable steps and their contracts
- AI Developer Workflows (ADWs)
- PITER: the four elements of AFK agents
- In-Loop, Out-Loop, Zero-Touch
- Agentic KPIs

## The SDLC as questions

| Step | Question it answers | tac skill | Output |
| --- | --- | --- | --- |
| Plan | What are we building? | `plan` | `specs/<type>-<slug>.md` |
| Build | Did we make it real? | `implement` | Code changes + validation run |
| Test | Does it work? | `test` | JSON results, fixes applied |
| Review | Is what we built what we planned? | `review` | JSON verdict with severities |
| Document | How does it work? | `document` | `docs/...` page |
| Ship | Is it delivered? | `ship` | Commit, branch, PR |

Testing and review are different questions. Tests prove behavior; review proves alignment with the spec.

## Composable steps and their contracts

The real secret of TAC is not the SDLC, it is **composable agentic primitives**: steps with fixed inputs and
outputs that can be chained in whatever order a problem class needs.

| Step | Input | Output contract | Done when |
| --- | --- | --- | --- |
| plan | task text (+ issue, + scout notes) | Spec file at a known path with every template section filled | File exists, has Step by Step Tasks and Validation Commands |
| build | spec path | Code changes; validation commands executed | Every task done, validation commands pass |
| test | (repo) | JSON array: `test_name, passed, execution_command, error` | All entries `passed: true` |
| review | spec path | JSON: `success`, `review_issues[]` with `blocker / tech_debt / skippable` | No blockers |
| fix | review issues or failing test JSON | Patch plan + changes | Re-run of the failing check passes |
| document | spec path + diff | Doc file path | File written |

Rules that make steps composable:

- Each step runs in a **fresh agent** (one agent, one prompt, one purpose). Fresh context frees tokens,
  forces the step's inputs to be explicit, and prepares the step to run headless.
- Steps communicate through **files at known paths**, not conversation history.
- Loops are **bounded** (default 3 attempts) and escalate to a human when the bound is hit.

## AI Developer Workflows (ADWs)

An ADW is deterministic code that orchestrates non-deterministic agents.

```text
Deterministic (script / orchestrator)     Non-deterministic (agent)
- step order, retries, attempt limits     - reasoning about the task
- file paths, ids, branch names           - writing plans and code
- state file, logs, git operations        - diagnosing failures
```

Standard compositions (used by `/tac-final:adw`):

| Workflow | Steps | Use when |
| --- | --- | --- |
| `plan_build` | plan -> build | Small, low-risk, well-understood |
| `plan_build_test` | plan -> build -> test(fix loop) | Default for most changes |
| `plan_build_review_fix` | plan -> build -> test -> review -> fix loop | You would otherwise review it yourself |
| `sdlc` | plan -> build -> test -> review -> fix -> document | Features you will ship |

Start with a workflow that is mostly in-loop. Promote it to headless only after it succeeds repeatedly.

## PITER: the four elements of AFK agents

| Element | Meaning | Practical options |
| --- | --- | --- |
| **P**rompt input | Where the task comes from | GitHub issue, a `specs/` file, a ticket |
| **T**rigger | What starts the run | You, a cron job, a webhook, `@claude` on an issue (Claude Code GitHub Action) |
| **E**nvironment | Where the agent runs safely | A git worktree, a container, a CI runner |
| **R**eview | How you check the result | A pull request (with the `review` step's JSON in the body) |

## In-Loop, Out-Loop, Zero-Touch

| Level | You are present for | Presence KPI | Move up when |
| --- | --- | --- | --- |
| In-Loop | Every step | Constant | Plans and tests are templated; the loop mostly works |
| Out-Loop | Prompt + PR review | Two touches | 85%+ of runs finish without a retry; tests catch regressions before review |
| Zero-Touch | Prompt only | One touch | 90%+ success over 20+ runs; review rarely finds new issues; rollback tested |

Zero-touch is a direction, not a switch. Keep humans on irreversible actions (merging to protected branches,
deploys, migrations) until the KPIs say otherwise. For a governed zero-touch pipeline with hooks and readiness
gates, see the separate `zte` plugin in this marketplace.

## Agentic KPIs

| KPI | Want | Measured as |
| --- | --- | --- |
| Attempts | Down | Re-plans or patch rounds per task |
| Size | Up | Lines of plan / diff an agent delivers per run |
| Streak | Up | Consecutive runs with attempts <= 2 |
| Presence | Down | Human touches per task |

`/tac-final:adw` appends one row per run to `.tac/kpis.md`; `/tac-final:assess` reads it.
