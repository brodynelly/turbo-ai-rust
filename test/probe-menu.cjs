/**
 * Headless probe: load the real renderer in Electron, open the File menu,
 * then drive ArrowDown / ArrowUp / Enter / mnemonic keys and report what the
 * menu actually did. This is a diagnostic scaffold, not a shipped test.
 */
// When Electron runs this file as the main script, require("electron") is the
// API. The npm package shim only appears under plain node.
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
  await new Promise((r) => setTimeout(r, 400));

  const report = await win.webContents.executeJavaScript(`
    (() => {
      const out = [];
      const dump = (tag) => {
        const dd = document.querySelector(".dropdown");
        const rows = dd ? [...dd.querySelectorAll(".row")] : [];
        const sel = dd ? dd.querySelector(".row.sel") : null;
        out.push(tag + " open=" + (document.querySelector(".dropdown") ? "yes" : "no")
          + " rows=" + rows.length
          + " selIdx=" + (sel ? sel.dataset.index : "none")
          + " selText=" + (sel ? JSON.stringify(sel.textContent.trim().slice(0, 26)) : "none"));
      };
      const key = (k, opts) => {
        const ev = new KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {}));
        window.dispatchEvent(ev);
      };

      // Open File menu via F10 (the path the user says works).
      key("F10");
      dump("after F10");

      key("ArrowDown"); dump("after ArrowDown");
      key("ArrowDown"); dump("after ArrowDown x2");
      key("ArrowUp");   dump("after ArrowUp");
      key("End");       dump("after End");
      key("Home");      dump("after Home");

      // Mnemonic jump inside the open menu.
      key("s"); dump("after mnemonic s");

      // Re-open and try committing with Enter.
      key("F10"); dump("reopen");
      key("ArrowDown"); key("ArrowDown");
      key("Enter"); dump("after Enter");

      // Alt+letter accelerator.
      key("o", { altKey: true }); dump("after Alt+O");

      return JSON.stringify(out);
    })()
  `);

  console.log("PROBE_RESULT_JSON=" + report);
  app.exit(0);
}).catch((e) => { console.error("PROBE_FATAL", e && e.message ? e.message : String(e)); app.exit(1); });
