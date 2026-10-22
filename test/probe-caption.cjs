/**
 * Headless probe (diagnostic scaffold, NOT a shipped test): load the real
 * renderer with a fake Tauri v2 API installed and report what
 * renderer/turbo-provider.js actually wires on the frameless #titlebar.
 *
 * It answers the questions the task cares about:
 *   - is #titlebar left visible (no more display:none under Tauri)?
 *   - do clicks on #tb-min / #tb-max / #tb-close call the window API?
 *   - does #tb-max track isMaximized() (so the glyph can stay in sync)?
 *   - does mousedown on the strip BACKGROUND call startDragging(), and does
 *     mousedown on a caption button NOT call it?
 *   - is window.turbo still fully installed (all 45 methods)?
 *
 * Run:
 *   cd <repo>; Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue;
 *   .\node_modules\electron\dist\electron.exe test\probe-caption.cjs
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

// Install a fake Tauri v2 global BEFORE the page scripts run: turbo-provider.js
// only activates when window.__TAURI__ exists and window.turbo does not.
const FAKE_TAURI = `
window.__TAURI_CALLS = [];
window.__TAURI_MAXIMIZED = false;
window.__TAURI__ = {
  core: { invoke: async (cmd, args) => { window.__TAURI_CALLS.push(cmd); return { success: true, data: null }; } },
  event: { listen: async (name, cb) => { window.__TAURI_CALLS.push("listen:" + name); return () => {}; } },
  window: {
    getCurrentWindow: () => ({
      minimize: async () => { window.__TAURI_CALLS.push("minimize"); },
      maximize: async () => { window.__TAURI_CALLS.push("maximize"); window.__TAURI_MAXIMIZED = true; },
      unmaximize: async () => { window.__TAURI_CALLS.push("unmaximize"); window.__TAURI_MAXIMIZED = false; },
      toggleMaximize: async () => { window.__TAURI_CALLS.push("toggleMaximize"); window.__TAURI_MAXIMIZED = !window.__TAURI_MAXIMIZED; },
      isMaximized: async () => window.__TAURI_MAXIMIZED,
      close: async () => { window.__TAURI_CALLS.push("close"); },
      startDragging: async () => { window.__TAURI_CALLS.push("startDragging"); },
    }),
  },
};
true;
`;

// The page needs a window.turbo for renderer.js's boot; turbo-provider.js will
// skip installing its own bridge, so stub the boot-relevant calls only.
const BOOT_STUB = `
window.turbo = {
  boot: async () => ({ success: true, data: { cwd: "C:/tmp/probe", piRunning: true, model: null, thinkingLevel: null, planMode: false, sessionName: "PROBE", recentSessions: [], gitInfo: { branch: null, added: null, removed: null, dirtyFiles: [], isRepo: false } } }),
  getTree: async () => ({ success: true, data: [] }), systemInfo: async () => ({}),
  gitStatus: async () => ({}), refreshGit: async () => ({}), getState: async () => ({}),
  on: () => () => {}, abort: async () => ({}), copyToClipboard: async () => ({}), contextMenu: async () => ({}),
  exit: async () => { window.__TAURI_CALLS.push("turbo.exit"); },
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

  // Install the fake Tauri global, then the provider, then a boot stub.
  await win.loadFile(path.join(RENDERER, "index.html"));
  await win.webContents.executeJavaScript(FAKE_TAURI);
  // Load turbo-provider.js FIRST, while window.turbo is still absent — that is
  // the real Tauri boot order (index.html pulls in the provider before
  // renderer.js). Loading it after a stub would make it bail out early.
  const src = require("fs").readFileSync(path.join(RENDERER, "turbo-provider.js"), "utf8");
  await win.webContents.executeJavaScript(src);
  await win.webContents.executeJavaScript(BOOT_STUB);
  await new Promise((r) => setTimeout(r, 300));

  const report = await win.webContents.executeJavaScript(`
    (async () => {
      const out = [];
      const calls = () => window.__TAURI_CALLS.slice();
      const reset = () => { window.__TAURI_CALLS.length = 0; };
      const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const down = (el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

      const tb = document.getElementById("titlebar");
      const min = document.getElementById("tb-min");
      const max = document.getElementById("tb-max");
      const close = document.getElementById("tb-close");

      out.push({
        step: "markup present",
        titlebar: !!tb,
        titlebarVisible: !!tb && getComputedStyle(tb).display !== "none",
        min: !!min, max: !!max, close: !!close,
        providerRan: !!window.__TAURI_MODE,
      });

      reset(); click(min); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "click #tb-min", tauriCalls: calls() });

      reset(); click(max); await new Promise((r) => setTimeout(r, 40));
      const afterMax = { step: "click #tb-max", tauriCalls: calls(), maxClass: tb.classList.contains("tb-maximized"), ariaPressed: max.getAttribute("aria-pressed") };
      out.push(afterMax);

      reset(); click(max); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "click #tb-max again (restore)", tauriCalls: calls(), maxClass: tb.classList.contains("tb-maximized") });

      reset(); click(close); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "click #tb-close", tauriCalls: calls() });

      // Drag region: background of the strip should start a drag...
      reset(); down(tb); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "mousedown on strip background", tauriCalls: calls() });

      // ...but a caption button must NOT.
      reset(); down(min); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "mousedown on #tb-min", tauriCalls: calls() });

      reset(); down(document.getElementById("tb-controls")); await new Promise((r) => setTimeout(r, 40));
      out.push({ step: "mousedown on #tb-controls", tauriCalls: calls() });

      return JSON.stringify(out);
    })()
  `);

  console.log("PROBE_RESULT_JSON=" + report);
  app.exit(0);
}).catch((e) => { console.error("PROBE_FATAL", e && e.message ? e.message : String(e)); app.exit(1); });
