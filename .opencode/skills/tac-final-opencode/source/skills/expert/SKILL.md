---
name: expert
description: Creates and runs agent experts - per-domain expertise files (mental models) that agents read before working and update after, following Act-Learn-Reuse. Subcommands create (seed from the codebase), ask (answer from the mental model), improve (validate against code and fix drift), run (plan, build, then improve). Use for high-value or high-churn domains such as billing, auth, the data model, or a public API.
argument-hint: "[create|ask|improve|run|list] [domain] [question or task]"
allowed-tools: Read, Glob, Grep, Bash(git diff *), Bash(git log *)
---

# Agent Experts

Arguments: `$ARGUMENTS` (first word is the subcommand, second is the domain in kebab-case).

An expert is a curated **mental model** of one domain in `.claude/experts/<domain>/expertise.yaml`. It is
working memory, not documentation: the code is always the source of truth, and the file is validated against
the code every time it is improved. Agents that read it first skip most exploration.

Never hand-edit an expertise file as the main workflow; let `improve` keep it honest. Format and limits:
[references/expertise-format.md](references/expertise-format.md).

## create `<domain>` `[focus areas]` (ACT)

1. If `.claude/experts/<domain>/expertise.yaml` exists with real content, stop and suggest `improve`.
2. Delegate to the `tac-final:expertise-curator` agent: "Seed a new expertise file for <domain> (focus: <areas>)
   from the codebase using the template at `${CLAUDE_SKILL_DIR}/assets/expertise-template.yaml`. Write it to
   `.claude/experts/<domain>/expertise.yaml`. Every file path and symbol must exist."
3. Report coverage (sections filled, line count) and suggest committing the file.

## ask `<domain>` `<question>` (REUSE)

1. Read the expertise file (missing -> suggest `create`).
2. Answer from the mental model. Verify any claim the answer depends on by reading the referenced file
   (cheap, targeted reads only). If the model was wrong, say so and suggest `improve`.
3. Cite file paths in the answer.

## improve `<domain>` (LEARN)

Delegate to the `tac-final:expertise-curator` agent: "Improve `.claude/experts/<domain>/expertise.yaml`: check
`git log`/`git diff` since its `last_validated` date for changes in this domain, validate every path, symbol, and
claim against the code, fix drift, add what is missing, remove what is stale, enforce the line limit, and update
`last_validated`." Report the changes it made (added / corrected / removed).

Run `improve` after any change in the domain. `run` does this automatically.

## run `<domain>` `<task>` (plan -> build -> improve)

1. Read the expertise file, then write a plan with the `tac-final:plan` skill, giving it the relevant expertise
   sections as context.
2. Build it with the `tac-final:builder` agent (spec path) and validate with `/tac-final:test`.
3. Run `improve` for the domain so the mental model learns from the change.

For high-stakes questions, scale compute: ask 3 `tac-final:expertise-curator` agents in parallel (read-only) and
reconcile their answers.

## list

Glob `.claude/experts/*/expertise.yaml` and print each domain, line count, and `last_validated`.

## Alternative: subagent memory

Claude Code subagents support a `memory` field (`project` scope stores notes in `.claude/agent-memory/<agent>/`).
That is lighter weight and self-managed. Prefer tac experts when you want a structured, validated, reviewable
mental model of a domain; prefer `memory` for an agent's free-form learnings.
