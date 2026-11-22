// 앱 내부 데이터 타입 — 원본(legacy/index.html)의 필드 이름을 그대로 쓴다.
// DB(snake_case)와의 변환은 lib/backend.ts 에서만 한다.

export type Stage = "quote" | "nego" | "po" | "won" | "lost";

// [코드, 이름, 확도]
export const STAGES: [Stage, string, number][] = [
  ["quote", "견적제출", 0.1],
  ["nego", "수정견적", 0.3],
  ["po", "발주서 접수", 0.9],
  ["won", "판매원장 작성", 1],
  ["lost", "실주", 0],
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s[0], s[1]])) as Record<Stage, string>;
export const PROB = Object.fromEntries(STAGES.map((s) => [s[0], s[2]])) as Record<Stage, number>;
export const ORDER: Record<Stage, number> = { won: 0, po: 1, nego: 2, quote: 3, lost: 4 };

interface Audit {
  createdAt?: string | null;
  createdBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  // 영업 폴더 자동 동기화 (읽기 전용 — 저장할 때 보내지 않음)
  source?: "manual" | "sync";
  sourceFiles?: SourceFile[] | null;
  locked?: string[]; // 손으로 고쳐서 동기화가 덮어쓰지 않는 칸 (DB 컬럼 이름)
}

export interface SourceFile {
  kind: "quote" | "po" | "ledger";
  file: string; // 영업 폴더 기준 상대 경로
  date?: string | null;
  amt?: number | null;
}

export interface SyncIssue {
  id: string;
  title: string;
  detail: string | null;
  file: string | null;
  status: "open" | "resolved" | "ignored";
  createdAt: string;
}

// 동기화 PC — 각 PC의 동기화 프로그램이 스스로 등록하고, 폴더·기준일·켜기/끄기는 CRM에서 정한다
export interface SyncAgent {
  id: string;
  userId: string;
  machine: string;
  platform: string | null;
  salesDir: string | null;
  since: string | null;
  enabled: boolean;
  folderOk: boolean | null;
  lastSeen: string | null;
  lastError: string | null;
  browse: BrowseResult | null; // 폴더 찾아보기 — 그 PC의 동기화 프로그램이 보낸 마지막 폴더 목록
}

export interface BrowseResult {
  reqAt: string;
  path: string; // "" = 처음 화면 (드라이브·내 폴더)
  parent: string | null;
  sep: string;
  dirs: string[];
  roots: { label: string; path: string }[];
  error?: string;
  picking?: boolean;   // 그 PC 화면에 탐색기 「폴더 선택」 창을 띄워 둔 상태
  picked?: boolean;    // 탐색기 창에서 고름 (path 가 고른 폴더)
  cancelled?: boolean; // 탐색기 창을 닫음
}

export interface SyncRun {
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: Record<string, number> | null;
}

export interface Deal extends Audit {
  id: string;
  stage: Stage;
  date: string | null; // 견적일
  client: string; // 거래처 (매출처)
  end: string | null; // 최종 고객
  name: string; // 사업명
  no: string | null; // 견적번호
  ver: string | null;
  amt: number; // 견적금액
  memo: string | null;
  owner: string | null;
}

export interface LedgerPart {
  label: string;
  amt: number;
  invoiced: boolean;
  date: string | null; // 발행일
  paid?: boolean;
  paidDate?: string | null;
}

export type TaxType = "taxable" | "zero";

export interface LedgerRow extends Audit {
  id: string;
  dealId: string | null;
  client: string;
  end: string | null;
  name: string; // 건명
  date: string; // 계약일
  file: string | null;
  sale: number;
  cost: number;
  taxType: TaxType;
  invoiced: boolean;
  invoicedAt: string | null;
  paid: boolean;
  paidAt: string | null;
  parts: LedgerPart[] | null;
  owner: string | null;
}

export interface MainSettings {
  target: number;
  year: number;
}

export type WidgetId = "rate" | "margin" | "left" | "pipe" | "target" | "contrib" | "funnel" | "notes";
// 대시보드 자유 배치 — 12칸 격자 위의 위치·크기 (x·w 는 칸, y·h 는 행)
export interface GridItem {
  i: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Layout {
  v: 2;
  items: GridItem[];
  hidden: WidgetId[];
}

export interface Me {
  id: string;
  name: string;
  avatarUrl: string | null;
  email: string | null;
}

export type DealInput = Omit<Deal, "id">;
export type LedgerInput = Omit<LedgerRow, "id">;
