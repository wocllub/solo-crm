// 데모 모드 — .env.local 이 없을 때 이 브라우저(localStorage)에만 저장한다. 팀과 공유되지 않음.
import type { Backend, Listeners, Session } from "./backend";
import { todayStr } from "./format";
import type { BrowseResult, Deal, DealInput, Layout, LedgerInput, LedgerRow, SyncAgent } from "./types";

const KEY = "solo-crm-demo";
const DEMO_ID = "demo-user";

// 데모 PC의 가상 폴더 (폴더 찾아보기 화면 확인용)
const DEMO_HOME = "C:\\Users\\demo";
const DEMO_SALES = "C:\\Users\\demo\\OneDrive - 샘플회사\\영업자료";
const DEMO_TREE: Record<string, string[]> = {
  "C:\\": ["Program Files", "Users", "Windows"],
  "C:\\Users": ["demo", "Public"],
  [DEMO_HOME]: ["Desktop", "Documents", "Downloads", "OneDrive - 샘플회사"],
  [`${DEMO_HOME}\\Documents`]: ["견적 양식", "회사 서류"],
  [`${DEMO_HOME}\\OneDrive - 샘플회사`]: ["경비", "기술자료", "영업자료"],
  [DEMO_SALES]: ["거래처", "고객사", "나라장터 입찰"],
  [`${DEMO_SALES}\\거래처`]: ["(주)샘플유통", "샘플정보(주)", "샘플테크"],
};
const demoFolder = (p: string) => DEMO_TREE[p.replace(/\\+$/, "") || p] ?? DEMO_TREE[p] ?? (p in DEMO_TREE ? [] : null);
function demoList(p: string): Omit<BrowseResult, "reqAt"> {
  const roots = [
    { label: "내 폴더", path: DEMO_HOME },
    { label: "OneDrive - 샘플회사", path: `${DEMO_HOME}\\OneDrive - 샘플회사` },
    { label: "C: 드라이브", path: "C:\\" },
  ];
  if (!p) return { path: "", parent: null, sep: "\\", dirs: [], roots };
  const dirs = demoFolder(p);
  const up = p.replace(/\\+$/, "");
  const cut = up.lastIndexOf("\\");
  const parent = /^C:\\?$/.test(p) ? "" : cut <= 2 ? "C:\\" : up.slice(0, cut);
  if (dirs === null) return { path: p, parent: "", sep: "\\", dirs: [], roots, error: "폴더를 열 수 없습니다 (데모)" };
  return { path: p, parent, sep: "\\", dirs, roots };
}

export const demoSession: Session = {
  me: { id: DEMO_ID, name: "데모 사용자", avatarUrl: null, email: null },
  role: "admin",
};

interface DemoData {
  deals: Deal[];
  ledger: LedgerRow[];
  settings: Record<string, unknown>;
  myLayout: Layout | null;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

function seed(): DemoData {
  const y = new Date().getFullYear();
  const now = new Date().toISOString();
  const a = { createdAt: now, createdBy: DEMO_ID, updatedAt: now, updatedBy: DEMO_ID, owner: DEMO_ID };
  const d1 = uid(), d2 = uid();
  return {
    deals: [
      { id: d1, stage: "won", date: `${y}-03-12`, client: "(주)샘플유통", end: "(주)샘플유통", name: "본사 네트워크 교체", no: "W-DEMO-01", ver: "ver2", amt: 48000000, memo: "데모 데이터", ...a },
      { id: d2, stage: "won", date: `${y}-06-03`, client: "샘플정보(주)", end: "샘플대학교", name: "연구실 GPU 서버 도입", no: "W-DEMO-02", ver: null, amt: 125000000, memo: "", ...a },
      { id: uid(), stage: "po", date: todayStr(), client: "샘플테크", end: null, name: "무선 AP 증설", no: "W-DEMO-03", ver: null, amt: 23500000, memo: "", ...a },
      { id: uid(), stage: "nego", date: todayStr(), client: "(주)샘플제조", end: null, name: "UPS 교체", no: "W-DEMO-04", ver: "ver3", amt: 61000000, memo: "대안: 40,000,000원", ...a },
      { id: uid(), stage: "quote", date: todayStr(), client: "샘플시스템", end: "샘플공사", name: "보안 게이트웨이 구축", no: "W-DEMO-05", ver: null, amt: 87000000, memo: "", ...a },
      { id: uid(), stage: "lost", date: `${y}-02-20`, client: "샘플물산", end: null, name: "백업 스토리지", no: "W-DEMO-06", ver: null, amt: 15000000, memo: "가격 경쟁 실패", ...a },
    ],
    ledger: [
      { id: uid(), dealId: d1, client: "(주)샘플유통", end: "(주)샘플유통", name: "본사 네트워크 교체", date: `${y}-03-25`, file: "01.판매원장", sale: 48000000, cost: 39500000, taxType: "taxable", invoiced: true, invoicedAt: `${y}-03-31`, paid: true, paidAt: `${y}-04-30`, parts: null, ...a },
      { id: uid(), dealId: d2, client: "샘플정보(주)", end: "샘플대학교", name: "연구실 GPU 서버 도입", date: `${y}-06-20`, file: "02.판매원장", sale: 125000000, cost: 108000000, taxType: "taxable", invoiced: false, invoicedAt: null, paid: false, paidAt: null,
        parts: [
          { label: "선금", amt: 37500000, invoiced: true, date: `${y}-06-25`, paid: true, paidDate: `${y}-07-10` },
          { label: "중도금", amt: 50000000, invoiced: false, date: null, paid: false, paidDate: null },
          { label: "잔금", amt: 37500000, invoiced: false, date: null, paid: false, paidDate: null },
        ], ...a },
    ],
    settings: { main: { target: 100000000, year: y } },
    myLayout: null,
  };
}

function read(): DemoData {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && Array.isArray(v.deals)) return v;
  } catch { /* 저장소를 못 쓰면 메모리로만 */ }
  return seed();
}

export function demoBackend(): Backend {
  let data = read();
  const subs = new Set<Listeners>();
  // 가상 동기화 PC (브라우저 메모리에만, 새로 고치면 처음 상태)
  let agents: SyncAgent[] = [{
    id: "demo-agent", userId: DEMO_ID, machine: "DEMO-PC", platform: "win32", salesDir: DEMO_SALES, since: "2026-01-01",
    enabled: true, folderOk: true, lastSeen: new Date().toISOString(), lastError: null, browse: null,
  }];
  const pushAgents = () => subs.forEach((l) => l.agents?.(agents.map((a) => ({ ...a, lastSeen: new Date().toISOString() }))));
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
    subs.forEach((l) => { l.deals(data.deals); l.ledger(data.ledger); });
  };
  const stampNew = <T extends object>(x: T) => ({ ...x, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const stampPut = <T extends object>(x: T) => ({ ...x, updatedAt: new Date().toISOString() });
  return {
    demo: true,
    listen(l) {
      subs.add(l);
      setTimeout(() => {
        l.deals(data.deals); l.ledger(data.ledger);
        Object.entries(data.settings).forEach(([k, v]) => l.setting(k, v));
        l.agents?.(agents);
        l.issues?.([]);
        l.lastRun?.(null);
      }, 0);
      return () => { subs.delete(l); };
    },
    async addDeal(d: DealInput) { data = { ...data, deals: [...data.deals, stampNew(d) as Deal] }; save(); },
    async putDeal(id, d) { data = { ...data, deals: data.deals.map((x) => (x.id === id ? ({ ...x, ...stampPut(d) } as Deal) : x)) }; save(); },
    async delDeal(id) { data = { ...data, deals: data.deals.filter((x) => x.id !== id) }; save(); },
    async addLedger(r: LedgerInput) { data = { ...data, ledger: [...data.ledger, stampNew(r) as LedgerRow] }; save(); },
    async putLedger(id, r) { data = { ...data, ledger: data.ledger.map((x) => (x.id === id ? ({ ...x, ...stampPut(r) } as LedgerRow) : x)) }; save(); },
    async delLedger(id) { data = { ...data, ledger: data.ledger.filter((x) => x.id !== id) }; save(); },
    async setSetting(key, value) {
      data = { ...data, settings: { ...data.settings, [key]: value } }; save();
      subs.forEach((l) => l.setting(key, value));
    },
    async getMyLayout() { return data.myLayout; },
    async setMyLayout(layout) { data = { ...data, myLayout: layout }; save(); },
    async names() { return { [DEMO_ID]: "데모 사용자" }; },
    async setIssue() { /* 데모 모드에는 확인 필요 목록이 없음 */ },
    // 데모용 가상 동기화 PC — 「동기화 PC·폴더 설정」·「폴더 찾아보기」 화면을 로그인 없이 확인하기 위한 흉내
    async setAgent(id, p) {
      agents = agents.map((a) => (a.id !== id ? a : {
        ...a,
        ...(p.salesDir !== undefined ? { salesDir: p.salesDir, folderOk: !!p.salesDir && demoFolder(p.salesDir) !== null } : {}),
        ...(p.since !== undefined ? { since: p.since } : {}),
        ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
      }));
      pushAgents();
    },
    async delAgent(id) { agents = agents.filter((a) => a.id !== id); pushAgents(); },
    async browseAgent(id, path) {
      const reqAt = new Date().toISOString();
      const answer = (b: Omit<BrowseResult, "reqAt">) => { agents = agents.map((a) => (a.id === id ? { ...a, browse: { ...b, reqAt } } : a)); pushAgents(); };
      if (path.startsWith("pick:")) {
        // 탐색기 창 흉내: 0.4초 뒤 「창을 띄움」, 2초 뒤 「영업자료」 선택
        const start = path.slice(5);
        setTimeout(() => answer({ ...demoList(start), picking: true }), 400);
        setTimeout(() => answer({ ...demoList(DEMO_SALES), picked: true }), 2000);
      } else {
        setTimeout(() => answer(demoList(path)), 300);
      }
      return reqAt;
    },
    async signOut() {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      location.reload();
    },
  };
}
