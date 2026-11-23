// 전체 데이터를 엑셀(.xlsx) 한 파일로 내보내기 — 요약 · 견적 파이프라인 · 판매원장 · 분할 청구
// exceljs 는 누를 때만 불러온다 (처음 화면을 가볍게)
import type { DealView, LedgerView } from "./calc";
import { hasParts } from "./calc";
import { todayStr } from "./format";
import { PROB, STAGE, type MainSettings } from "./types";

type Cell = string | number | boolean | Date | null;
interface Col { h: string; w: number; fmt?: "won" | "pct" | "date" }

const toDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  // 엑셀 날짜는 시간대 없이 저장되므로 UTC 자정으로 만든다 (한국 시간 자정으로 만들면 하루 앞당겨짐)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
const yn = (b: boolean | undefined | null) => (b ? "예" : "아니오");

export async function exportXlsx(opt: { deals: DealView[]; ledger: LedgerView[]; settings: MainSettings; names: Record<string, string> }) {
  const { deals, ledger, settings, names } = opt;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Solo-CRM";
  wb.created = new Date();

  const sheet = (name: string, cols: Col[], rows: Cell[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.h, width: c.w }));
    rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18392E" } };
    head.alignment = { vertical: "middle" };
    cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.fmt === "won") col.numFmt = "#,##0";
      if (c.fmt === "pct") col.numFmt = "0.0%";
      if (c.fmt === "date") col.numFmt = "yyyy-mm-dd";
    });
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };

  const dealNo = new Map(deals.map((d) => [d.id, d.no || ""]));
  const who = (id: string | null | undefined) => (id ? names[id] || "" : "");

  /* 요약 */
  const totSale = ledger.reduce((a, r) => a + r.sale, 0);
  const totMargin = ledger.reduce((a, r) => a + r.margin, 0);
  const pipe = deals.filter((d) => ["quote", "nego", "po"].includes(d.stage));
  const salesTarget = Number(settings.salesTarget) || 0;
  const summary = sheet("요약", [{ h: "항목", w: 28 }, { h: "값", w: 22 }], []);
  const add = (k: string, v: Cell, fmt?: string) => { const r = summary.addRow([k, v]); if (fmt) r.getCell(2).numFmt = fmt; };
  add("기준일", toDate(todayStr()), "yyyy-mm-dd");
  add("연도", Number(settings.year) || null);
  add("연간 마진 목표", Number(settings.target) || 0, "#,##0");
  add("확정 마진 (판매원장)", totMargin, "#,##0");
  add("마진 목표 달성률", settings.target ? totMargin / Number(settings.target) : null, "0.0%");
  add("연간 매출 목표", salesTarget || null, "#,##0");
  add("확정 매출 (판매원장 판매가)", totSale, "#,##0");
  add("매출 목표 달성률", salesTarget ? totSale / salesTarget : null, "0.0%");
  add("평균 마진율", totSale ? totMargin / totSale : null, "0.0%");
  add("진행 중 견적 (견적제출·수정견적·발주서 접수)", pipe.length);
  add("확도 반영 예상 매출", pipe.reduce((a, d) => a + d.w, 0), "#,##0");
  add("견적 전체 건수", deals.length);
  add("판매원장 건수", ledger.length);
  add("금액 기준", "원, VAT 별도");

  /* 견적 파이프라인 */
  sheet("견적 파이프라인", [
    { h: "단계", w: 13 }, { h: "확도", w: 7, fmt: "pct" }, { h: "견적일", w: 11, fmt: "date" }, { h: "거래처", w: 22 }, { h: "최종 고객", w: 22 },
    { h: "사업명", w: 40 }, { h: "견적번호", w: 16 }, { h: "버전", w: 8 }, { h: "견적금액", w: 15, fmt: "won" }, { h: "확도 반영 금액", w: 15, fmt: "won" },
    { h: "비고", w: 40 }, { h: "입력", w: 8 }, { h: "담당", w: 10 }, { h: "등록일", w: 11, fmt: "date" }, { h: "수정일", w: 11, fmt: "date" },
  ], [...deals].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((d) => [
    STAGE[d.stage], PROB[d.stage], toDate(d.date), d.client, d.end || "", d.name, d.no || "", d.ver || "", d.amt, d.w,
    d.memo || "", d.source === "sync" ? "자동" : "직접", who(d.owner || d.createdBy), toDate(d.createdAt), toDate(d.updatedAt),
  ]));

  /* 판매원장 */
  sheet("판매원장", [
    { h: "계약일", w: 11, fmt: "date" }, { h: "거래처", w: 22 }, { h: "최종 고객", w: 22 }, { h: "건명", w: 40 }, { h: "판매원장 파일", w: 16 },
    { h: "판매가 (매출)", w: 15, fmt: "won" }, { h: "원가", w: 15, fmt: "won" }, { h: "마진", w: 15, fmt: "won" }, { h: "마진율", w: 8, fmt: "pct" },
    { h: "과세 구분", w: 9 }, { h: "부가세", w: 13, fmt: "won" }, { h: "합계 (VAT 포함)", w: 15, fmt: "won" },
    { h: "계산서 발행", w: 10 }, { h: "발행일", w: 11, fmt: "date" }, { h: "수금", w: 8 }, { h: "수금일", w: 11, fmt: "date" },
    { h: "미수금 (VAT 포함)", w: 15, fmt: "won" }, { h: "분할 청구", w: 9 }, { h: "연결 견적번호", w: 16 }, { h: "입력", w: 8 },
  ], [...ledger].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((r) => [
    toDate(r.date), r.client, r.end || "", r.name, r.file || "", r.sale, r.cost, r.margin, r.sale ? r.margin / r.sale : null,
    r.taxType === "zero" ? "영세율" : "과세", r.tax.vat, r.tax.total,
    r.inv.split ? `${r.inv.n}/${r.inv.total}회` : yn(r.invoiced), toDate(r.invoicedAt),
    r.tax.payDone ? "예" : r.tax.payPartial ? `${r.tax.pn}/${r.tax.pt}회` : "아니오", toDate(r.paidAt),
    r.tax.unpaidT, hasParts(r) ? `${r.parts.length}회` : "", r.dealId ? dealNo.get(r.dealId) || "" : "", r.source === "sync" ? "자동" : "직접",
  ]));

  /* 분할 청구 (회차별) */
  const parts: Cell[][] = [];
  ledger.forEach((r) => {
    if (!hasParts(r)) return;
    r.parts.forEach((p, i) => parts.push([r.name, r.client, i + 1, p.label, Number(p.amt) || 0, yn(p.invoiced), toDate(p.date), yn(p.paid), toDate(p.paidDate)]));
  });
  sheet("분할 청구", [
    { h: "건명", w: 40 }, { h: "거래처", w: 22 }, { h: "회차", w: 6 }, { h: "구분", w: 10 }, { h: "금액", w: 15, fmt: "won" },
    { h: "계산서 발행", w: 10 }, { h: "발행일", w: 11, fmt: "date" }, { h: "수금", w: 8 }, { h: "수금일", w: 11, fmt: "date" },
  ], parts);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Solo-CRM_${todayStr()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { deals: deals.length, ledger: ledger.length, parts: parts.length };
}
