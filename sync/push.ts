// 스캔 결과를 Supabase CRM에 반영한다.
//  - 동기화 전용 계정(profiles.role = 'sync')으로 로그인 — .env.local 의 SYNC_EMAIL / SYNC_PASSWORD
//  - source_key 로 같은 건을 찾아 갱신하므로 여러 번 돌려도 중복이 생기지 않는다
//  - 사람이 CRM에서 고친 칸(locked)은 건드리지 않는다. 계산서 발행·수금 칸은 동기화가 아예 쓰지 않는다
//  - 아무것도 지우지 않는다
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.ts";
import { normCompany } from "./parse.ts";
import { normProject, type Issue, type PlannedDeal, type PlannedLedger } from "./group.ts";

type Row = Record<string, unknown>;

export function loadEnv() {
  const f = path.join(import.meta.dirname, "..", ".env.local");
  if (fs.existsSync(f)) process.loadEnvFile(f);
  const need = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SYNC_EMAIL", "SYNC_PASSWORD"];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`.env.local 에 ${missing.join(", ")} 가 없습니다. README 「자동 동기화 설정」을 보세요.`);
}

export async function connect() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: process.env.SYNC_EMAIL!, password: process.env.SYNC_PASSWORD! });
  if (error || !data.user) throw new Error("동기화 계정으로 로그인하지 못했습니다: " + (error?.message ?? ""));
  const { data: p } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  // 관리자 계정 하나로 돌려도 되고(0003), 별도 sync 계정을 써도 된다
  if (p?.role !== "sync" && p?.role !== "admin") throw new Error(`동기화에 쓴 계정의 권한이 관리자(admin) 또는 sync 가 아닙니다 (지금: ${p?.role ?? "없음"}).`);
  return { sb, uid: data.user.id };
}

const rel = (f: string) => path.relative(config.root, f);
export const dealKey = (d: PlannedDeal) => {
  if (!d.quotes.length) return `l:${normCompany(d.client)}:${normProject(d.name)}`;
  const nos = d.quotes.map((q) => q.no).filter(Boolean).sort() as string[];
  return `q:${normCompany(d.client)}:${nos[0] ?? rel(d.quotes[0].file)}`;
};
export const ledgerKey = (l: PlannedLedger) => `l:${normCompany(l.doc.client)}:${normProject(l.doc.project)}`;

// Postgres jsonb 는 저장할 때 키 순서를 바꾸므로, 키를 정렬해서 비교한다
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Row).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
  : v ?? null;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// 잠긴 칸을 빼고 달라진 칸만
function patchOf(existing: Row, next: Row) {
  const locked = new Set((existing.locked as string[]) || []);
  const out: Row = {};
  for (const [k, v] of Object.entries(next)) {
    if (k === "source_files") { if (!same(existing[k], v)) out[k] = v; continue; }
    if (locked.has(k)) continue;
    if (!same(existing[k], v)) out[k] = v;
  }
  if (process.env.SYNC_DEBUG && Object.keys(out).length) {
    console.log("[debug] 달라진 칸", Object.keys(out).map((k) => `${k}: ${JSON.stringify(existing[k])?.slice(0, 80)} → ${JSON.stringify(out[k])?.slice(0, 80)}`));
  }
  return out;
}

async function all(sb: SupabaseClient, table: string, cols: string) {
  const { data, error } = await sb.from(table).select(cols).not("source_key", "is", null);
  if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
  return (data as unknown as Row[]) || [];
}

export interface PushStats { dealsNew: number; dealsUpdated: number; ledgerNew: number; ledgerUpdated: number; issuesOpen: number; issuesClosed: number; lockedSkipped: number }

export async function push(sb: SupabaseClient, uid: string, r: { deals: PlannedDeal[]; ledger: PlannedLedger[]; issues: Issue[] }): Promise<PushStats> {
  const stats: PushStats = { dealsNew: 0, dealsUpdated: 0, ledgerNew: 0, ledgerUpdated: 0, issuesOpen: 0, issuesClosed: 0, lockedSkipped: 0 };

  // 담당자 이름 → 직원 id (「홍길동」 ↔ 「홍 길 동」)
  const { data: people } = await sb.from("profiles").select("id, name");
  const byName = new Map(((people as Row[]) || []).map((p) => [String(p.name || "").replace(/\s+/g, ""), p.id as string]));
  const ownerId = (n: string | null) => (n ? byName.get(n.replace(/\s+/g, "")) ?? null : null);

  /* ---- 견적 ---- */
  const exDeals = new Map((await all(sb, "deals", "*")).map((x) => [x.source_key as string, x]));
  const dealIdByPlan = new Map<string, string>();
  for (const d of r.deals) {
    const key = dealKey(d);
    const files = [
      ...d.quotes.map((q) => ({ kind: "quote", file: rel(q.file), date: q.date, amt: q.amt })),
      ...d.pos.map((p) => ({ kind: "po", file: rel(p.file), date: p.date })),
      ...(d.ledger ? [{ kind: "ledger", file: rel(d.ledger.file), date: d.ledger.date }] : []),
    ];
    const row: Row = {
      stage: d.stage, date: d.date, client: d.client, end_client: d.end, name: d.name, no: d.no, ver: d.ver, amt: d.amt,
      memo: d.memo || null, owner: ownerId(d.owner), source_files: files,
    };
    const ex = exDeals.get(key);
    if (ex) {
      const patch = patchOf(ex, row);
      stats.lockedSkipped += ((ex.locked as string[]) || []).filter((k) => k in row && !same(ex[k], row[k])).length;
      if (Object.keys(patch).length) {
        const { error } = await sb.from("deals").update({ ...patch, updated_by: uid, sync_write: true }).eq("id", ex.id as string);
        if (error) throw new Error(`견적 갱신 실패 (${d.name}): ${error.message}`);
        stats.dealsUpdated++;
      }
      dealIdByPlan.set(d.key, ex.id as string);
    } else {
      const { data, error } = await sb.from("deals").insert({ ...row, source: "sync", source_key: key, created_by: uid, updated_by: uid }).select("id").single();
      if (error) throw new Error(`견적 추가 실패 (${d.name}): ${error.message}`);
      dealIdByPlan.set(d.key, (data as Row).id as string);
      stats.dealsNew++;
    }
  }

  /* ---- 판매원장 (계산서 발행·수금·분할 청구 칸은 사람이 관리 → 쓰지 않음) ---- */
  const exLedger = new Map((await all(sb, "ledger", "*")).map((x) => [x.source_key as string, x]));
  for (const l of r.ledger) {
    if (!l.doc.date) continue; // 계약일 없는 판매원장은 확인 필요로만
    const key = ledgerKey(l);
    const row: Row = {
      deal_id: l.dealKey ? dealIdByPlan.get(l.dealKey) ?? null : null, client: l.doc.client, name: l.doc.project, date: l.doc.date,
      file: path.basename(l.doc.file).replace(/\.[^.]+$/, ""), sale: l.doc.sale ?? 0, cost: l.doc.cost ?? 0,
      owner: ownerId(l.doc.writer), source_files: [{ kind: "ledger", file: rel(l.doc.file), invoiceDue: l.doc.invoiceDue }],
    };
    const ex = exLedger.get(key);
    if (ex) {
      const patch = patchOf(ex, row);
      if (Object.keys(patch).length) {
        const { error } = await sb.from("ledger").update({ ...patch, updated_by: uid, sync_write: true }).eq("id", ex.id as string);
        if (error) throw new Error(`판매원장 갱신 실패 (${l.doc.project}): ${error.message}`);
        stats.ledgerUpdated++;
      }
    } else {
      const { error } = await sb.from("ledger").insert({ ...row, source: "sync", source_key: key, created_by: uid, updated_by: uid });
      if (error) throw new Error(`판매원장 추가 실패 (${l.doc.project}): ${error.message}`);
      stats.ledgerNew++;
    }
  }

  /* ---- 확인 필요 ---- */
  const review = r.issues.filter((x) => !x.auto);
  const keys = new Set<string>();
  for (const x of review) {
    const key = `${x.title}|${x.file}`;
    keys.add(key);
    // 이미 사람이 처리·무시한 항목은 상태를 되돌리지 않는다 (upsert 는 내용만 갱신)
    const { data: ex } = await sb.from("sync_issues").select("id, status").eq("key", key).maybeSingle();
    if (ex) await sb.from("sync_issues").update({ title: x.title, detail: x.detail, file: x.file }).eq("id", (ex as Row).id as string);
    else { await sb.from("sync_issues").insert({ key, title: x.title, detail: x.detail, file: x.file }); stats.issuesOpen++; }
  }
  // 이번에 다시 나오지 않은 열린 항목은 저절로 풀린 것 (파일을 고쳤거나 엑셀을 저장함)
  const { data: open } = await sb.from("sync_issues").select("id, key").eq("status", "open");
  for (const o of (open as Row[]) || []) {
    if (!keys.has(o.key as string)) { await sb.from("sync_issues").update({ status: "resolved" }).eq("id", o.id as string); stats.issuesClosed++; }
  }
  return stats;
}
