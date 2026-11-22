// Solo-CRM 데스크톱 앱 (Windows)
//  - CRM 화면을 앱 창으로 띄우고, 창을 닫아도 트레이에서 영업 폴더 자동 동기화를 계속한다
//  - 동기화는 화면에서 로그인한 계정으로 한다 (비밀번호를 파일에 두지 않음)
//  - 처음 실행하면 Supabase 주소·공개 키를 묻는다 (회사마다 자기 Supabase)
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSyncService, type SyncService, type SyncStatus } from "../sync/service.ts";
import { setFolderPicker } from "../sync/pick.ts";

const APP_NAME = "Solo-CRM";
const devUrl = process.env.SOLO_DEV_URL; // 개발: http://localhost:5173
const startHidden = process.argv.includes("--hidden");
const appRoot = path.join(import.meta.dirname, "..");

app.setName(APP_NAME);
app.setAppUserModelId("ai.hanul.solocrm");
if (!app.requestSingleInstanceLock()) app.exit(0);

/* ---- 설정 파일 (사용자 폴더) ---- */
interface DesktopConfig { supabaseUrl?: string; supabaseKey?: string; autoStartSet?: boolean; paused?: boolean }
const cfgFile = () => path.join(app.getPath("userData"), "config.json");
const readCfg = (): DesktopConfig => { try { return JSON.parse(fs.readFileSync(cfgFile(), "utf8")); } catch { return {}; } };
const writeCfg = (c: DesktopConfig) => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); };
let cfg = readCfg();

/* ---- 로그 ---- */
const logFile = () => path.join(app.getPath("logs"), "sync.log");
function log(s: string) {
  const line = `[${new Date().toLocaleString("ko-KR")}] ${s}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    // 1MB 넘으면 한 번 비운다
    if (fs.existsSync(logFile()) && fs.statSync(logFile()).size > 1 << 20) fs.renameSync(logFile(), logFile() + ".old");
    fs.appendFileSync(logFile(), line + "\n");
  } catch { /* 로그 실패는 무시 */ }
}

/* ---- 앱 화면: app://solo/ 로 dist 폴더를 보여 준다 ---- */
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
function serveDist() {
  const dist = path.join(appRoot, "dist");
  protocol.handle("app", (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    let f = path.normalize(path.join(dist, p));
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
    return net.fetch(pathToFileURL(f).toString());
  });
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function createWindow(show: boolean) {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 500, show: false, title: APP_NAME,
    icon: path.join(appRoot, "build", "icon.png"), backgroundColor: "#f4f5f2", autoHideMenuBar: true,
    webPreferences: { preload: path.join(import.meta.dirname, "preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.loadURL(devUrl || "app://solo/index.html");
  if (show) win.once("ready-to-show", () => win?.show());
  // 바깥 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(devUrl || "app://solo")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // 창을 닫으면 트레이로 (동기화 계속)
  let told = false;
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
    if (!told && Notification.isSupported()) { told = true; new Notification({ title: APP_NAME, body: "창을 닫아도 트레이에서 자동 동기화를 계속합니다. 끝내려면 트레이 아이콘 → 끝내기" }).show(); }
  });
}
const showWindow = () => { if (!win) createWindow(true); else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } };

/* ---- 로그인 정보: 화면(renderer)이 알려 준다 ---- */
let auth: { token: string; uid: string } | null = null;
let sb: SupabaseClient | null = null;
let service: SyncService | null = null;
let serviceUid = "";
let status: SyncStatus = { state: "waiting", message: "로그인하면 동기화를 시작합니다", at: new Date().toISOString() };

function setStatus(s: SyncStatus) {
  status = s;
  tray?.setToolTip(`${APP_NAME} — ${s.message}`.slice(0, 127));
  buildTrayMenu();
  win?.webContents.send("solo:status", s);
}

function supabaseFor(): SupabaseClient {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error("Supabase 설정이 없습니다");
  // 화면에서 로그인한 토큰을 그대로 쓴다 (토큰이 바뀌면 화면이 다시 알려 줌)
  return createClient(cfg.supabaseUrl, cfg.supabaseKey, { accessToken: async () => auth?.token ?? null });
}

async function connect() {
  if (!auth) throw new Error("로그인되어 있지 않습니다 — CRM 창에서 로그인하세요");
  sb ??= supabaseFor();
  const { data: p } = await sb.from("profiles").select("role").eq("id", auth.uid).maybeSingle();
  if (p?.role !== "sync" && p?.role !== "admin") throw new Error(`이 PC의 자동 동기화는 관리자 계정으로 로그인했을 때 돌아갑니다 (지금 권한: ${p?.role ?? "없음"})`);
  return { sb, uid: auth.uid };
}

function startService() {
  if (!auth || cfg.paused) return;
  if (service && serviceUid === auth.uid) return;
  service?.stop();
  serviceUid = auth.uid;
  service = createSyncService({ connect, log, onStatus: setStatus }, { watch: true });
  log("자동 동기화 시작");
  service.start().catch((e) => log("동기화를 시작하지 못했습니다: " + (e as Error).message));
}
function stopService(msg: string) {
  service?.stop(); service = null; serviceUid = "";
  setStatus({ state: "off", message: msg, at: new Date().toISOString() });
}

ipcMain.on("solo:config", (e) => { e.returnValue = { supabaseUrl: cfg.supabaseUrl ?? "", supabaseKey: cfg.supabaseKey ?? "", version: app.getVersion() }; });
ipcMain.handle("solo:saveConfig", (_e, c: { supabaseUrl: string; supabaseKey: string }) => {
  const url = String(c.supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(c.supabaseKey || "").trim();
  if (!/^https:\/\/[^\s/]+$/.test(url)) throw new Error("Supabase 주소는 https://… 형태여야 합니다");
  if (/^sb_secret_|service_role/i.test(key)) throw new Error("비밀(secret/service_role) 키는 넣지 마세요. 공개(anon/publishable) 키를 넣습니다");
  cfg = { ...cfg, supabaseUrl: url, supabaseKey: key };
  writeCfg(cfg);
  stopService("설정이 바뀌었습니다 — 다시 로그인하세요");
  auth = null; sb = null;
  win?.reload();
});
ipcMain.handle("solo:resetConfig", () => {
  cfg = { ...cfg, supabaseUrl: undefined, supabaseKey: undefined };
  writeCfg(cfg);
  stopService("Supabase 설정을 지웠습니다");
  auth = null; sb = null;
  win?.reload();
});
ipcMain.on("solo:auth", (_e, a: { token: string; uid: string } | null) => {
  const prevUid = auth?.uid;
  auth = a && a.token && a.uid ? { token: a.token, uid: a.uid } : null;
  if (!auth) { if (prevUid) stopService("로그아웃 — 로그인하면 동기화를 다시 시작합니다"); sb = null; return; }
  if (prevUid && prevUid !== auth.uid) { stopService("계정이 바뀌었습니다"); sb = null; }
  sb?.realtime.setAuth(auth.token);
  startService();
});
ipcMain.handle("solo:status", () => status);
ipcMain.handle("solo:syncNow", () => { if (service) service.once(); else startService(); });

/* ---- 트레이 ---- */
function buildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${APP_NAME} 열기`, click: showWindow },
    { type: "separator" },
    { label: status.message.slice(0, 60), enabled: false },
    { label: "지금 동기화", enabled: !!auth && !cfg.paused, click: () => { if (service) service.once(); else startService(); } },
    { label: "자동 동기화 잠시 멈춤", type: "checkbox", checked: !!cfg.paused, click: (m) => {
      cfg = { ...cfg, paused: m.checked }; writeCfg(cfg);
      if (m.checked) stopService("자동 동기화를 멈췄습니다"); else startService();
    } },
    { label: "동기화 기록 보기", click: () => { if (fs.existsSync(logFile())) shell.openPath(logFile()); else shell.openPath(path.dirname(logFile())); } },
    { type: "separator" },
    { label: "Windows 시작 시 자동 실행", type: "checkbox", checked: login, click: (m) => {
      app.setLoginItemSettings({ openAtLogin: m.checked, args: ["--hidden"] });
      buildTrayMenu();
    } },
    { label: `버전 ${app.getVersion()} · HANUL AI Inc.`, enabled: false },
    { label: "끝내기", click: () => { quitting = true; app.quit(); } },
  ]));
}

app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; service?.stop(); });
app.on("window-all-closed", () => { /* 트레이에 남는다 */ });

app.whenReady().then(() => {
  serveDist();
  Menu.setApplicationMenu(null);
  // 폴더 선택: CRM 화면에서 「탐색기로 선택」을 누르면 이 PC에 Windows 폴더 선택 창을 띄운다
  setFolderPicker(async (start, title) => {
    showWindow();
    const r = await dialog.showOpenDialog(win!, { title, defaultPath: start || app.getPath("home"), properties: ["openDirectory"], buttonLabel: "이 폴더 선택" });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  // 설치 후 처음 한 번은 Windows 시작 시 자동 실행을 켜 둔다 (트레이 메뉴에서 끌 수 있음)
  if (app.isPackaged && !cfg.autoStartSet) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
    cfg = { ...cfg, autoStartSet: true }; writeCfg(cfg);
  }
  tray = new Tray(nativeImage.createFromPath(path.join(appRoot, "build", "tray.png")));
  tray.on("click", showWindow);
  setStatus(status);
  // 자동 실행(--hidden)이면 창은 숨긴 채로 열어 로그인 상태만 이어받는다
  createWindow(!startHidden);
});
