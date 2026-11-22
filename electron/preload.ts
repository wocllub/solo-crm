// CRM 화면에서 데스크톱 앱 기능을 쓰는 다리 (window.soloDesktop)
import { contextBridge, ipcRenderer } from "electron";

const config = ipcRenderer.sendSync("solo:config") as { supabaseUrl: string; supabaseKey: string; version: string };

contextBridge.exposeInMainWorld("soloDesktop", {
  config,
  saveConfig: (c: { supabaseUrl: string; supabaseKey: string }) => ipcRenderer.invoke("solo:saveConfig", c),
  resetConfig: () => ipcRenderer.invoke("solo:resetConfig"),
  setAuth: (a: { token: string; uid: string } | null) => ipcRenderer.send("solo:auth", a),
  getStatus: () => ipcRenderer.invoke("solo:status"),
  syncNow: () => ipcRenderer.invoke("solo:syncNow"),
  // 앱이 「토큰을 새로 받아 달라」고 할 때 (창이 숨겨져 있어 자동 갱신이 멈췄을 때)
  onRefreshRequest: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on("solo:refresh", h);
    return () => { ipcRenderer.removeListener("solo:refresh", h); };
  },
  onStatus: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on("solo:status", h);
    return () => { ipcRenderer.removeListener("solo:status", h); };
  },
});
