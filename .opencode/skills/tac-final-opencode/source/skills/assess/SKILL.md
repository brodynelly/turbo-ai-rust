---
name: assess
description: Audits a repository's agentic layer - scores the 12 leverage points, grades the layer on TAC's 3-class scale, checks context health and In-Loop/Out-Loop/Zero-Touch readiness from KPIs - and returns the three highest-leverage next moves. Read-only. Use when agents underperform or keep failing the same way, before investing in automation, or to track agentic-layer progress over time.
argument-hint: "[leverage|layer|context|zte|all]"
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep, Bash(git log *), Bash(git ls-files *), Bash(wc *), Bash(ls *)
---

# Assess the Agentic Layer

Audit the repository in the current working directory. Read-only: change nothing. Scope is `$ARGUMENTS`
(default `all`). Every score must cite evidence (a file path or command output); never estimate.

## 1. Gather evidence

```bash
bash "${CLAUDE_SKILL_DIR}/../setup/scripts/detect-project.sh"
git log --oneline -30
ls specs .tac .claude 2>/dev/null
```

Also read: the memory files the script lists (CLAUDE.md, AGENTS.md), `.tac/kpis.md` if present, and a sample
of 2-3 recent `specs/` files.

## 2. Score the 12 leverage points (scope: `leverage`)

Score each 0-2 (0 missing, 1 partial, 2 strong) using the checks in
[../guide/references/doctrine.md](../guide/references/doctrine.md#the-12-leverage-points). Evidence to look for:

| Lever | Look for |
| --- | --- |
| Context | Memory file exists, under ~200 lines, contains runnable commands; priming exists |
| Model | Agent definitions choose models deliberately (haiku for recon, larger for planning) |
| Prompt | Reusable prompts/skills in `.claude/skills`, `.claude/commands`, or this plugin in use |
| Tools | Validation commands are allowed or documented; MCP config is lean |
| Standard out | Errors are logged with context; scripts print useful failure output |
| Types | Typed language or schemas at boundaries |
| Docs | Agent-oriented docs say how to run, test, and where things live |
| Tests | One command runs a meaningful suite; run it if cheap and report pass/fail |
| Architecture | Consistent, navigable layout; files reasonably small |
| Plans | `specs/` exists and is used in recent history |
| Templates | Plans share formats (tac templates or project templates) |
| ADWs | A command or script chains plan, build, and validate |

## 3. Grade the layer (scope: `layer`)

Find the highest grade whose requirements are met *and* all grades below it are met, using
[../guide/references/agentic-layer.md](../guide/references/agentic-layer.md#grading-the-layer-3-classes).

## 4. Context health (scope: `context`)

- Memory files: line counts, contradictions, stale commands (commands that no longer exist in manifests).
- MCP servers configured in `.mcp.json` and whether the repo uses them.
- Count of always-on skills and agents in `.claude/` (each description costs context every turn).

## 5. ZTE readiness (scope: `zte`)

From `.tac/kpis.md` (if missing, say so and recommend running work through `/tac-final:adw` to start measuring):
success rate without retry, current streak, average attempts. Compare to the gates in
[../guide/references/workflows.md](../guide/references/workflows.md#in-loop-out-loop-zero-touch).

## Output

```markdown
## Agentic Layer Assessment - <repo> (<date>)

**Leverage score:** <n>/24  **Layer grade:** Class <c> Grade <g>  **ZTE level:** <In-Loop|Out-Loop|Zero-Touch|unmeasured>

| Lever | Score | Evidence |
| --- | --- | --- |
| ... | 0-2 | <path or command result> |

### Context health
<3-5 bullets>

### Top 3 next moves
1. <highest leverage fix> - why, and the exact tac command or edit (for example `/tac-final:setup`, `/tac-final:expert create billing`)
2. ...
3. ...
```

Rank next moves by leverage: missing validation commands and missing tests outrank everything else, because
every other improvement depends on agents being able to check their work.
