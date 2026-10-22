# Governing Agents with Hooks

Instructions in prompts and CLAUDE.md are requests. Hooks are deterministic: Claude Code runs them on events and
can block the action. Use them for rules that must hold every time.

| Goal | Event | Behavior |
| --- | --- | --- |
| Block destructive shell commands | `PreToolUse` (matcher `Bash`) | Exit code 2 blocks the call; stderr is shown to Claude |
| Protect paths (`.env`, migrations, lockfiles) | `PreToolUse` (matcher `Edit\|Write`) | Block or require confirmation |
| Audit trail | `PostToolUse` | Append tool name and input to a JSONL log |
| Enforce a test gate before stopping | `Stop` | Run validation; block stopping while it fails |

Example `.claude/settings.json` entry and script:

```json
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash .claude/hooks/block-dangerous.sh"}]}
    ]
  }
}
```

```bash
#!/usr/bin/env bash
# .claude/hooks/block-dangerous.sh - reads the hook JSON on stdin
cmd="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"
if printf '%s' "$cmd" | grep -Eq 'rm -rf /|git push (-f|--force)|git reset --hard|DROP (TABLE|DATABASE)'; then
  echo "Blocked by policy: $cmd" >&2
  exit 2
fi
exit 0
```

Notes:

- Verify event names and input fields against the current [hooks reference](https://code.claude.com/docs/en/hooks)
  before relying on them.
- Plugin-shipped agents ignore `hooks`, `mcpServers`, and `permissionMode` in their frontmatter; configure these
  in project or user settings instead.
- tac-final already ships plugin-level guardrails (`hooks/hooks.json`): it denies catastrophic shell commands, asks
  before force pushes, hard resets, `git clean`, destructive SQL, and edits to secret files, and logs events to
  `.tac/events.jsonl` in repos that have a `.tac/` directory. Turn them off with `TAC_GUARDRAILS=off` and
  `TAC_EVENT_LOG=off`. Add project hooks for rules specific to your codebase.
- For observability across many agents, log hook events to JSONL first; dashboards come later (see the
  `claude-code-observability` plugin in this marketplace).
