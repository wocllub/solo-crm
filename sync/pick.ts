// 그 PC 화면에 탐색기 모양의 「폴더 선택」 창을 띄워 고른 폴더 경로를 돌려준다
//  - Windows: sync/pick-folder.ps1 (Windows 파일 대화상자)
//  - 리눅스: zenity (화면이 있는 PC). 화면 없는 서버에서는 경로를 직접 입력
import { execFile } from "node:child_process";
import path from "node:path";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; out: string; err: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: false, maxBuffer: 1 << 20 }, (e, stdout, stderr) => {
      const code = e ? (typeof (e as unknown as { code?: unknown }).code === "number" ? ((e as unknown as { code: number }).code) : 1) : 0;
      resolve({ code, out: String(stdout), err: String(stderr) || (e ? e.message : ""), timedOut: !!(e as { killed?: boolean } | null)?.killed });
    });
  });
}

// 데스크톱 앱은 자기 창(Electron 대화상자)으로 바꿔 끼운다
type Picker = (start: string, title: string) => Promise<string | null>;
let custom: Picker | null = null;
export const setFolderPicker = (p: Picker | null) => { custom = p; };

// null = 취소. 창을 띄울 수 없으면 예외
export async function pickFolderNative(start: string, title = "Solo-CRM — 영업 폴더 선택"): Promise<string | null> {
  if (custom) return custom(start, title);
  const limit = 10 * 60_000; // 사람이 고를 시간
  if (process.platform === "win32") {
    const ps1 = path.join(import.meta.dirname, "pick-folder.ps1");
    const r = await run("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", ps1, "-StartB64", b64(start || ""), "-TitleB64", b64(title)], limit);
    const line = r.out.trim().split(/\r?\n/).pop() || "";
    if (line === "CANCEL") return null;
    if (line.startsWith("OK:")) return Buffer.from(line.slice(3), "base64").toString("utf8");
    if (r.timedOut) throw new Error("10분 동안 폴더를 고르지 않아 「폴더 선택」 창을 닫았습니다. 다시 눌러 주세요.");
    throw new Error("폴더 선택 창을 띄우지 못했습니다: " + (r.err || line).slice(0, 200));
  }
  if (process.platform === "linux") {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("화면이 없는 PC라 폴더 선택 창을 띄울 수 없습니다. 경로를 직접 입력하세요.");
    const r = await run("zenity", ["--file-selection", "--directory", `--title=${title}`, ...(start ? [`--filename=${start.replace(/\/?$/, "/")}`] : [])], limit);
    if (r.code === 0) return r.out.trim() || null;
    if (r.code === 1) return null; // 취소
    if (r.timedOut) throw new Error("10분 동안 폴더를 고르지 않아 「폴더 선택」 창을 닫았습니다. 다시 눌러 주세요.");
    throw new Error("폴더 선택 창(zenity)을 띄우지 못했습니다. 'sudo apt install zenity' 후 다시 해 보거나 경로를 직접 입력하세요.");
  }
  throw new Error("이 운영체제에서는 폴더 선택 창을 지원하지 않습니다. 경로를 직접 입력하세요.");
}
