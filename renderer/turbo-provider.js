/**
 * TURBO-AI — runtime provider selection.
 *
 * The renderer only knows the `window.turbo` API. Under Electron the preload
 * script installs it. Under Tauri this shim installs an equivalent backed by
 * Tauri commands/events, so the exact same UI code runs on both runtimes.
 */
(function () {
	"use strict";
	if (window.turbo) return; // Electron preload already provides the bridge
	if (!window.__TAURI__) return; // plain browser / not under Tauri
	window.__TAURI_MODE = true;
	const { invoke } = window.__TAURI__.core;
	const { listen } = window.__TAURI__.event;

	window.turbo = {
		boot: () => invoke("turbo_boot"),
		getState: () => invoke("turbo_get_state"),
		getStats: () => invoke("turbo_get_stats"),
		prompt: (text) => invoke("turbo_prompt", { text }),
		abort: () => invoke("turbo_abort"),
		runCommand: (command) => invoke("turbo_run_command", { command }),
		getModels: () => invoke("turbo_get_models"),
		reloadModels: () => invoke("turbo_reload_models"),
		setModel: (m) => invoke("turbo_set_model", { m }),
		cycleModel: () => invoke("turbo_cycle_model"),
		setThinkingLevel: (level) => invoke("turbo_set_thinking_level", { level }),
		cycleThinkingLevel: () => invoke("turbo_cycle_thinking_level"),
		setPlanMode: (on) => invoke("turbo_set_plan_mode", { on }),
		newSession: () => invoke("turbo_new_session"),
		setSessionName: (name) => invoke("turbo_set_session_name", { name }),
		compact: () => invoke("turbo_compact"),
		fork: () => invoke("turbo_fork"),
		clone: () => invoke("turbo_clone"),
		exportHtml: () => invoke("turbo_export_html"),
		getLastAssistantText: () => invoke("turbo_get_last_assistant_text"),
		toggleAutoCompaction: () => invoke("turbo_toggle_auto_compaction"),
		toggleAutoRetry: () => invoke("turbo_toggle_auto_retry"),
		toggleSteeringMode: () => invoke("turbo_toggle_steering_mode"),
		toggleFollowUpMode: () => invoke("turbo_toggle_follow_up_mode"),
		getTree: () => invoke("turbo_get_tree"),
		refreshGit: () => invoke("turbo_refresh_git"),
		readPreview: (filePath) => invoke("turbo_read_preview", { filePath }),
		gitDiff: () => invoke("turbo_git_diff"),
		gitStatus: () => invoke("turbo_git_status"),
		gitLog: () => invoke("turbo_git_log"),
		gitGrep: (query) => invoke("turbo_git_grep", { query }),
		saveSessionFile: (filename, content) => invoke("turbo_save_session_file", { filename, content }),
		changeDirectory: (newDir) => invoke("turbo_change_directory", { newDir }),
		getSessions: () => invoke("turbo_get_sessions"),
		openSession: (p) => invoke("turbo_open_session", { p }),
		getProviders: () => invoke("turbo_get_providers"),
		writeEnvKey: (envVar, value) => invoke("turbo_write_env_key", { envVar, value }),
		addCustomModel: (m) => invoke("turbo_add_custom_model", { m }),
		systemInfo: () => invoke("turbo_system_info"),
		copyToClipboard: (text) => invoke("turbo_copy_to_clipboard", { text }),
		showInFolder: (p) => invoke("turbo_show_in_folder", { p }),
		saveDialog: async (defaultName) => {
			const res = await invoke("turbo_save_dialog", { defaultName });
			if (res && typeof res === "object" && "success" in res) {
				return res.success && typeof res.data === "string" ? { canceled: false, path: res.data } : { canceled: true };
			}
			return res && res.canceled ? res : { canceled: true };
		},
		openDirDialog: async () => {
			const res = await invoke("turbo_open_dir_dialog");
			if (res && typeof res === "object" && "success" in res) {
				return res.success && typeof res.data === "string" ? { canceled: false, path: res.data } : { canceled: true };
			}
			return res && res.canceled ? res : { canceled: true };
		},
		contextMenu: () => invoke("turbo_context_menu"),
		exit: () => invoke("turbo_exit"),
		on: (channel, listener) => {
			let unlisten = null;
			listen(channel, (event) => listener(event.payload)).then((u) => { unlisten = u; });
			return () => { if (unlisten) unlisten(); };
		},
	};

	// ------------------------------------------------------------------
	// Frameless window affordances
	//
	// Under Tauri the window is created with decorations:false, so the OS draws
	// no title bar and no caption buttons. The app draws no caption strip of its
	// own either — the DOS menu bar is the topmost element.
	//
	// That leaves one thing to wire: without any chrome the window would be
	// impossible to move or maximize, so the menu bar background becomes the drag
	// region (see renderer.css #menubar). Menu items opt out, so pressing one
	// still opens a menu rather than starting a drag.
	// ------------------------------------------------------------------

	function whenReady(fn) {
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
		else fn();
	}

	/** Resolve the Tauri window object, or null when the API is unavailable. */
	async function currentWindow() {
		try {
			const w = window.__TAURI__ && window.__TAURI__.window;
			if (!w) return null;
			// Tauri 2: getCurrentWindow(); Tauri 1: WebviewWindow.getCurrent().
			if (typeof w.getCurrentWindow === "function") return w.getCurrentWindow();
			if (typeof w.WebviewWindow === "function" && typeof w.WebviewWindow.getCurrent === "function") return w.WebviewWindow.getCurrent();
			return null;
		} catch (err) {
			return null;
		}
	}

	function wireWindowAffordances() {
		const bar = document.getElementById("menubar");
		if (!bar) return; // markup not present — nothing to wire

		/** True when the event landed on an actual menu item (not the bar itself). */
		const isMenuItem = (target) =>
			!!target && typeof target.closest === "function" && !!target.closest(".menu-item");

		const win = () => currentWindow();

		// Drag the window by the menu bar background. Deliberately not on
		// .menu-item, or a press on "File" would move the window instead of
		// opening the menu.
		bar.addEventListener("mousedown", async (e) => {
			if (e.button !== 0 || isMenuItem(e.target)) return;
			const w = await win();
			if (w && typeof w.startDragging === "function") {
				try { await w.startDragging(); } catch (err) { /* ignore */ }
			}
		});

		// Double-click the bar background toggles maximize, like a native caption.
		bar.addEventListener("dblclick", async (e) => {
			if (isMenuItem(e.target)) return;
			const w = await win();
			try {
				if (w && typeof w.toggleMaximize === "function") await w.toggleMaximize();
			} catch (err) { /* ignore */ }
		});
	}

	whenReady(wireWindowAffordances);
})();
