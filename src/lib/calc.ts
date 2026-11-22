// 원본 계산식 — 확도, 계산서/수금 상태, 부가세(10% 절사·영세율 0%), 분할 청구 요약
import { PROB, STAGE, type Deal, type LedgerPart, type LedgerRow, type Stage } from "./types";

export interface DealView extends Deal {
  p: number; // 확도
  w: number; // 확도 반영 금액
}

export function deriveDeals(raw: Deal[]): DealView[] {
  return raw.map((d) => {
    const s: Stage = STAGE[d.stage] ? d.stage : "quote";
    const amt = Number(d.amt) || 0;
    return { ...d, stage: s, amt, p: PROB[s], w: Math.round(amt * PROB[s]) };
  });
}

export const hasParts = (r: Pick<LedgerRow, "parts">): r is LedgerRow & { parts: LedgerPart[] } =>
  Array.isArray(r.parts) && r.parts.length > 0;

export interface InvInfo {
  split: boolean;
  done: boolean;
  partial: boolean;
  n: number;
  total: number;
  amt: number;
  left: number;
}

export function invInfo(r: LedgerRow): InvInfo {
  const sale = Number(r.sale) || 0;
  if (hasParts(r)) {
    const ps = r.parts;
    const n = ps.filter((p) => p.invoiced).length;
    const amt = ps.filter((p) => p.invoiced).reduce((a, p) => a + (Number(p.amt) || 0), 0);
    return { split: true, done: n === ps.length, partial: n > 0 && n < ps.length, n, total: ps.length, amt, left: sale - amt };
  }
  return { split: false, done: !!r.invoiced, partial: false, n: r.invoiced ? 1 : 0, total: 1, amt: r.invoiced ? sale : 0, left: r.invoiced ? 0 : sale };
}

export const isZero = (r: Pick<LedgerRow, "taxType">) => r.taxType === "zero";
export const vatOf = (amt: number, r: Pick<LedgerRow, "taxType">) => (isZero(r) ? 0 : Math.floor((Number(amt) || 0) * 0.1));

export interface TaxInfo {
  supply: number; vat: number; total: number;
  issS: number; issV: number; issT: number;
  todoS: number; todoV: number; todoT: number;
  paidT: number; unpaidT: number;
  pn: number; pt: number; payDone: boolean; payPartial: boolean;
}

export function taxInfo(r: LedgerRow): TaxInfo {
  const units = hasParts(r)
    ? r.parts.map((p) => ({ amt: Number(p.amt) || 0, on: !!p.invoiced, pd: !!p.paid }))
    : [{ amt: Number(r.sale) || 0, on: !!r.invoiced, pd: !!r.paid }];
  const t = { supply: 0, vat: 0, issS: 0, issV: 0, todoS: 0, todoV: 0, paidT: 0, unpaidT: 0, pn: 0, pt: units.length };
  units.forEach((u) => {
    const v = vatOf(u.amt, r);
    t.supply += u.amt; t.vat += v;
    if (u.on) { t.issS += u.amt; t.issV += v; } else { t.todoS += u.amt; t.todoV += v; }
    if (u.pd) { t.paidT += u.amt + v; t.pn++; } else t.unpaidT += u.amt + v;
  });
  return {
    ...t,
    total: t.supply + t.vat,
    issT: t.issS + t.issV,
    todoT: t.todoS + t.todoV,
    payDone: t.pn === t.pt,
    payPartial: t.pn > 0 && t.pn < t.pt,
  };
}

export interface LedgerView extends LedgerRow {
  margin: number;
  inv: InvInfo;
  tax: TaxInfo;
}

export function deriveLedger(raw: LedgerRow[]): LedgerView[] {
  return raw.map((r) => {
    const sale = Number(r.sale) || 0, cost = Number(r.cost) || 0;
    const base = { ...r, sale, cost };
    return { ...base, margin: sale - cost, inv: invInfo(base), tax: taxInfo(base) };
  });
}

// kind: inv(세금계산서 발행) | pay(수금)
export type FlagKind = "inv" | "pay";
export const KF = {
  inv: { on: "invoiced", at: "invoicedAt", pon: "invoiced", pat: "date", nm: "세금계산서 발행일", off: "미발행" },
  pay: { on: "paid", at: "paidAt", pon: "paid", pat: "paidDate", nm: "수금일", off: "미수금" },
} as const;

// 회차가 모두 발행(수금)되면 전체를 발행(수금)으로, 날짜는 가장 늦은 회차 날짜
export function sumParts(parts: LedgerPart[], k: FlagKind): Partial<LedgerRow> {
  const f = KF[k];
  const all = parts.length > 0 && parts.every((p) => p[f.pon]);
  const ds = parts.filter((p) => p[f.pon] && p[f.pat]).map((p) => p[f.pat] as string).sort();
  return { [f.on]: !!all, [f.at]: all ? ds[ds.length - 1] || null : null } as Partial<LedgerRow>;
}

// 기본 분할: 선금 30 · 중도금 40 · 잔금 30
export function presetParts(sale: number): LedgerPart[] {
  const a = Math.round(sale * 0.3), b = Math.round(sale * 0.4);
  return [
    { label: "선금", amt: a, invoiced: false, date: null },
    { label: "중도금", amt: b, invoiced: false, date: null },
    { label: "잔금", amt: sale - a - b, invoiced: false, date: null },
  ];
}
