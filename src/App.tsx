import { useEffect, useMemo, useState } from "react";
import { loadSession, supabaseBackend, type Backend, type Session } from "./lib/backend";
import { CrmProvider, useCrm } from "./lib/crm";
import { demoBackend, demoSession } from "./lib/demo";
import { todayStr } from "./lib/format";
import { isDesktop, isSupabaseConfigured, supabase } from "./lib/supabase";
import { DesktopSetup } from "./components/DesktopSetup";
import { Login } from "./components/Login";
import { SetPassword } from "./components/SetPassword";
import { Dashboard } from "./views/Dashboard";
import { Pipeline } from "./views/Pipeline";
import { DealSheet } from "./views/DealSheet";
import { Ledger } from "./views/Ledger";
import { LedgerSheet } from "./views/LedgerSheet";
import { SyncView } from "./views/SyncView";

export default function App() {
  // .env.local 이 없으면 데모 모드 (이 브라우저에만 저장)
  const [session, setSession] = useState<Session | null | undefined>(isSupabaseConfigured ? undefined : demoSession);
  // 데스크톱 앱에서 Supabase 설정이 없으면 처음 설정 화면 (데모로 둘러보기를 고르면 데모)
  const [setup, setSetup] = useState(isDesktop && !isSupabaseConfigured);
  // 비밀번호 재설정 메일의 링크로 들어왔거나(recovery), 헤더에서 「비밀번호 변경」을 눌렀을 때(change)
  const [pwMode, setPwMode] = useState<"recovery" | "change" | null>(null);
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    loadSession().then(setSession);
    const { data } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "PASSWORD_RECOVERY") setPwMode("recovery");
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") loadSession().then(setSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const backend = useMemo<Backend | null>(() => {
    if (!session) return null;
    return isSupabaseConfigured ? supabaseBackend(session.me.id) : demoBackend();
  }, [session]);

  if (setup) return <DesktopSetup onDemo={() => setSetup(false)} />;
  if (session === undefined) return <div className="wrap"><p className="status">불러오는 중…</p></div>;
  if (!session || !backend) return <Login />;
  if (pwMode && !backend.demo) {
    return <SetPassword onDone={() => { setPwMode(null); setPwDone(true); }} onCancel={pwMode === "change" ? () => setPwMode(null) : undefined} />;
  }
  if (session.role === "pending") return <Pending session={session} onRecheck={() => loadSession().then(setSession)} />;
  return (
    <CrmProvider key={session.me.id} backend={backend} session={session}>
      <Shell onChangePassword={() => setPwMode("change")} pwDone={pwDone} />
    </CrmProvider>
  );
}

// 가입 직후: 관리자가 profiles.role 을 viewer/member/admin 으로 바꿔야 데이터가 보인다
function Pending({ session, onRecheck }: { session: Session; onRecheck: () => void }) {
  return (
    <div className="login">
      <div className="login-card">
        <div className="sub">Solo-CRM · HANUL AI Inc.</div>
        <h1>승인 대기 중</h1>
        <p className="hint" style={{ margin: 0 }}>
          {session.me.name}님({session.me.email}) 가입이 완료되었습니다. 관리자가 승인하면 CRM을 쓸 수 있습니다.
        </p>
        <button type="button" className="btn primary" onClick={onRecheck}>승인 여부 다시 확인</button>
        <button type="button" className="linkbtn" onClick={() => supabase?.auth.signOut()}>로그아웃</button>
      </div>
    </div>
  );
}

type Tab = "dash" | "pipe" | "ledger" | "sync";
type SheetState = { kind: "deal"; id: string | null } | { kind: "ledger"; id: string | null; presetDealId: string | null } | null;

function Shell({ onChangePassword, pwDone }: { onChangePassword: () => void; pwDone: boolean }) {
  const { me, role, canWrite, status, deals, ledger, backend, issues, toast, settings, names } = useCrm();
  // 전체 데이터를 엑셀로
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const { exportXlsx } = await import("./lib/exportXlsx");
      const n = await exportXlsx({ deals, ledger, settings, names });
      toast(`엑셀 파일을 만들었습니다 — 견적 ${n.deals}건 · 판매원장 ${n.ledger}건 · 분할 청구 ${n.parts}회차`);
    } catch (e) { toast("엑셀 파일을 만들지 못했습니다: " + (e as Error).message); }
    setExporting(false);
  };
  const goalTitle = settings.show === "sales" ? "매출 목표 현황" : settings.show === "both" ? "마진·매출 목표 현황" : "마진 목표 현황";
  useEffect(() => { if (pwDone) toast("비밀번호를 바꿨습니다"); }, [pwDone, toast]);
  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return h === "pipe" || h === "ledger" || h === "sync" ? h : "dash";
  });
  const [sheet, setSheet] = useState<SheetState>(null);
  const setTab = (t: Tab) => {
    setTabState(t);
    try { history.replaceState(null, "", "#" + t); } catch { /* */ }
    window.scrollTo(0, 0);
  };
  const openDeal = (id: string | null) => setSheet({ kind: "deal", id });
  const openLedger = (id: string | null, presetDealId: string | null = null) => setSheet({ kind: "ledger", id, presetDealId });
  const close = () => setSheet(null);

  return (
    <>
      <div className="wrap">
        {backend.demo && (
          <div className="demo-bar">
            데모 모드 — Supabase가 연결되지 않아 이 브라우저에만 저장됩니다. 팀과 공유하려면 <code>.env.local</code>을 설정하세요.
          </div>
        )}
        <header>
          <div>
            <div className="sub">Solo-CRM · HANUL AI Inc.</div>
            <h1>{Number(settings.year) || 2026} 영업 펀넬 · {goalTitle}</h1>
          </div>
          <div className="meta">
            <span>기준일 <span className="num">{todayStr()}</span> · 금액 단위: 원 (VAT 별도)</span>
            <span className="me">
              {me.avatarUrl && <img alt="" src={me.avatarUrl} />}
              <span>{me.name}{canWrite ? "" : " · 보기 전용"}{role === "admin" ? " · 관리자" : ""}</span>
              <button type="button" className="linkbtn out" onClick={doExport} disabled={exporting} title="요약·견적 파이프라인·판매원장·분할 청구를 엑셀 파일 하나로 받습니다">{exporting ? "만드는 중…" : "엑셀로 내보내기"}</button>
              {!backend.demo && <button type="button" className="linkbtn out" onClick={onChangePassword}>비밀번호 변경</button>}
              <button type="button" className="linkbtn out" onClick={() => backend.signOut()}>{backend.demo ? "데모 초기화" : "로그아웃"}</button>
            </span>
          </div>
        </header>

        <nav className="tabs" role="tablist" aria-label="화면">
          <button type="button" role="tab" aria-selected={tab === "dash"} onClick={() => setTab("dash")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>대시보드</button>
          <button type="button" role="tab" aria-selected={tab === "pipe"} onClick={() => setTab("pipe")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>견적 파이프라인 <span className="cnt">{deals.length || ""}</span></button>
          <button type="button" role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></svg>판매원장 <span className="cnt">{ledger.length || ""}</span></button>
          <button type="button" role="tab" aria-selected={tab === "sync"} onClick={() => setTab("sync")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" /><path d="M21 4v5h-5M3 20v-5h5" /></svg>자동 동기화 {issues.length > 0 && <span className="cnt" style={{ color: "var(--po)" }}>확인 {issues.length}</span>}</button>
        </nav>

        <div className="status">{status}</div>

        {tab === "dash" && <Dashboard />}
        {tab === "pipe" && <Pipeline onOpen={openDeal} onAdd={() => openDeal(null)} />}
        {tab === "ledger" && <Ledger onOpen={openLedger} onAdd={() => openLedger(null)} />}
        {tab === "sync" && <SyncView />}
      </div>

      {canWrite && tab !== "sync" && (
        <button type="button" className="fab" onClick={() => (tab === "ledger" ? openLedger(null) : openDeal(null))}>
          + <span>{tab === "ledger" ? "판매원장" : "새 견적"}</span>
        </button>
      )}

      {sheet?.kind === "deal" && <DealSheet key={sheet.id || "new"} id={sheet.id} onClose={close} onToLedger={(dealId) => openLedger(null, dealId)} />}
      {sheet?.kind === "ledger" && <LedgerSheet key={(sheet.id || "new") + (sheet.presetDealId || "")} id={sheet.id} presetDealId={sheet.presetDealId} onClose={close} />}
    </>
  );
}
