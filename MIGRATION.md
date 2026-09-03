# Migration notice

Turbo-AI's interaction design and Turbo Pascal / Borland-styled theme are being re-implemented in Rust as `hf-console` inside the [harness-factory](https://github.com/brodynelly/harness-factory) workspace, where they front a provider picker reaching Pi, Claude, Codex, and other agents via the Agent Client Protocol (ACP) rather than only Pi's RPC mode.

This repository's TypeScript source is not being ported line-for-line; the console is a fresh Rust implementation of the same look and interaction model. Ported UI-chrome primitives (box-drawing, palette, scrollbar rendering) retain this project's original MIT license and attribution in `crates/hf-console/src/dos/README.md` in the harness-factory repository.

This repository (turbo-ai-rust) continues to work standalone against Pi and is not deprecated by this migration.
