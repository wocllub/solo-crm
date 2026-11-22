// 파일 한 개를 읽어 무엇인지(당사 견적·매입 견적·판매원장·발주서) 판단하고 필요한 값을 꺼낸다
import fs from "node:fs";
import path from "node:path";
import { config, isOurs } from "./config.ts";
import { has, inline, readBook, right, squash, text, toDate, toNumber, type Grid } from "./xlsx.ts";

export interface QuoteDoc {
  kind: "quote";
  file: string;
  client: string; // 수신
  project: string;
  no: string | null; // 견적번호
  date: string | null; // 견적일자
  amt: number | null; // 견적금액 (VAT 별도)
  owner: string | null; // 담당
  alternatives: { sheet: string; amt: number | null }[]; // 같은 파일 안 다른 안(시트)
  version: string | null; // 파일 이름의 ver2 / final 등
  mtime: number; // 같은 날 대안 견적 중 처음 만든 파일(1안)을 고를 때 씀
  fromPdf?: boolean; // 엑셀 없이 PDF에서 읽음
}

export interface LedgerDoc {
  kind: "ledger";
  file: string;
  client: string; // 업체명
  project: string;
  date: string | null; // 계약일
  sale: number | null; // 계약금액
  cost: number | null; // 원가금액
  writer: string | null; // 작성자
  invoiceDue: string | null; // 매출계산서 발행 예정일 (메모)
  mtime: number; // 같은 판매원장의 수정본 중 최신을 고를 때 씀
}

export interface PoDoc {
  kind: "po";
  file: string;
  date: string | null;
  counterpart: string | null; // 파일 이름의 상대 업체
  direction: "sales" | "purchase" | "unknown"; // 고객이 보낸 발주(매출) / 당사가 보낸 발주(매입)
}

export interface Skipped {
  kind: "vendor-quote" | "unreadable" | "unknown";
  file: string;
  reason: string;
}

export type Doc = QuoteDoc | LedgerDoc | PoDoc | Skipped;

// 우리 회사 이름은 config.ts (CRM 설정 「우리 회사 이름」)
export const normCompany = (s: string) =>
  s.replace(/㈜|\(주\)|주식회사|\(유\)|\s+|귀중|귀하|님/g, "").replace(/^[:：]/, "").trim();

const versionOf = (name: string) => {
  const m = name.match(/ver\.?\s*(\d+)|(final|최종)/i);
  return m ? (m[1] ? `ver${m[1]}` : "최종") : null;
};

// 파일 이름의 (YYYY-MM-DD) 또는 _YYMMDD_
export function dateFromName(name: string): string | null {
  let m = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(?:^|[_\s(])(2\d)(\d{2})(\d{2})(?=[_\s)]|$)/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const vatExcluded = (n: number | null, cell: unknown) =>
  n && /VAT\s*포함|부가세\s*포함/i.test(String(cell ?? "")) ? Math.floor(n / 1.1) : n; // 원 단위 미만 절사 (손으로 입력한 값과 같은 방식)

function parseOurQuoteSheet(g: Grid) {
  const amtCell = right(g, /^견적금액$/);
  const dc = right(g, /^DC제안가$/);
  const total = right(g, /^합계$/);
  return {
    client: normCompanyKeep(text(right(g, /^수신$/))),
    project: text(right(g, /^프로젝트$/)).replace(/\s*件$/, " 件").trim(),
    no: text(right(g, /^견적번호:?$/)) || null,
    date: toDate(right(g, /^견적일자:?$/)),
    // 견적금액 칸이 비었거나 0 으로 저장된 파일이 있어 DC 제안가 → 합계 순으로 대신 쓴다
    // CRM 금액은 VAT 별도 — 공공기관 견적처럼 「VAT포함」으로 적힌 금액은 1.1 로 나눈다
    amt: vatExcluded(toNumber(amtCell), amtCell) || toNumber(dc) || toNumber(total) || null,
    vatIncluded: /VAT\s*포함|부가세\s*포함/i.test(String(amtCell ?? "")),
    owner: text(right(g, /^담당:?$/)).replace(/\s*\(.*$/, "").replace(/\s*(프로|부장|과장|대리|이사|님)$/, "").trim() || null,
  };
}

// 표시용: 「㈜가나다 귀중」 → 「(주)가나다」
function normCompanyKeep(s: string) {
  return s.replace(/귀중|귀하/g, "").replace(/㈜/g, "(주)").replace(/\s+/g, " ").trim();
}

// 엑셀 원본 없이 PDF만 있는 당사 견적 — 엑셀에서 만든 PDF라 글자를 그대로 읽을 수 있다
export async function parsePdfQuote(file: string): Promise<QuoteDoc | Skipped> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let t: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    t = (await extractText(pdf, { mergePages: true })).text;
  } catch (e) {
    return { kind: "unreadable", file, reason: "PDF를 열 수 없음: " + (e as Error).message.slice(0, 60) };
  }
  if (!/Q\s*u\s*o\s*t\s*a\s*t\s*i\s*o\s*n/.test(t)) return { kind: "unknown", file, reason: "당사 견적 양식 PDF가 아님" };
  const line = (re: RegExp) => t.match(re)?.[1]?.replace(/\s+/g, " ").trim() || null;
  const amtLine = line(/견적금액\s*([^\n]+)/);
  // 견적금액이 0 으로 저장된 파일은 「Remarks」 바로 앞의 합계 줄로 대신
  const totalBeforeRemarks = t.match(/\n\s*([\d,]{4,})\s*\n\s*Remarks/)?.[1] ?? null;
  const amtNum = toNumber(amtLine?.replace(/\(.*$/, "") ?? null) || toNumber(totalBeforeRemarks);
  const name = path.basename(file);
  return {
    kind: "quote", file,
    client: normCompanyKeep(line(/수\s*신\s*[:：]\s*([^\n]+)/) || ""),
    project: (line(/프로젝트\s*[:：]\s*([^\n]+)/) || "").replace(/\s*件$/, " 件"),
    no: line(/견적번호\s*[:：]\s*(\S+)/),
    date: toDate(line(/견적일자\s*[:：]\s*([^\n]+)/)) ?? dateFromName(name),
    amt: vatExcluded(amtNum, amtLine) || null,
    owner: (line(/담\s*당\s*[:：]\s*([^\n(]+)/) || "").replace(/\s*(프로|부장|과장|대리|이사|님)$/, "").trim() || null,
    alternatives: [],
    version: versionOf(name),
    mtime: fs.statSync(file).mtimeMs,
    fromPdf: true,
  };
}

export async function parseFile(file: string): Promise<Doc> {
  const name = path.basename(file);
  const ext = path.extname(name).toLowerCase();

  // 발주서: 대부분 PDF → 파일 이름으로 판단 (판매원장·당사 견적 엑셀은 이름에 「발주」가 있어도 내용으로 판단)
  const isOfficeDoc = ext === ".xlsx" || ext === ".xlsm";
  if (/발주/.test(name) && !(isOfficeDoc && /판매원장|판매관리|견적/.test(name))) {
    const m = name.match(/발주서_(?:\d{6})_([^_]+)/);
    const counterpart = m ? m[1].replace(/㈜/g, "(주)") : null;
    // 「발주서_YYMMDD_매입처_…」 = 당사가 매입처에 보낸 발주 / 이름에 당사 상호가 있으면 고객이 당사에 보낸 발주
    const direction: PoDoc["direction"] = /^발주서_\d{6}_/.test(name) ? "purchase" : isOurs(name) ? "sales" : "unknown";
    return { kind: "po", file, date: dateFromName(name), counterpart, direction };
  }

  if (ext !== ".xlsx" && ext !== ".xlsm") return { kind: "unknown", file, reason: "엑셀이 아님" };

  let sheets: Grid[];
  try { sheets = await readBook(file); }
  catch (e) { return { kind: "unreadable", file, reason: "엑셀을 열 수 없음: " + (e as Error).message.slice(0, 60) }; }

  // 판매원장
  const led = sheets.find((g) => has(g, /^판매관리원장$/));
  if (led) {
    return {
      kind: "ledger", file,
      client: normCompanyKeep(text(right(led, /^업체명$/))),
      project: (inline(led, /프로젝트명\s*[:：]\s*(.+)$/) || "").replace(/\s+/g, " ").trim(),
      date: toDate(right(led, /^계약일$/)),
      sale: toNumber(right(led, /^계약금액$/)),
      cost: toNumber(right(led, /^원가금액$/)),
      writer: (inline(led, /작성자\s*[:：]\s*(.+)$/) || "").replace(/\s+/g, "") || null,
      invoiceDue: inline(led, /매출계산서\s*발행\s*예정일\s*[:：]\s*(.+)$/),
      mtime: fs.statSync(file).mtimeMs,
    };
  }

  // 당사 견적서: 「Q u o t a t i o n」 양식 + 발신(수신 줄 오른쪽)이 당사
  const ours = sheets.filter((g) => has(g, /^Quotation$/i) && g.rows.some((row) => {
    const i = row.findIndex((v) => v != null && /^수신$/.test(squash(v)));
    return i >= 0 && row.slice(i + 2).some((v) => v != null && isOurs(String(v)));
  }));
  if (ours.length) {
    const [main, ...rest] = ours.map((g) => ({ g, ...parseOurQuoteSheet(g) }));
    // 프로젝트 칸이 비었으면 파일 이름(「견적서_To 거래처_사업명_From …」)에서
    const fromName = name.replace(/\.[^.]+$/, "").replace(/^.*?견적서_*\s*To\s*[^_]+_+/i, "").replace(/_*\s*From.*$/i, "").replace(/_/g, " ").trim();
    return {
      kind: "quote", file, client: main.client, project: main.project || fromName, no: main.no,
      date: main.date ?? dateFromName(name), amt: main.amt, owner: main.owner,
      alternatives: rest.map((r) => ({ sheet: r.g.sheet, amt: r.amt })),
      version: versionOf(name),
      mtime: fs.statSync(file).mtimeMs,
    };
  }

  if (/견적/.test(name)) {
    // 매입처가 당사에 보낸 견적 (수신이 당사) → 원본 집계 기준대로 제외
    return { kind: "vendor-quote", file, reason: "당사 발행 양식이 아님 (매입 견적 등)" };
  }
  return { kind: "unknown", file, reason: "견적서·판매원장 양식이 아님" };
}
