// 동기화 엔진 — 명령줄(sync/run.ts)과 데스크톱 앱(electron/main.ts)이 함께 쓴다
//  - 한 번 반영(once), 감시(영업 폴더가 바뀌면 30초 뒤 + 30분마다), CRM 설정 확인(1분마다 + 실시간)
//  - 로그인 방법과 로그 기록은 부르는 쪽(host)이 정한다
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scan, type ParseCache } from "./scan.ts";
import { push } from "./push.ts";
import { agentError, answerBrowse, loadCompany, syncAgent, type AgentState } from "./agent.ts";

export interface Conn { sb: SupabaseClient; uid: string }

export interface SyncHost {
  connect(): Promise<Conn>;        // 로그인된 Supabase 연결
  log(line: string): void;
  onStatus?(s: SyncStatus): void;  // 데스크톱 트레이 표시용
}

export interface SyncStatus {
  state: "idle" | "running" | "error" | "off" | "waiting";
  message: string;
  root?: string;
  at: string;
}

export interface SyncService {
  once(): Promise<void>;
  start(): Promise<void>;          // 감시 시작 (once 포함)
  stop(): void;
  reconnect(): void;               // 로그인이 바뀌었을 때
}

export function createSyncService(host: SyncHost, opts: { watch: boolean }): SyncService {
  const { log } = host;
  const status = (state: SyncStatus["state"], message: string) =>
    host.onStatus?.({ state, message, root: agent?.root, at: new Date().toISOString() });

  // 로그인은 한 번만 하고 계속 쓴다 (1분마다 로그인하면 Supabase 로그인 횟수 제한에 걸림)
  let conn: Conn | null = null;
  const getConn = async () => (conn ??= await host.connect());

  const cache: ParseCache = new Map();
  let running = false, again = false, stopped = false;
  let agent: AgentState | null = null;

  async function once() {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    let runId: string | null = null;
    try {
      const { sb, uid } = await getConn();
      const before = agent?.root;
      agent = await syncAgent(sb, uid);
      if (before !== agent.root) log(`영업 폴더: ${agent.root || "(정하지 않음)"} (기준일 ${agent.since})`);
      if (!agent.enabled) { log("CRM 설정에서 이 PC의 동기화가 꺼져 있어 건너뜁니다."); status("off", "이 PC의 동기화가 꺼져 있습니다"); return; }
      if (!(await loadCompany(sb)).length) {
        const msg = "우리 회사 이름이 설정되지 않아 당사 견적서를 구분할 수 없습니다. CRM 「자동 동기화 → 우리 회사 이름」에서 정하세요.";
        log("실패: " + msg); status("waiting", msg);
        await agentError(sb, agent.id, msg);
        return;
      }
      if (!agent.root) {
        const msg = "영업 폴더가 정해지지 않았습니다. CRM 「동기화 PC·폴더 설정」에서 이 PC의 폴더를 고르세요.";
        log("대기: " + msg); status("waiting", msg);
        await agentError(sb, agent.id, msg);
        return;
      }
      if (!agent.folderOk) {
        const msg = `영업 폴더를 찾을 수 없습니다: ${agent.root}`;
        log("실패: " + msg); status("error", msg);
        await agentError(sb, agent.id, msg);
        return;
      }
      status("running", "동기화 중…");
      const { data } = await sb.from("sync_runs").insert({}).select("id").single();
      runId = (data as { id: string } | null)?.id ?? null;
      const { summary, result } = await scan({ cache });
      const stats = await push(sb, uid, result);
      if (runId) await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), stats: { ...stats, files: summary.files, scanned: summary.scanned } }).eq("id", runId);
      await agentError(sb, agent.id, null);
      const line = `견적 새로 ${stats.dealsNew}·갱신 ${stats.dealsUpdated}, 판매원장 새로 ${stats.ledgerNew}·갱신 ${stats.ledgerUpdated}, ` +
        `확인 필요 새로 ${stats.issuesOpen}·해결 ${stats.issuesClosed}, 손으로 고친 칸 보존 ${stats.lockedSkipped}`;
      log(`반영 완료 — ${line} (${summary.seconds}초)`);
      status("idle", "반영 완료 — " + line);
    } catch (e) {
      const msg = (e as Error).message;
      log("실패: " + msg); status("error", msg);
      if (/JWT|token|로그인/i.test(msg)) conn = null; // 로그인이 풀렸으면 다음에 다시
      if (conn && runId) await conn.sb.from("sync_runs").update({ finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
      if (conn && agent) await agentError(conn.sb, agent.id, msg).catch(() => {});
      if (!opts.watch) process.exitCode = 1;
    } finally {
      running = false;
      if (opts.watch && !stopped) rewatch();
      if (again) { again = false; setTimeout(once, 1000); }
    }
  }

  /* ---- 감시: 영업 폴더가 바뀌면 그 폴더를 새로 지켜본다 ---- */
  let watcher: fs.FSWatcher | null = null;
  let watchedRoot = "";
  let kickT: NodeJS.Timeout | undefined;
  const kick = (why: string) => { clearTimeout(kickT); kickT = setTimeout(() => { log(`변경 감지 (${why}) → 다시 반영`); once(); }, 30_000); };
  function rewatch() {
    const root = agent?.enabled && agent.folderOk ? agent.root : "";
    if (root === watchedRoot) return;
    watcher?.close(); watcher = null; watchedRoot = "";
    if (!root) return;
    try {
      // Windows·리눅스(Node 20+) 모두 하위 폴더까지 감시. OneDrive 가 내려받는 중에도 이벤트가 오므로 30초 모아서 처리
      watcher = fs.watch(root, { recursive: true }, (_ev, name) => {
        if (!name || /(^|[\\/])~\$|\.tmp$/i.test(name)) return;
        if (!/\.(xlsx|xlsm|pdf|png)$/i.test(name)) return;
        kick(String(name).split(/[\\/]/).slice(-1)[0]);
      });
      watchedRoot = root;
      log(`감시 중 — ${root}`);
    } catch (e) { log("폴더 감시를 시작하지 못했습니다: " + (e as Error).message); }
  }

  // 폴더 찾아보기 요청 처리 (같은 요청은 한 번만)
  // 실시간 알림과 DB 조회의 시각 표기가 달라도 같은 요청으로 보도록 밀리초 숫자로 비교
  let lastBrowseReq = "";
  const reqKey = (s: string) => String(Date.parse(s));
  async function handleBrowse(reqAt: string | null, browsePath: string | null) {
    if (!reqAt || reqKey(reqAt) === lastBrowseReq || !conn || !agent) return;
    lastBrowseReq = reqKey(reqAt);
    // 프로그램을 다시 켰을 때 예전 요청(특히 「탐색기로 선택」)에 다시 답하지 않게: 2분 지난 요청은 무시
    if (Date.now() - Date.parse(reqAt) > 120_000) return;
    const pick = !!browsePath?.startsWith("pick:");
    if (pick) log("CRM에서 탐색기 「폴더 선택」 창을 요청했습니다");
    try {
      const r = await answerBrowse(conn.sb, agent.id, reqAt, browsePath);
      if (pick) log(`「폴더 선택」 창 결과: ${r}`);
    } catch (e) { log("폴더 목록을 보내지 못했습니다: " + (e as Error).message); }
  }

  // CRM에서 이 PC 설정이 바뀌면 바로 알 수 있게 실시간 구독 (폴더 찾아보기는 1~2초 안에 응답)
  let subscribed: { id: string; ch: ReturnType<SupabaseClient["channel"]>; sb: SupabaseClient } | null = null;
  function subscribeAgent() {
    if (!conn || !agent || (subscribed?.id === agent.id && subscribed.sb === conn.sb)) return;
    if (subscribed) subscribed.sb.removeChannel(subscribed.ch);
    const ch = conn.sb.channel("agent-" + agent.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sync_agents", filter: `id=eq.${agent.id}` }, (p) => {
        const n = p.new as { browse_req_at: string | null; browse_path: string | null; sales_dir: string | null; since: string | null; enabled: boolean };
        // 폴더 찾아보기 요청은 폴더 목록만 보낸다 — 동기화는 하지 않음
        // (2분 지난 예전 요청은 새 요청으로 보지 않는다 — 그러지 않으면 켜기·끄기 알림이 여기서 묻힘)
        const freshBrowse = n.browse_req_at && reqKey(n.browse_req_at) !== lastBrowseReq && Date.now() - Date.parse(n.browse_req_at) < 120_000;
        if (freshBrowse) { handleBrowse(n.browse_req_at, n.browse_path); return; }
        // 폴더·기준일·켜기/끄기가 실제로 바뀐 경우에만 다시 반영 (이 프로그램이 쓴 접속 시각·폴더 목록 알림은 무시 → 무한 반복 방지)
        if (agent && ((n.sales_dir && n.sales_dir !== agent.root) || (n.since && n.since !== agent.since) || n.enabled !== agent.enabled)) checkSettings();
      })
      .subscribe((st, err) => {
        // 실시간이 안 되면 1분 확인으로만 반영되므로 기록해 둔다
        if (st === "SUBSCRIBED") log("실시간 연결됨 — CRM 설정 변경을 바로 받습니다");
        else if (st !== "CLOSED") log(`실시간 연결 ${st}${err ? ": " + err.message : ""} — 1분마다 확인합니다`);
      });
    subscribed = { id: agent.id, ch, sb: conn.sb };
  }

  // 1분마다(그리고 실시간 알림 때) CRM 설정 확인: 폴더·기준일·켜기/끄기가 바뀌었으면 바로 다시 반영
  async function checkSettings() {
    if (running || !conn || !agent) return;
    try {
      const { data } = await conn.sb.from("sync_agents").select("sales_dir, since, enabled, browse_req_at, browse_path").eq("id", agent.id).maybeSingle();
      if (!data) return;
      const d = data as { sales_dir: string | null; since: string | null; enabled: boolean; browse_req_at: string | null; browse_path: string | null };
      handleBrowse(d.browse_req_at, d.browse_path); // 실시간을 놓쳤을 때 대비
      const changed = (d.sales_dir && d.sales_dir !== agent.root) || (d.since && d.since !== agent.since) || d.enabled !== agent.enabled;
      if (changed) { log("CRM에서 동기화 설정이 바뀌었습니다 → 다시 반영"); once(); }
      else await conn.sb.from("sync_agents").update({ last_seen: new Date().toISOString() }).eq("id", agent.id);
    } catch { /* 다음 확인 때 다시 */ }
  }

  const timers: NodeJS.Timeout[] = [];
  return {
    once,
    async start() {
      stopped = false;
      await once();
      subscribeAgent();
      timers.push(setInterval(() => { subscribeAgent(); checkSettings(); }, 60_000));
      timers.push(setInterval(() => once(), 30 * 60_000)); // 놓친 변경 대비
    },
    stop() {
      stopped = true;
      timers.splice(0).forEach(clearInterval);
      clearTimeout(kickT);
      watcher?.close(); watcher = null; watchedRoot = "";
      if (subscribed) { subscribed.sb.removeChannel(subscribed.ch); subscribed = null; }
    },
    reconnect() {
      if (subscribed) { subscribed.sb.removeChannel(subscribed.ch); subscribed = null; }
      conn = null; agent = null;
    },
  };
}
