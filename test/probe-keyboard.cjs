/**
 * Headless probe (diagnostic scaffold, NOT a shipped test): drive the real
 * renderer inside Electron with a stubbed window.turbo and report what the
 * Tauri keyboard path actually does.
 *
 * It covers the gaps that only exist under Tauri, where nothing intercepts keys
 * before the page:
 *   - Alt+F / Alt+E / Alt+X accelerators reaching the renderer directly
 *   - the Windows "menu mode" burst (bare Alt, then a letter with no altKey)
 *   - ArrowDown + Enter committing the SELECTED item, not item 0
 *   - Escape closing, F10 toggling, Alt+O opening Options
 *   - no menu-accelerator leakage into the input textarea
 *
 * Run:
 *   cd <repo>; Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue;
 *   .\node_modules\electron\dist\electron.exe test\probe-keyboard.cjs
 *
 * Prints one PROBE_RESULT_JSON=[...] line (a JSON string — executeJavaScript
 * cannot return an array) plus PROBE_NOTES_JSON=[...] for the side observations.
 */
const electronApi = require("electron");
const { app, BrowserWindow } = electronApi;
const path = require("path");

if (!app || !BrowserWindow) {
  console.error("PROBE_FATAL: electron API not available; run with electron.exe");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const RENDERER = path.join(ROOT, "renderer");

// Stub the preload bridge so renderer.js boots without the real main process.
const STUB = `
window.turbo = {
  boot: async () => ({ success: true, data: { cwd: "C:/tmp/probe", piRunning: true, model: null, thinkingLevel: null, planMode: false, sessionName: "PROBE", recentSessions: [], gitInfo: { branch: null, added: null, removed: null, dirtyFiles: [], isRepo: false } } }),
  getState: async () => ({}), getStats: async () => ({}), prompt: async () => ({}), abort: async () => ({}),
  runCommand: async () => ({}), getModels: async () => ({ success: true, data: [] }), reloadModels: async () => ({}),
  setModel: async () => ({}), cycleModel: async () => ({}), setThinkingLevel: async () => ({}), cycleThinkingLevel: async () => ({}),
  setPlanMode: async () => ({}), newSession: async () => ({}), setSessionName: async () => ({}), compact: async () => ({}),
  fork: async () => ({}), clone: async () => ({}), exportHtml: async () => ({}), getLastAssistantText: async () => "",
  toggleAutoCompaction: async () => ({}), toggleAutoRetry: async () => ({}), toggleSteeringMode: async () => ({}),
  toggleFollowUpMode: async () => ({}), getTree: async () => ({ success: true, data: [] }), refreshGit: async () => ({}),
  readPreview: async () => ({}), gitDiff: async () => ({}), gitStatus: async () => ({}), gitLog: async () => ({}),
  gitGrep: async () => ({}), saveSessionFile: async () => ({}), changeDirectory: async () => ({}), getSessions: async () => ({}),
  openSession: async () => ({}), getProviders: async () => ({}), writeEnvKey: async () => ({}), addCustomModel: async () => ({}),
  systemInfo: async () => ({}), copyToClipboard: async () => ({}), showInFolder: async () => ({}),
  saveDialog: async () => ({ canceled: true }), openDirDialog: async () => ({ canceled: true }),
  contextMenu: async () => ({}), exit: async () => ({}), on: () => () => {},
};
window.__PROBE_EXITED = 0;
window.turbo.exit = async () => { window.__PROBE_EXITED++; return {}; };
true;
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  });
  await win.loadFile(path.join(RENDERER, "index.html"));
  await win.webContents.executeJavaScript(STUB);
  win.webContents.on("console-message", (_e, _level, message) => {
    console.log("RENDERER_CONSOLE: " + message);
  });
  await new Promise((r) => setTimeout(r, 400));

  const report = await win.webContents.executeJavaScript(`
    (async () => {
      try {
      const out = [];
      const notes = [];

      // The dropdown is created by openMenuAt(); .row.sel marks the selection.
      const snap = () => {
        const dd = document.querySelector(".dropdown");
        const rows = dd ? [...dd.querySelectorAll(".row")] : [];
        const sel = dd ? dd.querySelector(".row.sel") : null;
        return {
          open: !!dd,
          rows: rows.length,
          selIdx: sel ? Number(sel.dataset.index) : null,
          selText: sel ? sel.textContent.trim().slice(0, 30) : null,
        };
      };
      const dump = (tag) => { out.push(Object.assign({ step: tag }, snap())); };

      const key = (k, opts) => {
        // e.code mirrors the physical key so the renderer's e.code fallback works.
        const code = opts && opts.code !== undefined ? opts.code
          : (/^[a-zA-Z]$/.test(k) ? "Key" + k.toUpperCase() : k === " " ? "Space" : k);
        const ev = new KeyboardEvent("keydown", Object.assign({ key: k, code, bubbles: true, cancelable: true, view: window }, opts || {}));
        window.dispatchEvent(ev);
        return ev;
      };

      // --- baseline: F10 opens File with the FIRST item selected -------------
      key("F10");
      dump("F10 opens File (expect selIdx=0)");
      key("Escape");
      dump("Escape closes (expect open=false)");

      // --- F10 toggles: F10, F10 --------------------------------------------
      key("F10"); dump("F10 again opens");
      key("F10"); dump("F10 toggles closed (expect open=false)");
      const evF10 = key("F10");
      notes.push("F10 third tap preventDefault=" + evF10.defaultPrevented);
      dump("after two more F10 taps");

      // --- the key acceptance case: ArrowDown then Enter ---------------------
      // F10 opened File on item 0 ("Save session to file..."); ArrowDown moves
      // to item 1 ("Open saved session..."). Enter MUST commit item 1.
      dump("File open, first item selected");
      key("ArrowDown");
      const afterDown = snap();
      dump("ArrowDown (expect selIdx=1)");
      key("Enter");
      const afterEnter = snap();
      dump("Enter commits selection (expect open=false)");
      notes.push("selection before Enter selIdx=" + afterDown.selIdx + " selText=" + JSON.stringify(afterDown.selText));

      // --- Alt+F directly (Tauri has no main-process key forwarding) ---------
      const evAltF = key("f", { altKey: true });
      dump("Alt+F opens File (expect open=true selIdx=0)");
      notes.push("Alt+F preventDefault=" + evAltF.defaultPrevented);
      key("Escape");

      // --- menu-mode burst: bare Alt, then plain "e" (no altKey) ------------
      const dropdownsBeforeE = document.querySelectorAll(".dropdown").length;
      const evAlt = key("Alt", { code: "AltLeft" });
      const evE = key("e");
      notes.push("burst: menuOpenBefore=" + dropdownsBeforeE
        + " altHandled=" + evAlt.defaultPrevented
        + " eConsumed=" + evE.defaultPrevented);
      dump("bare Alt then e (expect Edit menu open)");
      key("Escape");

      // --- Alt+O opens Options ----------------------------------------------
      key("o", { altKey: true });
      dump("Alt+O opens Options");
      key("Escape");

      // --- Alt+X exits (single accelerator with no menu) --------------------
      const beforeExit = window.__PROBE_EXITED;
      key("x", { altKey: true });
      notes.push("Alt+X turbo.exit calls delta=" + (window.__PROBE_EXITED - beforeExit));

      // --- ArrowDown+Enter commits index 1, verified by the real action -----
      // File > item 1 is file.open (F3). Count prompts so we can prove the
      // committed item is #1 and not #0 (file.save, which opens a save dialog).
      let saveDialogs = 0;
      window.turbo.saveDialog = async () => { saveDialogs++; return { canceled: true }; };
      key("f", { altKey: true });
      key("ArrowDown");
      key("Enter");
      await new Promise((r) => setTimeout(r, 60));
      notes.push("after Alt+F,ArrowDown,Enter: saveDialogs=" + saveDialogs + " (0 proves item 0 was NOT committed)");
      dump("after committed index-1 action (expect open=false)");

      // --- Alt+E does not fire while an overlay is open ---------------------
      key("F1"); // keyboard help dialog
      const overlayBefore = !!document.querySelector(".dialog");
      key("f", { altKey: true });
      const overlayAfter = !!document.querySelector(".dialog");
      const openAfterAltF = !!document.querySelector(".dropdown");
      notes.push("overlay open before Alt+F=" + overlayBefore + " still open=" + overlayAfter + " menu opened=" + openAfterAltF);
      key("Escape");
      key("Escape");

      // --- accelerators never leak into the input textarea ------------------
      const ta = document.getElementById("input-textarea");
      ta.focus();
      ta.value = "";
      const evLeak = key("f", { altKey: true });
      notes.push("input focused: Alt+F preventDefault=" + evLeak.defaultPrevented + " textarea.value=" + JSON.stringify(ta.value));
      if (document.querySelector(".dropdown")) { out.push({ step: "Alt+F with input focused opened a menu (by design at window level)", open: true, rows: snap().rows, selIdx: snap().selIdx, selText: snap().selText }); key("Escape"); }

      // --- regressions: Ctrl+L clears, plain "j" still moves in a pane ------
      key("j"); // vim motion, focus is input -> should be a no-op, not a menu
      notes.push("plain j with input focused opened a menu=" + !!document.querySelector(".dropdown"));

      return JSON.stringify({ steps: out, notes: notes });
      } catch (err) {
        return JSON.stringify({ steps: out, notes: notes, probeError: String(err && err.stack || err) });
      }
    })()
  `);

  console.log("PROBE_RESULT_JSON=" + report);
  app.exit(0);
}).catch((e) => { console.error("PROBE_FATAL", e && e.message ? e.message : String(e)); app.exit(1); });
