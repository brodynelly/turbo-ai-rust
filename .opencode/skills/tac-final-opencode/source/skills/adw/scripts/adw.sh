#!/usr/bin/env bash
# adw.sh - headless AI Developer Workflow for any git repo.
#
# Deterministic code owns the order, retries, state, and git operations; each step is a fresh
# `claude -p` agent that uses the tac plugin's skills. See ../references/headless.md.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: adw.sh [options] <task description>
       adw.sh [options] --issue 123
       adw.sh [options] --spec specs/feature-x.md

Options:
  -w, --workflow NAME  plan_build | plan_build_test (default) | plan_build_review_fix | sdlc
  -s, --spec PATH      Skip planning and build an existing spec
  -i, --issue N        Use GitHub issue N as the task (requires gh)
      --worktree       Run in .claude/worktrees/<run-id> on a new branch (keeps your checkout untouched)
      --pr             When the run passes: commit, push, and open a PR (requires gh; needs --worktree
                       or a clean working tree at start)
      --max-fix N      Maximum review-fix rounds (default 3)
      --dry-run        Print each claude invocation instead of running it
  -h, --help           Show this help

Environment:
  CLAUDE_BIN           Claude Code executable (default: claude)
  TAC_CLAUDE_ARGS      Extra arguments for every step (default: --permission-mode acceptEdits).
                       Steps must be able to run your validation commands; allow them with, e.g.,
                       TAC_CLAUDE_ARGS='--permission-mode acceptEdits --allowedTools "Bash(npm test *)"'

Output: run state and step logs in .tac/runs/<run-id>/, one KPI row in .tac/kpis.md.
Exit codes: 0 passed, 1 failed or escalated, 2 usage or environment error.
USAGE
}

die() { echo "adw: $*" >&2; exit 2; }
log() { printf '[adw %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

# --- arguments ----------------------------------------------------------------
workflow="plan_build_test"; spec=""; issue=""; use_worktree=0; open_pr=0; max_fix=3; dry_run=0; task=""
while [ $# -gt 0 ]; do
  case "$1" in
    -w|--workflow) workflow="${2:?}"; shift 2 ;;
    -s|--spec) spec="${2:?}"; shift 2 ;;
    -i|--issue) issue="${2:?}"; shift 2 ;;
    --worktree) use_worktree=1; shift ;;
    --pr) open_pr=1; shift ;;
    --max-fix) max_fix="${2:?}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; task="$*"; break ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) task="${task:+$task }$1"; shift ;;
  esac
done
case "$workflow" in plan_build|plan_build_test|plan_build_review_fix|sdlc) ;; *) die "unknown workflow: $workflow" ;; esac
[ -n "$task$spec$issue" ] || { usage >&2; exit 2; }

claude_bin="${CLAUDE_BIN:-claude}"
claude_args="${TAC_CLAUDE_ARGS:---permission-mode acceptEdits}"
# Headless steps cannot answer prompts, so the tac skills this script calls are always pre-approved.
skill_rules=""
for sk in plan implement test review document; do skill_rules="$skill_rules \"Skill(tac-final:$sk)\" \"Skill(tac-final:$sk *)\""; done
[ "$dry_run" = 1 ] || command -v "$claude_bin" >/dev/null 2>&1 || die "'$claude_bin' not found; install Claude Code or set CLAUDE_BIN"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"
cd "$(git rev-parse --show-toplevel)"

if [ -n "$issue" ]; then
  command -v gh >/dev/null 2>&1 || die "--issue requires the gh CLI"
  task="GitHub issue #$issue: $(gh issue view "$issue" --json title,body --template '{{.title}}{{"\n\n"}}{{.body}}')"
fi
if [ "$open_pr" = 1 ]; then
  command -v gh >/dev/null 2>&1 || die "--pr requires the gh CLI"
  if [ "$use_worktree" = 0 ] && [ -n "$(git status --porcelain)" ]; then
    die "--pr needs a clean working tree (or --worktree) so only this run's changes are committed"
  fi
fi

# --- run setup -------------------------------------------------------------
run_id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
repo_root="$PWD"
run_dir="$repo_root/.tac/runs/$run_id"
[ "$dry_run" = 1 ] && run_dir="$(mktemp -d)"
mkdir -p "$run_dir"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
steps_json=""; status="running"; attempts=1; branch="$(git branch --show-current)"; worktree=""

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\t' '  '; }
write_state() {
  cat > "$run_dir/state.json" <<STATE
{
  "run_id": "$run_id",
  "workflow": "$workflow",
  "task": "$(json_escape "${task:-$spec}")",
  "issue": ${issue:-null},
  "spec": "$(json_escape "$spec")",
  "branch": "$(json_escape "$branch")",
  "worktree": "$(json_escape "$worktree")",
  "steps": [${steps_json}],
  "status": "$status",
  "started_at": "$started_at"
}
STATE
}
record_step() { # name status attempt
  steps_json="${steps_json:+$steps_json, }{\"name\": \"$1\", \"status\": \"$2\", \"attempt\": $3}"
  write_state
}
write_state

if [ "$use_worktree" = 1 ] && [ "$dry_run" = 0 ]; then
  base="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || git branch --show-current)"
  branch="adw/$run_id"
  worktree=".claude/worktrees/adw-$run_id"
  log "creating worktree $worktree on branch $branch (from $base)"
  git worktree add -q -b "$branch" "$worktree" "$base"
  cd "$worktree"
  write_state
fi

# --- step runner -------------------------------------------------------------
# step <name> <attempt> <prompt> ; output saved to $run_dir/<name>-<attempt>.log, echoed on stdout
step() {
  local name="$1" attempt="$2" prompt="$3" out="$run_dir/$1-$2.log"
  log "step $name (attempt $attempt)"
  if [ "$dry_run" = 1 ]; then
    printf '%s -p %q --allowedTools%s %s\n' "$claude_bin" "$prompt" "$skill_rules" "$claude_args" >&2
    printf 'SPEC: specs/dry-run.md\nBUILD: DONE\nTESTS: PASS\nREVIEW: PASS\n'
    return 0
  fi
  # shellcheck disable=SC2086  # TAC_CLAUDE_ARGS is intentionally word-split
  if ! eval "\"$claude_bin\" -p \"\$prompt\" --allowedTools $skill_rules $claude_args" < /dev/null > "$out" 2>&1; then
    log "step $name: claude exited non-zero (see $out)"
    return 1
  fi
  cat "$out"
}
marker() { { grep -Eo "^$1: *[^ ]+" || true; } | tail -1 | sed -E "s/^$1: *//"; } # last "KEY: value" line on stdin
diffstat() { git diff --shortstat HEAD 2>/dev/null | awk '{a=0; d=0; for (i=1; i<=NF; i++) { if ($(i+1) ~ /^insertion/) a=$i; if ($(i+1) ~ /^deletion/) d=$i } print "+" a "/-" d}'; }

finish() {
  status="$1"; write_state
  if [ "$dry_run" = 1 ]; then log "dry run finished ($status); nothing was recorded"; rm -rf "$run_dir"; exit 0; fi
  local plan_lines="-" diff="${shipped_diff:-$(diffstat)}"
  if [ -n "$spec" ] && [ -f "$spec" ]; then plan_lines="$(wc -l < "$spec" | tr -d ' ')"; fi
  local kpis="$repo_root/.tac/kpis.md"
  if [ ! -f "$kpis" ]; then
    printf '| Date | Run | Workflow | Type | Attempts | Plan lines | Diff | Result |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' > "$kpis"
  fi
  printf '| %s | %s | %s | %s | %s | %s | %s | %s |\n' "$(date -u +%Y-%m-%d)" "$run_id" "$workflow" \
    "$(basename "${spec:-unknown}" | cut -d- -f1)" "$attempts" "$plan_lines" "${diff:--}" "$status" >> "$kpis"
  log "run $run_id: $status (state: $run_dir/state.json)"
  [ "$status" = passed ] && exit 0 || exit 1
}

# --- workflow ------------------------------------------------------------------
if [ -z "$spec" ]; then
  out="$(step plan 1 "Use the tac-final:plan skill to write an implementation plan for the task below. Do not implement it. End your response with the line 'SPEC: <path>'.

Task: $task")" || finish failed
  spec="$(printf '%s\n' "$out" | marker SPEC)"
  if [ "$dry_run" = 0 ] && { [ -z "$spec" ] || [ ! -f "$spec" ]; }; then
    log "plan step did not produce a spec file"; record_step plan failed 1; finish failed
  fi
  record_step plan passed 1
fi

# build_step <name> <attempt> <plan>: passes only on an explicit "BUILD: DONE" verdict from the implement skill.
build_step() {
  local res verdict
  res="$(step "$1" "$2" "Use the tac-final:implement skill to implement the plan at $3. Run its validation commands. Do not commit. End your response with exactly one line: 'BUILD: DONE', 'BUILD: REPLAN - <reason>', or 'BUILD: FAILED - <command>'.")" || return 1
  verdict="$(printf '%s\n' "$res" | marker BUILD)"
  [ "$verdict" = DONE ] || { log "step $1: verdict '${verdict:-missing}' (see $run_dir/$1-$2.log)"; return 1; }
}

if build_step build 1 "$spec"; then record_step build passed 1; else record_step build failed 1; finish failed; fi

run_tests() { # attempt
  local res
  res="$(step test "$1" "Use the tac-final:test skill to run the validation stack and fix any failures (maximum 3 attempts). End your response with exactly one line: 'TESTS: PASS' or 'TESTS: FAIL'.")" || return 1
  [ "$(printf '%s\n' "$res" | marker TESTS)" = PASS ]
}

if [ "$workflow" != plan_build ]; then
  if run_tests 1; then record_step test passed 1; else record_step test failed 1; finish escalated; fi
fi

if [ "$workflow" = plan_build_review_fix ] || [ "$workflow" = sdlc ]; then
  round=1
  while :; do
    res="$(step review "$round" "Use the tac-final:review skill to review the current changes against $spec. If there are blockers, also write a patch plan for them (--patch). End your response with exactly one line: 'REVIEW: PASS' or 'REVIEW: FAIL', and if FAIL a second line 'PATCH: <path>'.")" \
      || { record_step review failed "$round"; finish failed; }
    if [ "$(printf '%s\n' "$res" | marker REVIEW)" = PASS ]; then record_step review passed "$round"; break; fi
    record_step review failed "$round"
    [ "$round" -ge "$max_fix" ] && finish escalated
    patch="$(printf '%s\n' "$res" | marker PATCH)"
    [ -n "$patch" ] && [ -f "$patch" ] || { log "review failed without a patch plan"; finish escalated; }
    attempts=$((attempts + 1)); round=$((round + 1))
    if build_step fix "$round" "$patch"; then record_step fix passed "$round"; else record_step fix failed "$round"; finish failed; fi
    if run_tests "$round"; then record_step test passed "$round"; else record_step test failed "$round"; finish escalated; fi
  done
fi

if [ "$workflow" = sdlc ]; then
  if step document 1 "Use the tac-final:document skill to document the changes made for $spec." >/dev/null; then
    record_step document passed 1
  else
    record_step document failed 1
  fi
fi

if [ "$open_pr" = 1 ] && [ "$dry_run" = 0 ]; then
  title="$(head -1 "$spec" | sed -E 's/^# *//')"
  type="$(basename "$spec" | cut -d- -f1)"
  case "$type" in feature) ctype=feat ;; bug|patch) ctype=fix ;; *) ctype=chore ;; esac
  default_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  current="$(git branch --show-current)"
  if [ -z "$current" ] || [ "$current" = "${default_branch:-main}" ] || [ "$current" = master ]; then
    branch="$ctype/$run_id"; git switch -q -c "$branch"
  fi
  branch="$(git branch --show-current)"
  git add -A -- . ':!.tac'
  shipped_diff="$(git diff --cached --shortstat | awk '{a=0; d=0; for (i=1; i<=NF; i++) { if ($(i+1) ~ /^insertion/) a=$i; if ($(i+1) ~ /^deletion/) d=$i } print "+" a "/-" d}')"
  git commit -q -m "$ctype: ${title#*: }" -m "Refs: $spec" -m "Generated by tac adw run $run_id"
  git push -q -u origin "$branch"
  gh pr create --title "$ctype: ${title#*: }" --body "Spec: \`$spec\`

Automated tac ADW run \`$run_id\` (workflow \`$workflow\`). Step logs: \`.tac/runs/$run_id/\`.${issue:+

Closes #$issue}" >&2
  record_step ship passed 1
fi

finish passed
