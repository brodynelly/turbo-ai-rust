---
name: tac-final-opencode
description: Use the Tac final workflow skills adapted for OpenCode—guide, setup, assess, prime, plan, implement, test, review, document, ship, ADW, orchestrate, expert, prompt, and agent design. Invoke only the workflow needed; confirm before consequential project changes, publishing, or other external side effects.
---

# TAC Final for OpenCode

This is a project-local OpenCode adaptation of the `tac-final` Claude Code plugin. It makes the workflow instructions discoverable as one OpenCode skill; it does not install Claude Code's plugin runtime or reproduce its automatic hooks, output style, slash commands, trigger evals, or seven native subagents.

## Use the workflows

Use the workflow reference when selecting and sequencing TAC tasks. Follow only the selected source skill's relevant procedure; its original instructions remain the detailed source for its workflow.

- `guide`: orient in TAC and choose a next workflow.
- `setup`: inspect and propose a minimal agent-ready setup. Preserve existing instructions and configuration; show proposed changes before editing unless the user has already approved them.
- `assess`: read-only agentic-layer assessment.
- `prime`: load task-relevant context.
- `plan`: create or refine an implementation plan/spec.
- `implement`: implement an approved plan and run suitable validation.
- `test`: run the project's checks and report results; do not hide failures.
- `review`: compare changes against the task/spec and report prioritized findings.
- `document`: document completed changes.
- `ship`: prepare delivery. Never push, publish, open a PR, or merge without explicit user authorization for that action.
- `adw`: coordinate a selected multi-step development workflow; get approval before delegating broad changes or performing external side effects.
- `orchestrate`: plan parallel work. OpenCode agents/worktrees must be configured and available; do not claim Claude subagents or plugin guardrails are active.
- `expert`, `prompt`, `agent`: build or improve reusable domain expertise, prompts, or agent designs.

## OpenCode-specific constraints

- OpenCode loads this skill through its normal skill discovery. Its directory determines the skill ID: `tac-final-opencode`.
- The original skill documents use Claude-specific metadata and references such as `CLAUDE_SKILL_DIR`, `Bash(...)`, `$ARGUMENTS`, Claude plugin commands, and `/tac-final:<name>`. Treat these as source-platform details, not OpenCode capabilities. Resolve references relative to the vendored `source/` directory; adapt tool use to the current OpenCode tools and permissions.
- The bundled shell scripts are bash-oriented. Inspect before suggesting execution; on Windows, check for an available compatible shell and dependencies. Do not assume Git Bash is installed.
- OpenCode has its own agent and plugin configuration. No agents, plugins, hooks, shell permissions, or project setup are enabled by this skill. Do not weaken permissions or create project scaffolding without user approval.
- Preserve local work. Before editing, inspect the working tree and relevant files; do not overwrite user changes.

## Source workflows

The vendored source copies are in `source/skills/`:

- `guide/SKILL.md`
- `setup/SKILL.md`
- `assess/SKILL.md`
- `prime/SKILL.md`
- `plan/SKILL.md`
- `implement/SKILL.md`
- `test/SKILL.md`
- `review/SKILL.md`
- `document/SKILL.md`
- `ship/SKILL.md`
- `adw/SKILL.md`
- `orchestrate/SKILL.md`
- `expert/SKILL.md`
- `prompt/SKILL.md`
- `agent/SKILL.md`

Read the selected source workflow and its needed neighboring references/assets before applying its detailed steps. Interpret all platform-specific commands and safeguards through OpenCode's actual capabilities; never treat copied Claude Code permissions or hooks as active controls.
