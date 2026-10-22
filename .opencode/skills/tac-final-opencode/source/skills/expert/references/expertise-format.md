# Expertise File Format

## Rules

- **Location**: `.claude/experts/<domain>/expertise.yaml`, committed to the repo so the team and every agent share it.
- **Structured**: YAML so agents can scan sections; start from `../assets/expertise-template.yaml`.
- **Verifiable**: every `path` and symbol must exist. `improve` checks each one and removes or fixes what fails.
- **Bounded**: `line_limit` keeps the model a summary. Over the limit, compress or split into sub-domains
  (for example `billing-invoices`, `billing-payments`).
- **Dated**: `last_validated` is the date of the last full validation; `improve` uses it to find relevant git changes.

## Line limits

| Domain size | Limit |
| --- | --- |
| One module | 200-300 |
| A subsystem | 400-600 |
| Never exceed | 1000 (split instead) |

## What to keep when space runs out (in priority order)

1. `core_files` - navigation is the biggest time saver
2. `key_operations` - how the important things actually happen
3. `data_model` invariants and `known_issues` - prevent expensive mistakes
4. `conventions`
5. `integration_points`, `testing`

## Validation checklist (used by `improve`)

- [ ] Every `path` exists (`git ls-files <path>`)
- [ ] Every `key_symbols` / `entry` symbol is found by Grep in its file
- [ ] Flows still match the code (read the entry points)
- [ ] Changes since `last_validated` in this domain are reflected (`git log --since=<date> -- <paths>`)
- [ ] Nothing describes code that no longer exists
- [ ] Under `line_limit`; `last_validated` updated

## When to create an expert

- The domain is high value or high risk (money, auth, data integrity, public contracts).
- Changes ripple across files, and agents keep re-discovering the same structure.
- You want higher confidence by running several experts in parallel and comparing answers.

Do not create experts for small or stable areas; priming is cheaper.
