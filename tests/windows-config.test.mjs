import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  detectDesktopPlatform,
  getPlatformCopy,
} from "../src/platform.ts";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("desktop platform detection recognises WebView platform values", () => {
  assert.equal(detectDesktopPlatform("Win32", ""), "windows");
  assert.equal(
    detectDesktopPlatform("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
    "windows",
  );
  assert.equal(detectDesktopPlatform("MacIntel", ""), "macos");
  assert.equal(
    detectDesktopPlatform("darwin", ""),
    "macos",
    "darwin contains the letters 'win' but is not Windows",
  );
  assert.equal(detectDesktopPlatform("Linux x86_64", ""), "linux");
  assert.equal(detectDesktopPlatform("", "unknown webview"), "unknown");
});

test("Windows-facing copy does not leak macOS terminology", () => {
  assert.deepEqual(getPlatformCopy("windows"), {
    tray: "系统托盘",
    trayLocation: "Windows 任务栏通知区域",
    trayInteraction: "左键打开主窗口，右键打开快捷菜单",
    openFolder: "用文件资源管理器打开",
  });
});

test("desktop launches are single-instance before other Tauri plugins", async () => {
  const [cargo, lib] = await Promise.all([
    readFile("src-tauri/Cargo.toml", "utf8"),
    readFile("src-tauri/src/lib.rs", "utf8"),
  ]);

  assert.match(cargo, /tauri-plugin-single-instance\s*=\s*"2"/);
  const singleInstance = lib.indexOf("tauri_plugin_single_instance::init");
  const opener = lib.indexOf("tauri_plugin_opener::init");
  assert.ok(singleInstance >= 0, "single-instance plugin must be registered");
  assert.ok(
    singleInstance < opener,
    "single-instance must be registered before plugins that can interfere",
  );
  assert.match(lib, /tray::show_main\(app\)/);
});

test("Windows builds use the supported x64 NSIS configuration", async () => {
  const [base, windows, pkg] = await Promise.all([
    readJson("src-tauri/tauri.conf.json"),
    readJson("src-tauri/tauri.windows.conf.json"),
    readJson("package.json"),
  ]);

  assert.deepEqual(windows.bundle.targets, ["nsis"]);
  assert.deepEqual(windows.bundle.icon, ["icons/icon.ico"]);
  assert.equal(windows.bundle.windows.allowDowngrades, false);
  assert.deepEqual(windows.bundle.windows.webviewInstallMode, {
    type: "downloadBootstrapper",
    silent: true,
  });
  assert.equal(windows.bundle.windows.nsis.installMode, "currentUser");
  assert.equal(windows.bundle.windows.nsis.installerIcon, "icons/icon.ico");
  assert.equal(windows.bundle.windows.nsis.uninstallerIcon, "icons/icon.ico");
  assert.deepEqual(
    new Set(windows.bundle.windows.nsis.languages),
    new Set(["SimpChinese", "English"]),
  );
  assert.equal(windows.plugins.updater.windows.installMode, "passive");

  // The platform file inherits updater artifact generation for real releases.
  assert.equal(base.bundle.createUpdaterArtifacts, true);
  assert.match(
    pkg.scripts["build:windows"],
    /--target x86_64-pc-windows-msvc --bundles nsis --config src-tauri\/tauri\.ci\.conf\.json$/,
  );
  assert.match(
    pkg.scripts["build:windows:updater"],
    /--target x86_64-pc-windows-msvc --bundles nsis$/,
  );
});

test("unsigned CI builds disable updater artifacts without changing installers", async () => {
  const ci = await readJson("src-tauri/tauri.ci.conf.json");

  assert.deepEqual(ci.bundle, { createUpdaterArtifacts: false });
  assert.equal(
    Object.hasOwn(ci, "plugins"),
    false,
    "CI must not replace release updater endpoints or public keys",
  );
});

test("Windows CI builds and uploads the x64 NSIS executable", async () => {
  const workflow = await readFile(".github/workflows/windows-build.yml", "utf8");

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s*runs-on:\s*windows-latest\s*$/m);
  assert.match(workflow, /targets:\s*x86_64-pc-windows-msvc/);
  assert.match(workflow, /pnpm run test:windows/);
  assert.match(
    workflow,
    /cargo test --manifest-path src-tauri\/Cargo\.toml --locked --target x86_64-pc-windows-msvc/,
  );
  assert.match(
    workflow,
    /pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis --config src-tauri\/tauri\.ci\.conf\.json/,
  );
  assert.match(
    workflow,
    /src-tauri\/target\/x86_64-pc-windows-msvc\/release\/bundle\/nsis\/\*\.exe/,
  );
  assert.match(workflow, /if-no-files-found:\s*error/);
});
