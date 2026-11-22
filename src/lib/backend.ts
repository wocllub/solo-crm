// 데이터 저장소 — Supabase 구현. 화면은 Backend 인터페이스만 본다 (데모 모드는 lib/demo.ts).
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Deal, DealInput, Layout, LedgerInput, LedgerRow, Me, SyncAgent, SyncIssue, SyncRun } from "./types";

export type Role = "pending" | "viewer" | "member" | "admin";

export interface Session {
  me: Me;
  role: Role;
}

export interface Listeners {
  deals: (rows: Deal[]) => void;
  ledger: (rows: LedgerRow[]) => void;
  setting: (key: string, value: unknown | null) => void;
  issues?: (rows: SyncIssue[]) => void; // 확인 필요 (열린 것만)
  lastRun?: (run: SyncRun | null) => void; // 마지막 자동 동기화
  agents?: (rows: SyncAgent[]) => void; // 동기화 PC·폴더 설정
  error: (e: unknown) => void;
}

export interface Backend {
  demo: boolean;
  listen(l: Listeners): () => void;
  addDeal(d: DealInput): Promise<void>;
  putDeal(id: string, d: DealInput): Promise<void>;
  delDeal(id: string): Promise<void>;
  addLedger(r: LedgerInput): Promise<void>;
  putLedger(id: string, r: LedgerInput): Promise<void>;
  delLedger(id: string): Promise<void>;
  setSetting(key: string, value: unknown): Promise<void>;
  getMyLayout(): Promise<unknown | null>;
  setMyLayout(l: Layout): Promise<void>;
  names(): Promise<Record<string, string>>;
  setIssue(id: string, status: SyncIssue["status"]): Promise<void>;
  setAgent(id: string, patch: { salesDir?: string | null; since?: string | null; enabled?: boolean }): Promise<void>;
  delAgent(id: string): Promise<void>;
  browseAgent(id: string, path: string): Promise<string>; // 폴더 찾아보기 요청 — 요청 시각을 돌려줌
  signOut(): Promise<void>;
}

export class WriteError extends Error {
  code: "forbidden" | "other";
  constructor(code: "forbidden" | "other", msg: string) {
    super(msg);
    this.code = code;
  }
}

/* ---------- 이름 변환: 앱(camelCase) ↔ DB(snake_case) ---------- */
type Row = Record<string, unknown>;

const dealFromRow = (r: Row): Deal => ({
  id: r.id as string, stage: r.stage as Deal["stage"], date: (r.date as string) ?? null, client: r.client as string,
  end: (r.end_client as string) ?? null, name: r.name as string, no: (r.no as string) ?? null, ver: (r.ver as string) ?? null,
  amt: Number(r.amt) || 0, memo: (r.memo as string) ?? null, owner: (r.owner as string) ?? null,
  createdAt: r.created_at as string, createdBy: (r.created_by as string) ?? null,
  updatedAt: r.updated_at as string, updatedBy: (r.updated_by as string) ?? null,
  source: (r.source as Deal["source"]) ?? "manual", sourceFiles: (r.source_files as Deal["sourceFiles"]) ?? null, locked: (r.locked as string[]) ?? [],
});

const dealToRow = (d: Partial<DealInput>): Row => {
  const o: Row = {
    stage: d.stage, date: d.date || null, client: d.client, end_client: d.end || null, name: d.name,
    no: d.no || null, ver: d.ver || null, amt: d.amt, memo: d.memo || null, owner: d.owner || null,
    updated_by: d.updatedBy ?? null,
  };
  if (d.createdBy !== undefined) o.created_by = d.createdBy;
  return o;
};

const ledgerFromRow = (r: Row): LedgerRow => ({
  id: r.id as string, dealId: (r.deal_id as string) ?? null, client: r.client as string, end: (r.end_client as string) ?? null,
  name: r.name as string, date: r.date as string, file: (r.file as string) ?? null, sale: Number(r.sale) || 0, cost: Number(r.cost) || 0,
  taxType: (r.tax_type as LedgerRow["taxType"]) || "taxable", invoiced: !!r.invoiced, invoicedAt: (r.invoiced_at as string) ?? null,
  paid: !!r.paid, paidAt: (r.paid_at as string) ?? null, parts: (r.parts as LedgerRow["parts"]) ?? null, owner: (r.owner as string) ?? null,
  createdAt: r.created_at as string, createdBy: (r.created_by as string) ?? null,
  updatedAt: r.updated_at as string, updatedBy: (r.updated_by as string) ?? null,
  source: (r.source as Deal["source"]) ?? "manual", sourceFiles: (r.source_files as Deal["sourceFiles"]) ?? null, locked: (r.locked as string[]) ?? [],
});

const ledgerToRow = (l: Partial<LedgerInput>): Row => {
  const o: Row = {
    deal_id: l.dealId || null, client: l.client, end_client: l.end || null, name: l.name, date: l.date, file: l.file || null,
    sale: l.sale, cost: l.cost, tax_type: l.taxType || "taxable", invoiced: !!l.invoiced, invoiced_at: l.invoicedAt || null,
    paid: !!l.paid, paid_at: l.paidAt || null, parts: l.parts && l.parts.length ? l.parts : null, owner: l.owner || null,
    updated_by: l.updatedBy ?? null,
  };
  if (l.createdBy !== undefined) o.created_by = l.createdBy;
  return o;
};

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  // 42501 = RLS 권한 없음
  if (error.code === "42501" || /row-level security/i.test(error.message)) throw new WriteError("forbidden", error.message);
  throw new WriteError("other", error.message);
}

/* ---------- Supabase 구현 ---------- */
export async function loadSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const { data: p } = await supabase.from("profiles").select("name, avatar_url, role").eq("id", u.id).maybeSingle();
  return {
    me: { id: u.id, name: (p?.name as string) || u.email?.split("@")[0] || "나", avatarUrl: (p?.avatar_url as string) ?? null, email: u.email ?? null },
    role: (p?.role as Role) || "pending",
  };
}

export function supabaseBackend(myId: string): Backend {
  const sb = supabase!;
  return {
    demo: false,
    listen(l) {
      let deals: Deal[] = [];
      let ledger: LedgerRow[] = [];
      const upsert = <T extends { id: string }>(list: T[], row: T) => {
        const i = list.findIndex((x) => x.id === row.id);
        return i < 0 ? [...list, row] : list.map((x, k) => (k === i ? row : x));
      };
      const loadAll = async () => {
        const [d, g, s] = await Promise.all([
          sb.from("deals").select("*"),
          sb.from("ledger").select("*"),
          sb.from("settings").select("key, value"),
        ]);
        if (d.error || g.error || s.error) { l.error(d.error || g.error || s.error); return; }
        deals = (d.data as Row[]).map(dealFromRow); l.deals(deals);
        ledger = (g.data as Row[]).map(ledgerFromRow); l.ledger(ledger);
        (s.data as Row[]).forEach((r) => l.setting(r.key as string, r.value));
        loadSync();
      };
      // 자동 동기화 (0002_sync.sql 을 적용하지 않았으면 조용히 건너뜀)
      const loadSync = async () => {
        const [iss, run, ag] = await Promise.all([
          sb.from("sync_issues").select("*").eq("status", "open").order("created_at", { ascending: false }),
          sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
          sb.from("sync_agents").select("*").order("created_at"),
        ]);
        if (!iss.error) l.issues?.((iss.data as Row[]).map(issueFromRow));
        if (!run.error) l.lastRun?.(run.data ? runFromRow(run.data as Row) : null);
        if (!ag.error) l.agents?.((ag.data as Row[]).map(agentFromRow));
      };
      // 실시간 반영 (원본의 onSnapshot 대체)
      const ch: RealtimeChannel = sb
        .channel("crm")
        .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, (p) => {
          if (p.eventType === "DELETE") deals = deals.filter((x) => x.id !== (p.old as Row).id);
          else deals = upsert(deals, dealFromRow(p.new as Row));
          l.deals(deals);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "ledger" }, (p) => {
          if (p.eventType === "DELETE") ledger = ledger.filter((x) => x.id !== (p.old as Row).id);
          else ledger = upsert(ledger, ledgerFromRow(p.new as Row));
          l.ledger(ledger);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, (p) => {
          if (p.eventType === "DELETE") l.setting((p.old as Row).key as string, null);
          else l.setting((p.new as Row).key as string, (p.new as Row).value);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "sync_issues" }, () => { loadSync(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "sync_runs" }, () => { loadSync(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "sync_agents" }, () => { loadSync(); })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") loadAll();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") l.error(new Error(status));
        });
      return () => { sb.removeChannel(ch); };
    },
    async addDeal(d) { check((await sb.from("deals").insert(dealToRow(d))).error); },
    async putDeal(id, d) { check((await sb.from("deals").update(dealToRow(d)).eq("id", id)).error); },
    async delDeal(id) { check((await sb.from("deals").delete().eq("id", id)).error); },
    async addLedger(r) { check((await sb.from("ledger").insert(ledgerToRow(r))).error); },
    async putLedger(id, r) { check((await sb.from("ledger").update(ledgerToRow(r)).eq("id", id)).error); },
    async delLedger(id) { check((await sb.from("ledger").delete().eq("id", id)).error); },
    async setSetting(key, value) { check((await sb.from("settings").upsert({ key, value, updated_by: myId })).error); },
    async getMyLayout() {
      const { data } = await sb.from("dashboard_layouts").select("layout").eq("user_id", myId).maybeSingle();
      return data?.layout ?? null;
    },
    async setMyLayout(layout) {
      check((await sb.from("dashboard_layouts").upsert({ user_id: myId, layout, updated_at: new Date().toISOString() })).error);
    },
    async names() {
      const { data } = await sb.from("profiles").select("id, name");
      return Object.fromEntries(((data as Row[]) || []).map((p) => [p.id as string, (p.name as string) || "직원"]));
    },
    async setIssue(id, status) {
      check((await sb.from("sync_issues").update({ status, resolved_by: status === "open" ? null : myId }).eq("id", id)).error);
    },
    async setAgent(id, p) {
      const row: Row = {};
      if (p.salesDir !== undefined) row.sales_dir = p.salesDir;
      if (p.since !== undefined) row.since = p.since;
      if (p.enabled !== undefined) row.enabled = p.enabled;
      check((await sb.from("sync_agents").update(row).eq("id", id)).error);
    },
    async delAgent(id) { check((await sb.from("sync_agents").delete().eq("id", id)).error); },
    async browseAgent(id, path) {
      const reqAt = new Date().toISOString();
      check((await sb.from("sync_agents").update({ browse_path: path || null, browse_req_at: reqAt }).eq("id", id)).error);
      return reqAt;
    },
    async signOut() { await sb.auth.signOut(); },
  };
}

const issueFromRow = (r: Row): SyncIssue => ({
  id: r.id as string, title: r.title as string, detail: (r.detail as string) ?? null, file: (r.file as string) ?? null,
  status: r.status as SyncIssue["status"], createdAt: r.created_at as string,
});
const agentFromRow = (r: Row): SyncAgent => ({
  id: r.id as string, userId: r.user_id as string, machine: r.machine as string, platform: (r.platform as string) ?? null,
  salesDir: (r.sales_dir as string) ?? null, since: (r.since as string) ?? null, enabled: r.enabled !== false,
  folderOk: (r.folder_ok as boolean) ?? null, lastSeen: (r.last_seen as string) ?? null, lastError: (r.last_error as string) ?? null,
  browse: r.browse_result ? (() => { const b = r.browse_result as Row; return { ...(b as object), reqAt: b.req_at as string } as SyncAgent["browse"]; })() : null,
});
const runFromRow = (r: Row): SyncRun => ({
  startedAt: r.started_at as string, finishedAt: (r.finished_at as string) ?? null, error: (r.error as string) ?? null,
  stats: (r.stats as SyncRun["stats"]) ?? null,
});
