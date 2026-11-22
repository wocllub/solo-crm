// 앱 전역 상태: 저장소, 로그인 사용자, 실시간 데이터, 권한, 토스트
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WriteError, type Backend, type Role, type Session } from "./backend";
import { deriveDeals, deriveLedger, type DealView, type LedgerView } from "./calc";
import { cleanLay } from "./layout";
import type { Deal, Layout, LedgerRow, MainSettings, Me, SyncAgent, SyncIssue, SyncRun } from "./types";

interface Crm {
  backend: Backend;
  me: Me;
  role: Role;
  canWrite: boolean;
  canAdmin: boolean;
  rawDeals: Deal[];
  rawLedger: LedgerRow[];
  deals: DealView[];
  ledger: LedgerView[];
  loaded: { deals: boolean; ledger: boolean };
  settings: MainSettings;
  company: string[]; // 우리 회사 이름 (자동 동기화가 당사 견적서를 구분하는 데 씀)
  teamLayout: Layout | null;
  names: Record<string, string>;
  issues: SyncIssue[]; // 자동 동기화 확인 필요 (열린 것)
  lastRun: SyncRun | null;
  agents: SyncAgent[]; // 동기화 PC·폴더 설정
  status: string;
  toast: (msg: string) => void;
  writeFail: (e: unknown) => string;
}

const Ctx = createContext<Crm | null>(null);

export function useCrm() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CrmProvider 밖에서 useCrm 을 썼습니다");
  return v;
}

export function CrmProvider({ backend, session, children }: { backend: Backend; session: Session; children: ReactNode }) {
  const [rawDeals, setDeals] = useState<Deal[]>([]);
  const [rawLedger, setLedger] = useState<LedgerRow[]>([]);
  const [loaded, setLoaded] = useState({ deals: false, ledger: false });
  const [settings, setSettings] = useState<MainSettings>({ target: 100000000, year: 2026 });
  const [teamLayout, setTeamLayout] = useState<Layout | null>(null);
  const [company, setCompany] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [lastRun, setLastRun] = useState<SyncRun | null>(null);
  const [agents, setAgents] = useState<SyncAgent[]>([]);
  const [status, setStatus] = useState("공유 데이터를 불러오는 중입니다…");
  const [forbidden, setForbidden] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastT = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToastMsg(""), 2600);
  }, []);

  useEffect(() => {
    let errShown = false;
    const off = backend.listen({
      deals: (rows) => { setDeals(rows); setLoaded((l) => ({ ...l, deals: true })); },
      ledger: (rows) => { setLedger(rows); setLoaded((l) => ({ ...l, ledger: true })); },
      setting: (key, value) => {
        if (key === "main" && value) setSettings((s) => ({ ...s, ...(value as Partial<MainSettings>) }));
        if (key === "layout") setTeamLayout(cleanLay(value));
        if (key === "company") setCompany(Array.isArray((value as { names?: unknown })?.names) ? ((value as { names: unknown[] }).names.filter((n) => typeof n === "string") as string[]) : []);
      },
      issues: setIssues,
      lastRun: setLastRun,
      agents: setAgents,
      error: () => {
        if (!errShown) { errShown = true; setStatus("공유 데이터 연결이 끊겼습니다. 페이지를 새로 고쳐 주세요."); }
      },
    });
    backend.names().then(setNames).catch(() => {});
    return off;
  }, [backend]);

  useEffect(() => {
    if (loaded.deals && loaded.ledger) setStatus((s) => (s.startsWith("공유 데이터를 불러오는") ? "" : s));
  }, [loaded]);

  // 새 담당자가 보이면 이름 다시 불러오기
  useEffect(() => {
    const ids = new Set<string>();
    [...rawDeals, ...rawLedger].forEach((r) => { if (r.owner) ids.add(r.owner); if (r.updatedBy) ids.add(r.updatedBy); });
    if ([...ids].some((id) => !(id in names))) backend.names().then(setNames).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDeals, rawLedger]);

  const role = session.role;
  const canWrite = (role === "member" || role === "admin") && !forbidden;
  const canAdmin = role === "admin";

  const writeFail = useCallback((e: unknown) => {
    if (e instanceof WriteError && e.code === "forbidden") {
      setForbidden(true);
      setStatus("보기 전용 계정입니다. 편집하려면 관리자에게 권한(member)을 요청하세요.");
      return "저장 권한이 없습니다. 관리자에게 편집 권한을 요청하세요.";
    }
    return "저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.";
  }, []);

  const deals = useMemo(() => deriveDeals(rawDeals), [rawDeals]);
  const ledger = useMemo(() => deriveLedger(rawLedger), [rawLedger]);

  const value: Crm = {
    backend, me: session.me, role, canWrite, canAdmin, rawDeals, rawLedger, deals, ledger, loaded,
    settings, company, teamLayout, names, issues, lastRun, agents, status, toast, writeFail,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>
    </Ctx.Provider>
  );
}

// 담당자/수정자 이름 표시
export function useName() {
  const { names, me } = useCrm();
  return (id: string | null | undefined) => {
    if (!id) return "—";
    if (id === me.id) return `${me.name || "나"} (나)`;
    return names[id] || "직원";
  };
}
