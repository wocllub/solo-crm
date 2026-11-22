// 판매원장 — 원본 renderLedger / invBox / payBox / setFlag / 발행일 달력
import { useEffect, useRef, useState } from "react";
import { useCrm, useName } from "../lib/crm";
import { hasParts, invInfo, isZero, KF, sumParts, taxInfo, vatOf, type FlagKind, type LedgerView } from "../lib/calc";
import { calRange, isNew, mOf, mStyle, norm, pad2, pct, todayStr, won } from "../lib/format";
import type { LedgerRow } from "../lib/types";
import { MonthChips, MonthLegend, MonthTag, NewBadge } from "../components/ui";

type InvF = "all" | "todo" | "done" | "zero" | "unpaid" | "paid";
const INV_CHIPS: [InvF, string][] = [["all", "계산서 전체"], ["todo", "미발행"], ["done", "발행 완료"], ["zero", "영세율만"], ["unpaid", "미수금"], ["paid", "수금 완료"]];

interface CalState { id: string; part: number | null; kind: FlagKind; y: number; m: number; anchor: HTMLElement }

export function Ledger({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const { ledger, rawLedger, loaded, canWrite, backend, me, toast, writeFail } = useCrm();
  const name = useName();
  const [lq, setLq] = useState("");
  const [lMonth, setLMonth] = useState(0);
  const [invF, setInvF] = useState<InvF>("all");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const allL = [...ledger].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const q = lq.trim().toLowerCase().replace(/\s+/g, " ");
  const baseL = allL.filter((r) =>
    (invF === "all" || (invF === "zero" ? isZero(r) : invF === "paid" ? r.tax.payDone : invF === "unpaid" ? !r.tax.payDone : invF === "done" ? r.inv.done : !r.inv.done)) &&
    (!q || q.split(" ").every((w) => norm([r.client, r.end, r.name, r.file].join(" ")).includes(norm(w)))));
  const rows = baseL.filter((r) => !lMonth || mOf(r.date) === lMonth);
  const invDone = rows.filter((r) => r.inv.done), invTodo = rows.filter((r) => !r.inv.done), invPart = rows.filter((r) => r.inv.partial);
  const T = (k: keyof LedgerView["tax"]) => rows.reduce((a, r) => a + (r.tax[k] as number), 0);
  const zeroN = rows.filter(isZero).length;
  const totSale = rows.reduce((a, r) => a + r.sale, 0), totCost = rows.reduce((a, r) => a + r.cost, 0), totM = totSale - totCost;
  const empty = !loaded.ledger ? "불러오는 중…" : allL.length ? (q ? `「${lq.trim()}」에 맞는 판매원장이 없습니다.` : "조건에 맞는 판매원장이 없습니다.") : "아직 판매원장이 없습니다. 「+ 판매원장 작성」으로 첫 건을 넣으세요.";

  /* ---- 발행·수금 표시 저장 ---- */
  const setFlag = async (kind: FlagKind, id: string, idx: number | null, on: boolean, date: string | null) => {
    const l = rawLedger.find((x) => x.id === id); if (!l) return;
    const f = KF[kind];
    let upd: Partial<LedgerRow>, msg: string;
    if (idx != null && hasParts(l)) {
      const parts = l.parts.map((p, i) => (i === idx ? { ...p, [f.pon]: on, [f.pat]: on ? date || (p[f.pat] as string | null) || todayStr() : null } : p));
      upd = { parts, ...sumParts(parts, kind) };
      const lb = l.parts[idx].label;
      msg = on ? `${lb} ${f.nm} ${parts[idx][f.pat]}로 저장했습니다` : `${lb}을(를) ${f.off}으로 되돌렸습니다`;
    } else {
      const d = on ? date || todayStr() : null;
      upd = { [f.on]: on, [f.at]: d } as Partial<LedgerRow>;
      msg = on ? `${f.nm} ${d}로 저장했습니다` : `${f.off}으로 되돌렸습니다`;
    }
    setBusyIds((s) => new Set(s).add(id));
    const { id: _id, ...prev } = l;
    try { await backend.putLedger(id, { ...prev, ...upd, updatedBy: me.id }); toast(msg); }
    catch (e) { toast(writeFail(e)); }
    setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  /* ---- 달력 팝업 (마우스 오버로 열림) ---- */
  const [cal, setCal] = useState<CalState | null>(null);
  const closeT = useRef<number | undefined>(undefined);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const openCal = (btn: HTMLElement, id: string, part: number | null, kind: FlagKind) => {
    window.clearTimeout(closeT.current);
    if (cal && cal.anchor === btn) return;
    const l = rawLedger.find((x) => x.id === id); if (!l) return;
    const F = KF[kind];
    const pp = part != null && hasParts(l) ? l.parts[part] : null;
    const base = pp ? (pp[F.pon] && pp[F.pat] ? (pp[F.pat] as string) : todayStr()) : l[F.on] && l[F.at] ? (l[F.at] as string) : todayStr();
    const rg = calRange();
    const k = Math.max(rg.minYM, Math.min(rg.maxYM, +base.slice(0, 4) * 12 + +base.slice(5, 7) - 1));
    setCal({ id, part, kind, y: Math.floor(k / 12), m: k % 12, anchor: btn });
  };
  const closeCal = () => { window.clearTimeout(closeT.current); setCal(null); };
  const closeLater = () => { window.clearTimeout(closeT.current); if (document.activeElement?.id === "cal-ym") return; closeT.current = window.setTimeout(closeCal, 280); };
  useEffect(() => {
    if (!cal || !popRef.current) return;
    const r = cal.anchor.getBoundingClientRect(), pw = popRef.current.offsetWidth, ph = popRef.current.offsetHeight;
    const left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left + r.width / 2 - pw / 2));
    let top = r.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    setPos({ left, top });
  }, [cal]);
  useEffect(() => {
    if (!cal) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest(".calpop") && !t.closest(".inv-date")) closeCal(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeCal(); };
    const onScroll = () => closeCal();
    document.addEventListener("click", onDoc); document.addEventListener("keydown", onKey); window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll, true); };
  }, [cal]);

  const dateBtn = (r: LedgerRow, part: number | null, kind: FlagKind, on: boolean, val: string | null | undefined, emptyLabel: string) => (
    <button type="button" className={`inv-date ${kind === "pay" ? "pay-date" : ""} ${on ? "" : "empty"}`} aria-haspopup="dialog" aria-expanded={cal?.anchor !== undefined && cal?.id === r.id && cal.part === part && cal.kind === kind}
      title="마우스를 올리면 달력이 열립니다"
      onMouseEnter={(e) => openCal(e.currentTarget, r.id, part, kind)} onMouseLeave={closeLater}
      onClick={(e) => { e.stopPropagation(); openCal(e.currentTarget, r.id, part, kind); }} onFocus={(e) => openCal(e.currentTarget, r.id, part, kind)}>
      {on ? val || "날짜 선택" : emptyLabel}
    </button>
  );

  const flagBox = (r: LedgerView, kind: FlagKind) => {
    const dis = !canWrite || busyIds.has(r.id);
    const F = KF[kind];
    const isPay = kind === "pay";
    if (hasParts(r)) {
      const inf = invInfo(r), tx = taxInfo(r);
      return (
        <div className="parts">
          {isPay ? <span className="parts-head" style={{ color: "var(--nego)" }}>수금 {tx.pn}/{tx.pt}회 · {won(tx.paidT)}원</span> : (
            <><span className="parts-head">분할 청구 {inf.n}/{inf.total} 발행</span>
              <span className="pbar" title={`${won(inf.amt)} / ${won(r.sale)}원`}><i style={{ width: `${(r.sale ? (inf.amt / r.sale) * 100 : 0).toFixed(1)}%` }}></i></span></>)}
          {r.parts.map((p, i) => {
            const on = !!p[F.pon], val = p[F.pat] as string | null | undefined;
            return (
              <span key={i} className={`part ${isPay ? (on ? "paid" : "unpaid") : on ? "done" : "todo"}`}>
                <input type="checkbox" className={isPay ? "pay-cb" : "inv-cb"} checked={on} disabled={dis} aria-label={`${p.label} ${isPay ? "수금" : "세금계산서 발행"}`}
                  onChange={(e) => setFlag(kind, r.id, i, e.target.checked, null)} />
                <span className="pl">{p.label}</span>
                {!isPay && <span className="pa" title={`공급가액 ${won(p.amt)} + 부가세 ${won(vatOf(p.amt, r))}`}>{won((Number(p.amt) || 0) + vatOf(p.amt, r))}</span>}
                {!canWrite ? <span className="d">{on ? val || "" : ""}</span> : dateBtn(r, i, kind, on, val, isPay ? "수금일 선택" : "날짜 선택")}
              </span>
            );
          })}
        </div>
      );
    }
    const on = !!r[F.on], val = r[F.at] as string | null;
    return (
      <span className={`inv ${isPay ? (on ? "paid" : "unpaid") : on ? "done" : "todo"}`}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" className={isPay ? "pay-cb" : "inv-cb"} checked={on} disabled={dis} aria-label={isPay ? "수금" : "세금계산서 발행"}
            onChange={(e) => setFlag(kind, r.id, null, e.target.checked, null)} />{" "}
          {isPay ? (on ? "수금" : "미수금") : on ? "발행" : "미발행"}
        </label>
        {!canWrite ? <span className="d">{on ? val || "" : ""}</span> : dateBtn(r, null, kind, on, val, isPay ? "수금일 선택" : "날짜 선택")}
      </span>
    );
  };

  return (
    <section>
      <div className="sec-head">
        <div><h2>판매원장 — 원가 / 판매가 / 마진율</h2>
          <span className="hint">계약 확정 건 · 세금계산서 발행일과 수금일은 날짜 칸에 마우스를 올려 달력에서 선택 · 판매가·원가는 부가세 별도 · 합계금액 = 공급가액 + 부가세(과세 10%, 영세율 0%) · 행을 누르면 수정 · 영세율과 선금·중도금·잔금은 수정 창에서 설정</span></div>
        {canWrite && <button type="button" className="btn primary add-top" onClick={onAdd}>+ 판매원장 작성</button>}
      </div>
      <div className="filters" style={{ marginBottom: 10 }}>
        <div className="mchips" role="group" aria-label="계약일 월 필터"><MonthChips list={baseL} cur={lMonth} onPick={setLMonth} /></div>
        <input type="search" placeholder="거래처·최종 고객·건명 검색" aria-label="판매원장 거래처·최종 고객·건명 검색" value={lq} onChange={(e) => { setLq(e.target.value); setLMonth(0); }} />
        <div className="chips" role="group" aria-label="세금계산서 발행 필터">
          {INV_CHIPS.map(([k, l]) => <button key={k} type="button" aria-pressed={invF === k} onClick={() => { setInvF(k); setLMonth(0); }}>{l}</button>)}
        </div>
      </div>
      <div className="inv-sum">
        <div className="grp"><span className="k">계산서 발행액 (부가세 포함 · 완료 {invDone.length}건)</span><b style={{ color: "var(--won)" }}>{won(T("issT"))}원</b><span className="k">공급가액 {won(T("issS"))} + 부가세 {won(T("issV"))}</span></div>
        <div className="grp"><span className="k">미발행액 (부가세 포함 · {invTodo.length}건)</span><b style={{ color: "var(--po)" }}>{won(T("todoT"))}원</b><span className="k">공급가액 {won(T("todoS"))} + 부가세 {won(T("todoV"))}</span></div>
        <div className="grp"><span className="k">전체 계산서 금액 (부가세 포함)</span><b>{won(T("total"))}원</b><span className="k">공급가액 {won(T("supply"))} + 부가세 {won(T("vat"))}{zeroN ? ` · 영세율 ${zeroN}건` : ""}</span></div>
        <div className="grp"><span className="k">수금액 (부가세 포함 · 완료 {rows.filter((r) => r.tax.payDone).length}건)</span><b style={{ color: "var(--nego)" }}>{won(T("paidT"))}원</b><span className="k">미수금 {won(T("unpaidT"))}원 · {rows.filter((r) => !r.tax.payDone).length}건</span></div>
        {invPart.length > 0 && <span style={{ color: "var(--nego)", alignSelf: "center" }}>분할 청구 진행 중 <b>{invPart.length}</b>건</span>}
      </div>
      <MonthLegend list={rows} />
      <div className="tbl-wrap list">
        <table className="wide">
          <thead><tr>
            <th>거래처 (매출처)</th><th>최종 고객</th><th>건명</th><th>계약일</th>
            <th className="r">판매가<br /><span style={{ fontWeight: 400 }}>(공급가액)</span></th><th className="r">원가</th><th className="r">마진</th><th className="r">마진율</th>
            <th className="r">부가세<br /><span style={{ fontWeight: 400 }}>(VAT 10%)</span></th><th className="r">합계금액<br /><span style={{ fontWeight: 400 }}>(공급가액+부가세)</span></th>
            <th>세금계산서 발행</th><th>수금</th><th>담당</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id} className="row" style={mStyle(r.date)} tabIndex={0} onClick={() => onOpen(r.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(r.id); } }}>
                <td>{r.client}</td><td>{r.end || "—"}</td>
                <td>{r.name}<NewBadge show={isNew(r)} />{r.file && <div className="note">{r.file}</div>}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}><MonthTag date={r.date} />{r.date}</td>
                <td className="r">{won(r.sale)}</td><td className="r">{won(r.cost)}</td><td className="r">{won(r.margin)}</td><td className="r">{pct(r.margin, r.sale)}</td>
                <td className="r">{won(r.tax.vat)}{isZero(r) && <div><span className="zero">영세율 0%</span></div>}</td>
                <td className="r" style={{ fontWeight: 700 }}>{won(r.tax.total)}</td>
                <td className="invc" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{flagBox(r, "inv")}</td>
                <td className="invc" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{flagBox(r, "pay")}</td>
                <td className="who">{name(r.owner)}</td>
              </tr>
            )) : <tr><td colSpan={13} className="note" style={{ padding: 18 }}>{empty}</td></tr>}
          </tbody>
          <tfoot><tr>
            <td colSpan={4}>합계 {rows.length}건</td><td className="r">{won(totSale)}</td><td className="r">{won(totCost)}</td><td className="r">{won(totM)}</td><td className="r">{pct(totM, totSale)}</td>
            <td className="r">{won(T("vat"))}</td><td className="r">{won(T("total"))}</td>
            <td className="note">발행 {invDone.length}/{rows.length} · 발행액 {won(T("issT"))}</td><td className="note">수금 {won(T("paidT"))} · 미수 {won(T("unpaidT"))}</td><td></td>
          </tr></tfoot>
        </table>
      </div>
      <div className="cards">
        {rows.length ? (
          <>
            <div className="cards-sum">{rows.length}건 · 마진 합계 {won(totM)}원 · 평균 {pct(totM, totSale)}</div>
            {rows.map((r) => (
              <button key={r.id} type="button" className="card" style={mStyle(r.date)} onClick={() => onOpen(r.id)}>
                <span className="top"><span className="note num"><MonthTag date={r.date} />{r.date}</span><span className="pill won">마진율 {pct(r.margin, r.sale)}</span></span>
                <span className="t">{r.name}<NewBadge show={isNew(r)} /></span>
                <span className="s">{r.client}{r.end && r.end !== r.client ? " → " + r.end : ""}</span>
                <span className="bot"><span className="s">판매 {won(r.sale)} · 원가 {won(r.cost)}</span><span className="amt">+{won(r.margin)}</span></span>
                <span className="s">계산서 합계 {won(r.tax.total)}원 (부가세 {won(r.tax.vat)}){isZero(r) && <span className="zero">영세율</span>}</span>
                <span className={`inv ${r.inv.done ? "done" : r.inv.partial ? "part-ing" : "todo"}`}>
                  세금계산서 {r.inv.split ? `분할 ${r.inv.n}/${r.inv.total} 발행 · ${won(r.inv.amt)}원${r.inv.done ? "" : " · 눌러서 수정"}` : r.invoiced ? `발행 ${r.invoicedAt || ""}` : "미발행 · 눌러서 수정"}
                </span>
                <span className={`inv ${r.tax.payDone ? "paid" : "unpaid"}`}>
                  수금 {r.tax.pt > 1 ? `${r.tax.pn}/${r.tax.pt}회 · ${won(r.tax.paidT)}원` : r.paid ? `완료 ${r.paidAt || ""}` : `미수금 ${won(r.tax.unpaidT)}원`}
                </span>
              </button>
            ))}
          </>
        ) : <p className="status">{empty}</p>}
      </div>
      {cal && (
        <CalendarPop ref={popRef} cal={cal} setCal={setCal} pos={pos} row={rawLedger.find((x) => x.id === cal.id)}
          onEnter={() => window.clearTimeout(closeT.current)} onLeave={closeLater}
          onApply={(on, d) => { const c = cal; closeCal(); setFlag(c.kind, c.id, c.part, on, d); }} />
      )}
    </section>
  );
}

function CalendarPop({ ref, cal, setCal, pos, row, onEnter, onLeave, onApply }: {
  ref: React.Ref<HTMLDivElement>; cal: CalState; setCal: (c: CalState) => void; pos: { left: number; top: number }; row: LedgerRow | undefined;
  onEnter: () => void; onLeave: () => void; onApply: (on: boolean, d: string | null) => void;
}) {
  const F = KF[cal.kind];
  const pp = row && cal.part != null && hasParts(row) ? row.parts[cal.part] : null;
  const sel = pp ? (pp[F.pon] ? (pp[F.pat] as string) || "" : "") : row && row[F.on] ? (row[F.at] as string) || "" : "";
  const first = new Date(cal.y, cal.m, 1).getDay(), days = new Date(cal.y, cal.m + 1, 0).getDate(), today = todayStr();
  const rg = calRange(), ym = cal.y * 12 + cal.m;
  const goYM = (k: number) => { k = Math.max(rg.minYM, Math.min(rg.maxYM, k)); setCal({ ...cal, y: Math.floor(k / 12), m: k % 12 }); };
  const opts: number[] = []; for (let k = rg.minYM; k <= rg.maxYM; k++) opts.push(k);
  return (
    <div className={"calpop" + (cal.kind === "pay" ? " pay" : "")} ref={ref} role="dialog" aria-label={(cal.part != null ? "분할 청구 " : "") + F.nm + " 선택"}
      style={{ left: pos.left, top: pos.top }} onMouseEnter={onEnter} onMouseDown={onEnter} onMouseLeave={onLeave} onClick={(e) => e.stopPropagation()}>
      <div className="ttl">{pp ? pp.label + " " : ""}{F.nm} 선택</div>
      <div className="ch">
        <button type="button" aria-label="이전 달" disabled={ym <= rg.minYM} onClick={() => goYM(ym - 1)}>‹</button>
        <select id="cal-ym" aria-label="년월 선택" value={ym} onChange={(e) => goYM(+e.target.value)}>
          {opts.map((k) => <option key={k} value={k}>{Math.floor(k / 12)}년 {(k % 12) + 1}월</option>)}
        </select>
        <button type="button" aria-label="다음 달" disabled={ym >= rg.maxYM} onClick={() => goYM(ym + 1)}>›</button>
      </div>
      <div className="cg">
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => <span key={w} className={`wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={"e" + i}></span>)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1, ds = `${cal.y}-${pad2(cal.m + 1)}-${pad2(d)}`, wd = (first + d - 1) % 7;
          return <button key={ds} type="button" className={`dy ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""} ${ds === today ? "today" : ""} ${ds === sel ? "sel" : ""}`}
            disabled={ds < rg.min || ds > rg.max} onClick={() => onApply(true, ds)}>{d}</button>;
        })}
      </div>
      <div className="cf">
        <button type="button" onClick={() => onApply(true, todayStr())}>오늘</button>
        {sel && <button type="button" className="clr" onClick={() => onApply(false, null)}>{cal.kind === "pay" ? "수금 취소" : "발행 취소"}</button>}
      </div>
      <div className="rng">선택 가능: {rg.min} ~ {rg.max}</div>
    </div>
  );
}
