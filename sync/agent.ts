// 이 PC를 「동기화 PC」로 등록하고, CRM 화면에서 정한 설정(영업 폴더·기준일·켜기/끄기)을 읽어 온다
import fs from "node:fs";
import os from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config, setCompanyNames } from "./config.ts";
import { pickFolderNative } from "./pick.ts";

export interface AgentState {
  id: string;
  enabled: boolean;
  root: string;
  since: string;
  folderOk: boolean;
}

type Row = Record<string, unknown>;
const machine = () => os.hostname();

// 등록(없으면) → 설정 적용 → 상태(마지막 접속·폴더 확인) 기록
export async function syncAgent(sb: SupabaseClient, uid: string): Promise<AgentState> {
  const { data: found, error } = await sb.from("sync_agents").select("*").eq("user_id", uid).eq("machine", machine()).maybeSingle();
  if (error) throw new Error("동기화 PC 설정을 읽지 못했습니다 (0004_sync_agents.sql 적용 여부 확인): " + error.message);
  let row = found as Row | null;
  if (!row) {
    // 처음 켜진 PC: 지금 쓰던 폴더(SALES_DIR 또는 기본값)로 등록 — 이후로는 CRM 화면에서 바꾼다
    const { data, error: e2 } = await sb.from("sync_agents").insert({
      user_id: uid, machine: machine(), platform: process.platform, sales_dir: config.root || null, since: config.since,
    }).select("*").single();
    if (e2) throw new Error("동기화 PC를 등록하지 못했습니다: " + e2.message);
    row = data as Row;
  }
  if (row.sales_dir) config.root = String(row.sales_dir);
  if (row.since) config.since = String(row.since);
  const folderOk = fs.existsSync(config.root);
  await sb.from("sync_agents").update({ platform: process.platform, last_seen: new Date().toISOString(), folder_ok: folderOk }).eq("id", row.id as string);
  return { id: row.id as string, enabled: row.enabled !== false, root: config.root, since: config.since, folderOk };
}

// CRM 설정 「우리 회사 이름」(settings.company = { names: [...] })을 읽어 적용. 없으면 환경변수 OUR_COMPANY
export async function loadCompany(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("settings").select("value").eq("key", "company").maybeSingle();
  const names = ((data?.value as { names?: unknown } | null)?.names);
  if (Array.isArray(names) && names.some((n) => typeof n === "string" && n.trim())) setCompanyNames(names.filter((n): n is string => typeof n === "string"));
  return config.companyNames;
}

export async function agentError(sb: SupabaseClient, id: string, msg: string | null) {
  await sb.from("sync_agents").update({ last_error: msg }).eq("id", id);
}

/* ---- 폴더 찾아보기: CRM 화면이 요청하면 이 PC의 폴더 목록을 돌려준다 ---- */
export interface BrowseResult {
  path: string;             // 지금 보고 있는 폴더 ("" = 처음 화면: 드라이브·내 폴더)
  parent: string | null;    // 위 폴더 ("" = 처음 화면, null = 없음)
  sep: string;
  dirs: string[];           // 하위 폴더 이름
  roots: { label: string; path: string }[];
  error?: string;
}

function roots(): BrowseResult["roots"] {
  const home = os.homedir();
  const out: BrowseResult["roots"] = [{ label: "내 폴더", path: home }];
  try {
    // OneDrive(회사·개인) 폴더는 바로가기로
    for (const e of fs.readdirSync(home, { withFileTypes: true })) {
      if (/^OneDrive/i.test(e.name) && isDir(e, home)) out.push({ label: e.name, path: `${home}${path_sep()}${e.name}` });
    }
  } catch { /* */ }
  if (process.platform === "win32") {
    for (const d of "CDEFGHIJKLMNOPQRSTUVWXYZ") { const p = `${d}:\\`; if (fs.existsSync(p)) out.push({ label: `${d}: 드라이브`, path: p }); }
  } else {
    out.push({ label: "/ (최상위)", path: "/" });
  }
  return out;
}
const path_sep = () => (process.platform === "win32" ? "\\" : "/");
// 회사 OneDrive 폴더처럼 「연결(재분석 지점)」로 보이는 폴더도 폴더로 본다
const isDir = (e: fs.Dirent, parent: string) => {
  if (e.isDirectory()) return true;
  if (e.isFile()) return false;
  try { return fs.statSync(parent.replace(/[\\/]+$/, "") + path_sep() + e.name).isDirectory(); } catch { return false; }
};

export function listFolder(p: string | null): BrowseResult {
  const sep = path_sep();
  const base: BrowseResult = { path: "", parent: null, sep, dirs: [], roots: roots() };
  if (!p) return base;
  const here = p.trim();
  try {
    const dirs = fs.readdirSync(here, { withFileTypes: true })
      .filter((e) => !/^[.$]/.test(e.name) && !/^(System Volume Information|Recovery|PerfLogs)$/i.test(e.name) && isDir(e, here))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "ko"))
      .slice(0, 500);
    const up = here.replace(/[\\/]+$/, "");
    const cut = up.lastIndexOf(sep);
    // C:\ 나 / 처럼 맨 위면 위로 가기 = 처음 화면
    const parent = /^[A-Za-z]:\\?$/.test(here) || here === "/" ? "" : cut <= 0 ? (sep === "/" ? "/" : "") : /^[A-Za-z]:$/.test(up.slice(0, cut)) ? up.slice(0, cut) + "\\" : up.slice(0, cut);
    return { ...base, path: here, parent, dirs };
  } catch (e) {
    return { ...base, path: here, parent: "", error: "폴더를 열 수 없습니다: " + (e as Error).message.slice(0, 120) };
  }
}

// 요청이 「pick:시작폴더」이면 이 PC 화면에 탐색기 「폴더 선택」 창을 띄운다 (사람이 고를 때까지 기다림)
export const PICK = "pick:";

// 돌려주는 값: 로그용 한 줄 요약
export async function answerBrowse(sb: SupabaseClient, id: string, reqAt: string, browsePath: string | null): Promise<string> {
  const send = (r: object) => sb.from("sync_agents").update({ browse_result: { ...r, req_at: reqAt } }).eq("id", id);
  if (browsePath?.startsWith(PICK)) {
    const start = browsePath.slice(PICK.length);
    await send({ ...listFolder(start || null), picking: true }); // 화면: 「PC에 창을 띄웠습니다」
    const t0 = Date.now();
    try {
      const chosen = await pickFolderNative(start || os.homedir());
      await send(chosen ? { ...listFolder(chosen), picked: true } : { ...listFolder(start || null), cancelled: true });
      return `${chosen ? "선택 " + chosen : "취소"} (${Math.round((Date.now() - t0) / 1000)}초)`;
    } catch (e) {
      await send({ ...listFolder(start || null), error: (e as Error).message });
      return "오류 " + (e as Error).message;
    }
  }
  await send(listFolder(browsePath));
  return "목록";
}
