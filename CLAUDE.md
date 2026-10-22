# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Turbo-AI is a Turbo Pascal 7.0 / Borland DOS styled frontend for the [Pi coding agent](https://github.com/earendil-works/pi-mono). Pi is never modified or forked — Turbo-AI drives it strictly over Pi's documented JSONL RPC protocol (`pi --mode rpc`).

There are **three shells** over that one protocol:

| Shell | Code | Backend |
|---|---|---|
| Terminal UI (canonical) | `src/` — TypeScript, hand-rolled ANSI cell grid | spawns `pi` subprocess, JSONL over stdio |
| Desktop renderer | `renderer/` — HTML/CSS/JS port of the TUI | `window.turbo` bridge |
| Native desktop | `src-tauri/` — Rust port of the Electron main process | same `window.turbo` bridge over Tauri IPC |

`src/` is the authored implementation; `renderer/` is a faithful port of it, and `src-tauri/src/main.rs` is a Rust port of the (now-absent) `electron/main.cjs`.

## Commands

```bash
npm run dev          # tsx src/main.ts  — run the TUI against the current directory
npm run build        # tsc -> dist/     (tsconfig: NodeNext ESM, strict, noUncheckedIndexedAccess)
npm start            # node dist/main.js
npm start -- --dir C:/path/to/project
npm test             # tsx --test test/*.test.ts
npm run check        # build + test — this is exactly what CI runs
npm run tauri        # tauri dev
npm run tauri:build  # tauri build (NSIS installer)
```

Single test file, or a single test by name:

```bash
npx tsx --test test/keys.test.ts
npx tsx --test --test-name-pattern="MenuState" test/menu-diff.test.ts
```

### The desktop shell is Tauri, not Electron

The Electron shell was removed — there is no `electron/` directory. The desktop app is Tauri v2:
`src-tauri/` (Rust) plus `renderer/` (HTML/CSS/JS), wired by the `window.turbo` bridge over Tauri IPC.
`npm run desktop` runs `tauri dev`; `npm run desktop:build` runs `tauri build` (NSIS installer).
`electron` remains a devDependency only as the runner for the `test/probe-*.cjs` diagnostic scaffolds.

## Architecture

### The TUI (`src/`)

Rendering is a **double-buffered character cell grid** with no runtime dependencies (`src/ui/screen.ts`): components draw into a cell buffer, `flush()` diffs against the previous frame and emits only changed runs as ANSI CUP + SGR. `src/theme/turbo-pascal.ts` holds the DOS/VGA 16-color palette and packs a fg/bg pair into one byte attribute.

Layout (`src/utils/layout.ts`) is the classic Turbo Pascal tiled arrangement: row 0 menu bar, row `rows-1` key bar, and between them a project-tree pane (left, ~28% width) beside an agent-output pane stacked over a message-input pane. Minimum terminal size is 60x18; `computeLayout` returns `null` below that.

The main loop (`src/main.ts`) is a `setImmediate` tick that repaints only when a `dirty` flag is set. `App` owns all state: focus, overlay, model, thinking level, plan/build mode, session name, zoomed window, git info.

Key conventions in `src/main.ts`:
- **Overlays** are a discriminated union (`Overlay`): `menu | model | session | help | about | text | diff | prompt | providerConfig | addModel`. There is exactly one at a time; `closeOverlay()` clears it.
- **Menu actions are string IDs** (`file.save`, `git.diff`, `opt.keys`, …) defined in `src/ui/menu-bar.ts` and dispatched by `dispatchCommand(command)` in `main.ts`. The `File` menu injects recent sessions as `file.recent:<index>`.
- **Slash commands** (`/status`, `/model`, `/effort`, `/plan`, `/build`, `/diff`, `/test`, `/save`, `/resume`, …) are handled in `handleSlashCommand` before the text is sent to Pi as a prompt.
- **PLAN mode** prepends a `[PLAN MODE: ...]` instruction to the prompt sent to Pi; it is not a Pi-side setting.
- **Working-directory switching** (`switchWorkingDirectory`) starts a *new* Pi client first and only swaps it in once it is ready — on failure the current project and session stay active.

### The RPC layer (`src/rpc/`)

- `types.ts` — protocol types, derived from `docs/rpc.md` of `@earendil-works/pi-coding-agent` 0.78.0. `parseRpcLine` classifies one JSONL line as a `RpcResponse` or `RpcEvent`.
- `pi-client.ts` — `PiClient` extends `EventEmitter`. It buffers stdout manually and splits on `\n`; **do not use `node:readline`**, which also splits on U+2028/U+2029 and corrupts JSON strings. `request(cmd, timeoutMs)` correlates a response by injecting an `id` and resolving a pending map entry. Events are emitted as `"event"`, uncorrelated responses as `"response"`, and process death as `"disconnected"`.
  - On Windows, `pi` (and `.cmd`/`.bat` shims) are spawned through `cmd.exe /d /s /c` with `windowsVerbatimArguments`, and every argument is rejected if it contains `" \r\n&|<>^%!`.
  - `dispose()` kills the child, then force-kills the process tree via `taskkill /T /F` after a 2s grace period (Windows shims detach the child).
- `events.ts` — `eventToEntries(event)` is a pure function mapping a raw RPC event to agent-panel entries plus streaming deltas. Tool calls get DOS-style tags (`[READ]`, `[EDIT]`, `[SEARCH]`, …). Thinking deltas are rendered gray, final text bright white.

### The renderer (`renderer/`)

`renderer/renderer.js` is a vanilla-JS port of the TUI: it re-implements the menus, tiled windows, overlays, and slash commands in DOM, and never touches the filesystem directly. **All backend work goes through `window.turbo`.**

- `renderer/turbo-provider.js` implements `window.turbo` over Tauri IPC (`invoke` + `listen`) when running under Tauri, and is a no-op when an Electron preload already installed the bridge.
- `renderer/index.html` and `renderer/renderer.css` recreate the DOS/VGA look in CSS.

### The Tauri backend (`src-tauri/src/main.rs`)

A Rust port of the Electron main process. It owns the `pi` subprocess, the JSONL protocol, git/filesystem/session/env operations, and emits `push:state`, `push:entry`, `push:delta`, `push:textPopup`, `push:bootError` events. Every `turbo_*` Tauri command maps 1:1 to a `window.turbo` method.

### Duplicated data — update all copies

The menu tree, key bar and help text exist in **three independent places**:

1. `src/ui/menu-bar.ts` → `MAIN_MENUS`
2. `renderer/renderer.js` → `MAIN_MENUS`
3. `src-tauri/src/main.rs` (help / status data)

Changing a menu item, mnemonic, shortcut or action ID means editing all of them, or the shells drift apart. The same applies to the `window.turbo` method list: `renderer/turbo-provider.js` and the `turbo_*` commands in `main.rs` must stay in sync.

## Testing

`node:test` + `node:assert/strict`, run through `tsx` (no build step). Tests import from `../src/*.js` with the `.js` extension (NodeNext ESM).

- `test/fixtures/fake-pi.mjs` is a stand-in Pi subprocess used to test `PiClient` and `App` without the real agent. It answers `get_state` and rejects `switch_session` when the path contains `fail-session`.
- `App`'s constructor takes an optional `clientFactory` so tests can inject a fake-backed `PiClient`. `test/app.test.ts` reaches into private methods via `app as unknown as AppInternals` — this is the established pattern for testing `switchWorkingDirectory` and `loadRecentSession`.
- `test/probe-*.cjs` and `test/cdp-*.mjs` are **diagnostic scaffolds, not tests** — they print a report of what the UI actually did, so they stay out of the npm test glob.
  - `test/probe-menu.cjs`, `test/probe-caption.cjs`, `test/probe-keyboard.cjs` — load `renderer/index.html` in Electron against a stubbed `window.turbo` and report what the File menu, the frameless-window caption and the keyboard handling did. Run one with `.\node_modules\electron\dist\electron.exe test\probe-menu.cjs`.
  - `test/probe-live-cdp.mjs` — exercises the running **Tauri** app's real DOM and menu keyboard handling in-process over the WebView2 CDP port.
  - `test/cdp-eval.mjs`, `test/cdp-shot.mjs` — evaluate expressions in, and capture PNGs of, the running Tauri app.

  The CDP scaffolds need the app launched with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.

CI (`.github/workflows/check.yml`) runs `npm run check` on Node 20, 22 and 24, on Ubuntu and Windows.

## Configuration and environment

- `PI_CMD` — overrides the Pi executable (default `pi` on PATH). `PiClient` also accepts `command`/`args` options directly.
- `PI_CONFIG_DIR` — overrides the Pi config directory (default `~/.pi/agent`).
- `~/.pi/agent/models.json` — custom models; written by `saveCustomModel` / `setCustomModelReasoning` via atomic temp-file + rename.
- `~/.pi/agent/settings.json` — `enabledModels` array; `filterEnabledModels` narrows the model list to it and falls back to the full list if nothing matches.
- `~/.pi/agent/sessions/**.jsonl` — Pi session files; `getProjectSessions` scans them (8-way concurrent) and keeps only those whose recorded `cwd` matches the project.
- `.env` in the project directory — API keys, written by `writeEnvKey` (validated env var name, single-line value, mode 0600).
- Provider defaults (base URL, API type, env var name) live in `PROVIDER_DEFAULTS` in `src/commands/commands.ts`.

## Conventions

- TypeScript is strict ESM: `module`/`moduleResolution` are `NodeNext`, so **relative imports must carry the `.js` extension** even though the source is `.ts`.
- The UI theme is a fixed 16-color DOS palette. Do not introduce arbitrary colors; add a named entry to `THEME` instead.
- `packAttr({fg, bg})` packs a color pair into a byte. `sgrFor(attr)` maps it to ANSI. Keep new colors in the DOS palette.
- Files are indented with **tabs**.
- `prompt.txt` is the original Russian-language spec that the project was generated from. It is a reference document, not code, and has drifted from the implementation.

## Agentic layer (tac)

- Specs: `specs/`
- Docs: `docs/`
- Default branch: `main`
- Validate (run in order, stop at first failure):
  - check: `npm run check`
