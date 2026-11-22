// 지금 CRM(아티팩트)에 손으로 넣은 데이터와 자동 인식 결과 비교
// sync/out/artifact/{deals,ledger}/*.json 이 있을 때만 (ArtifactData 로 내려받은 사본)
import fs from "node:fs";
import path from "node:path";
import type { PlannedDeal, PlannedLedger } from "./group.ts";
import { normCompany } from "./parse.ts";

interface ManualDeal { id: string; stage?: string; client?: string; name?: string; no?: string; amt?: number; date?: string }
interface ManualLedger { id: string; client?: string; name?: string; sale?: number; cost?: number; date?: string }

export interface Comparison {
  deals: { both: { manual: ManualDeal; auto: PlannedDeal; diffs: string[] }[]; manualOnly: ManualDeal[]; autoOnly: PlannedDeal[] };
  ledger: { both: { manual: ManualLedger; auto: PlannedLedger; diffs: string[] }[]; manualOnly: ManualLedger[]; autoOnly: PlannedLedger[] };
}

function load<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const data = j.data ?? j; // 저장 형식: {id, version, data} 또는 문서 자체
    return { id: j.id ?? f.replace(/\.json$/, ""), ...data } as T;
  });
}

const STAGE_KO: Record<string, string> = { quote: "견적제출", nego: "수정견적", po: "발주", won: "100%", lost: "실주" };
const won = (n: unknown) => (typeof n === "number" ? n.toLocaleString("ko-KR") : "?");

export function compare(base: string, deals: PlannedDeal[], ledger: PlannedLedger[]): Comparison | null {
  const md = load<ManualDeal>(path.join(base, "deals"));
  const ml = load<ManualLedger>(path.join(base, "ledger"));
  if (!md.length && !ml.length) return null;

  /* 견적: 견적번호(묶음 안 어느 버전이든) → 같은 거래처 + 금액 */
  const usedA = new Set<string>();
  const dBoth: Comparison["deals"]["both"] = [], dManual: ManualDeal[] = [];
  for (const m of md) {
    const nos: string[] = String(m.no || "").match(/W-\d{6}-\d{2}/g) ?? [];
    const sameClient = (d: PlannedDeal) => normCompany(d.client) === normCompany(m.client || "");
    const byNo = deals.filter((d) => !usedA.has(d.key) && d.quotes.some((q) => q.no && nos.includes(q.no)));
    // 거래처 표기가 달라도(영문 약칭 / 한글 상호) 그 번호를 가진 건이 하나뿐이면 같은 건
    let a = byNo.find(sameClient) ?? (byNo.length === 1 ? byNo[0] : undefined);
    if (!a) a = deals.find((d) => !usedA.has(d.key) && normCompany(d.client) === normCompany(m.client || "") && d.quotes.some((q) => q.amt === m.amt));
    if (!a) { dManual.push(m); continue; }
    usedA.add(a.key);
    const diffs: string[] = [];
    if (m.amt !== a.amt) diffs.push(`금액 ${won(m.amt)} → ${won(a.amt)}`);
    if (m.stage && m.stage !== a.stage && m.stage !== "lost") diffs.push(`단계 ${STAGE_KO[m.stage] ?? m.stage} → ${STAGE_KO[a.stage]}`);
    if (m.stage === "lost") diffs.push("손으로 「실주」 표시 — 자동 동기화가 바꾸지 않음");
    dBoth.push({ manual: m, auto: a, diffs });
  }

  /* 판매원장: 같은 거래처 + 같은 계약금액 */
  const usedL = new Set<PlannedLedger>();
  const lBoth: Comparison["ledger"]["both"] = [], lManual: ManualLedger[] = [];
  for (const m of ml) {
    const a = ledger.find((l) => !usedL.has(l) && l.doc.sale === m.sale && normCompany(l.doc.client) === normCompany(m.client || ""))
      ?? ledger.find((l) => !usedL.has(l) && l.doc.sale === m.sale);
    if (!a) { lManual.push(m); continue; }
    usedL.add(a);
    const diffs: string[] = [];
    if (m.cost !== a.doc.cost) diffs.push(`원가 ${won(m.cost)} → ${won(a.doc.cost)}`);
    if (m.date && a.doc.date && m.date !== a.doc.date) diffs.push(`계약일 ${m.date} → ${a.doc.date}`);
    lBoth.push({ manual: m, auto: a, diffs });
  }

  return {
    deals: { both: dBoth, manualOnly: dManual, autoOnly: deals.filter((d) => !usedA.has(d.key)) },
    ledger: { both: lBoth, manualOnly: lManual, autoOnly: ledger.filter((l) => !usedL.has(l)) },
  };
}
