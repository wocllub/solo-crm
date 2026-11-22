// 데스크톱 앱(Electron) 안에서 열렸을 때만 있는 기능 — 웹 브라우저에서는 undefined
export interface DesktopSyncStatus {
  state: "idle" | "running" | "error" | "off" | "waiting";
  message: string;
  root?: string;
  at: string;
}

export interface SoloDesktop {
  config: { supabaseUrl: string; supabaseKey: string; version: string };
  saveConfig(c: { supabaseUrl: string; supabaseKey: string }): Promise<void>;
  resetConfig(): Promise<void>;
  setAuth(a: { token: string; uid: string } | null): void;
  getStatus(): Promise<DesktopSyncStatus>;
  syncNow(): Promise<void>;
  onStatus(cb: (s: DesktopSyncStatus) => void): () => void;
  onRefreshRequest?(cb: () => void): () => void;
}

export const desktop: SoloDesktop | undefined = (globalThis as { soloDesktop?: SoloDesktop }).soloDesktop;
