// 판매원장 작성·수정 시트 — 원본 openLedger (과세 구분, 일시/분할 청구, 견적 연결 시 100% 단계로)
import { useState, type FormEvent } from "react";
import { useCrm, useName } from "../lib/crm";
import { hasParts, presetParts, sumParts } from "../lib/calc";
import { calRange, pct, stamp, todayStr, won } from "../lib/format";
import type { LedgerInput, LedgerPart, TaxType } from "../lib/types";
import { AmountInput, DeleteButton, Sheet } from "../components/ui";
import { SourceInfo } from "./SyncView";

export function LedgerSheet({ id, presetDealId, onClose }: { id: string | null; presetDealId: string | null; onClose: () => void }) {
  const { rawDeals, rawLedger, canWrite, me, backend, toast, writeFail } = useCrm();
  const name = useName();
  const l = id ? rawLedger.find((x) => x.id === id) : null;
  const pd = presetDealId ? rawDeals.find((x) => x.id === presetDealId) : null;
  const isNewL = !l;
  const dis = !canWrite;
  const rg = calRange();

  const [f, setF] = useState(() => ({
    dealId: l?.dealId || pd?.id || "",
    client: l?.client || pd?.client || "",
    end: l?.end || (pd ? pd.end || pd.client : "") || "",
    name: l?.name || pd?.name || "",
    date: l?.date || todayStr(),
    file: l?.file || "",
    sale: l?.sale || pd?.amt || 0,
    cost: l?.cost || 0,
    taxType: (l?.taxType || "taxable") as TaxType,
    mode: (l && hasParts(l) ? "split" : "once") as "once" | "split",
    invoiced: !!l?.invoiced, invoicedAt: l?.invoicedAt || "",
    paid: !!l?.paid, paidAt: l?.paidAt || "",
  }));
  const [parts, setParts] = useState<LedgerPart[]>(() => (l && hasParts(l) ? l.parts.map((p) => ({ ...p })) : []));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const owner = l?.owner || pd?.owner || me.id;

  const margin = f.sale - f.cost;
  const zero = f.taxType === "zero";
  const vat = zero ? 0 : Math.floor(f.sale * 0.1);
  const opts = [...rawDeals].filter((x) => x.stage !== "lost" && (!rawLedger.some((y) => y.dealId === x.id) || x.id === f.dealId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const ptot = parts.reduce((a, p) => a + (Number(p.amt) || 0), 0), diff = f.sale - ptot;
  const setPart = (i: number, patch: Partial<LedgerPart>) => setParts((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const pickDeal = (dealId: string) => {
    const x = rawDeals.find((y) => y.id === dealId);
    setF((s) => ({ ...s, dealId, ...(x ? {
      client: s.client || x.client || "", end: s.end || x.end || x.client || "", name: s.name || x.name || "", sale: s.sale || x.amt,
    } : {}) }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const data: LedgerInput = {
      dealId: f.dealId || null, client: f.client.trim(), end: f.end.trim() || null, name: f.name.trim(), date: f.date, file: f.file.trim() || null,
      invoiced: f.invoiced, invoicedAt: f.invoiced ? f.invoicedAt || todayStr() : null,
      paid: f.paid, paidAt: f.paid ? f.paidAt || todayStr() : null,
      parts: null, taxType: f.taxType, sale: f.sale, cost: f.cost, owner, updatedBy: me.id,
    };
    if (!data.client || !data.name || !data.sale) { setErr("거래처, 건명, 판매가를 입력하세요."); return; }
    if (!data.date) { setErr("계약일을 입력하세요. 월별 달성률에 쓰입니다."); return; }
    if (f.mode === "split") {
      const ps: LedgerPart[] = parts.map((p) => ({
        label: String(p.label || "").trim() || "회차", amt: Number(p.amt) || 0, invoiced: !!p.invoiced, date: p.invoiced ? p.date || todayStr() : null,
        paid: !!p.paid, paidDate: p.paid ? p.paidDate || todayStr() : null,
      }));
      if (!ps.length) { setErr("분할 청구 회차를 1개 이상 넣으세요."); return; }
      const tot = ps.reduce((a, p) => a + p.amt, 0);
      if (tot !== data.sale) { setErr(`회차 금액 합계(${won(tot)}원)가 판매가(${won(data.sale)}원)와 다릅니다. 금액을 맞춰 주세요.`); return; }
      Object.assign(data, { parts: ps }, sumParts(ps, "inv"), sumParts(ps, "pay"));
    }
    setBusy(true);
    try {
      if (isNewL) await backend.addLedger({ ...data, createdBy: me.id });
      else await backend.putLedger(l.id, data);
      const deal = data.dealId ? rawDeals.find((x) => x.id === data.dealId) : null;
      if (deal && deal.stage !== "won") { const { id: dealId, ...prev } = deal; await backend.putDeal(dealId, { ...prev, stage: "won", updatedBy: me.id }); }
      onClose();
      toast(deal && deal.stage !== "won" ? "판매원장을 저장하고 견적을 100% 단계로 바꿨습니다" : "판매원장을 저장했습니다");
    } catch (e) { setErr(writeFail(e)); setBusy(false); }
  };
  const del = async () => {
    if (!l) return;
    setBusy(true);
    try { await backend.delLedger(l.id); onClose(); toast("판매원장을 삭제했습니다. 연결된 견적 단계는 직접 바꿔 주세요."); }
    catch (e) { setErr(writeFail(e)); setBusy(false); }
  };

  const foot = canWrite ? (
    <>
      <div className="grp">{!isNewL && <DeleteButton onConfirm={del} disabled={busy} />}</div>
      <div className="grp">
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" form="led-form" className="btn primary" disabled={busy}>{isNewL ? "추가" : "저장"}</button>
      </div>
    </>
  ) : (
    <><span className="note">보기 전용입니다. 수정하려면 편집 권한이 필요합니다.</span><button type="button" className="btn" onClick={onClose}>닫기</button></>
  );

  return (
    <Sheet title={isNewL ? "판매원장 작성" : "판매원장 수정"} onClose={onClose} foot={foot}>
      <form className="form" id="led-form" noValidate onSubmit={submit}>
        <div className="field full"><label htmlFor="g-deal">연결할 견적 (선택하면 그 견적이 100% 단계로 바뀝니다)</label>
          <select id="g-deal" disabled={dis} value={f.dealId} onChange={(e) => pickDeal(e.target.value)}>
            <option value="">연결 안 함</option>
            {opts.map((x) => <option key={x.id} value={x.id}>{x.client} · {x.name} ({won(x.amt)})</option>)}
          </select></div>
        <div className="field"><label htmlFor="g-client">거래처 (매출처) *</label><input id="g-client" autoComplete="off" disabled={dis} value={f.client} onChange={(e) => set("client", e.target.value)} /></div>
        <div className="field"><label htmlFor="g-end">최종 고객</label><input id="g-end" autoComplete="off" disabled={dis} value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
        <div className="field full"><label htmlFor="g-name">건명 *</label><input id="g-name" autoComplete="off" disabled={dis} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="g-date">계약일</label><input id="g-date" type="date" disabled={dis} value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div className="field"><label htmlFor="g-file">판매원장 파일명</label><input id="g-file" placeholder="01.판매원장" autoComplete="off" disabled={dis} value={f.file} onChange={(e) => set("file", e.target.value)} /></div>
        <div className="field"><label htmlFor="g-sale">판매가 (원) *</label><AmountInput id="g-sale" disabled={dis} value={f.sale} onChange={(n) => set("sale", n)} /></div>
        <div className="field"><label htmlFor="g-cost">원가 (원) *</label><AmountInput id="g-cost" disabled={dis} value={f.cost} onChange={(n) => set("cost", n)} /></div>
        <div className="calc">마진 <b>{won(margin)}</b>원 · 마진율 <b>{pct(margin, f.sale)}</b></div>
        <div className="field"><label htmlFor="g-tax">과세 구분</label>
          <select id="g-tax" disabled={dis} value={f.taxType} onChange={(e) => set("taxType", e.target.value as TaxType)}>
            <option value="taxable">과세 (부가세 10%)</option><option value="zero">영세율 (부가세 0%)</option>
          </select></div>
        <div className="field"><label>계산서 발행액 (공급가액 + 부가세)</label>
          <div className="calc" style={{ margin: 0, padding: "8px 10px" }}><b>{won(f.sale + vat)}</b>원 <span className="note">= 공급가액 {won(f.sale)} + 부가세 {won(vat)}{zero ? " (영세율 0%)" : ""}</span></div></div>
        <div className="field full"><label htmlFor="g-mode">대금 청구 방식</label>
          <select id="g-mode" disabled={dis} value={f.mode} onChange={(e) => {
            const m = e.target.value as "once" | "split"; set("mode", m);
            if (m === "split" && !parts.length) setParts(presetParts(f.sale));
          }}>
            <option value="once">일시 청구 (계산서 1회)</option><option value="split">분할 청구 (선금·중도금·잔금 등)</option>
          </select></div>
        {f.mode === "once" ? (
          <>
            <div className="field"><label htmlFor="g-inv">세금계산서</label>
              <select id="g-inv" disabled={dis} value={f.invoiced ? "1" : "0"} onChange={(e) => set("invoiced", e.target.value === "1")}>
                <option value="0">미발행</option><option value="1">발행 완료</option></select></div>
            <div className="field"><label htmlFor="g-invd">발행일 (오늘 기준 전후 6개월)</label>
              <input id="g-invd" type="date" min={rg.min} max={rg.max} disabled={dis} value={f.invoicedAt} onChange={(e) => set("invoicedAt", e.target.value)} /></div>
            <div className="field"><label htmlFor="g-pay">수금</label>
              <select id="g-pay" disabled={dis} value={f.paid ? "1" : "0"} onChange={(e) => set("paid", e.target.value === "1")}>
                <option value="0">미수금</option><option value="1">수금 완료</option></select></div>
            <div className="field"><label htmlFor="g-payd">수금일 (오늘 기준 전후 6개월)</label>
              <input id="g-payd" type="date" min={rg.min} max={rg.max} disabled={dis} value={f.paidAt} onChange={(e) => set("paidAt", e.target.value)} /></div>
          </>
        ) : (
          <div className="pedit">
            <div className="ptools"><b style={{ fontSize: 13 }}>분할 청구 내역</b>
              {canWrite && <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={() => setParts(presetParts(f.sale))}>선금 30 · 중도금 40 · 잔금 30</button>
                <button type="button" className="btn" onClick={() => setParts((ps) => [...ps, { label: `${ps.length + 1}차`, amt: 0, invoiced: false, date: null }])}>+ 회차 추가</button>
              </span>}
            </div>
            {parts.length > 0 && <div className="phead"><span>구분</span><span>금액(공급가액)</span><span>발행일</span><span></span><span>수금일</span><span></span><span></span></div>}
            {parts.length ? parts.map((p, i) => (
              <div className="prow" key={i}>
                <input aria-label="구분" disabled={dis} value={p.label} onChange={(e) => setPart(i, { label: e.target.value })} />
                <AmountInput aria-label="금액" disabled={dis} value={Number(p.amt) || 0} onChange={(n) => setPart(i, { amt: n })} />
                <input aria-label="발행일" type="date" min={rg.min} max={rg.max} disabled={dis} value={p.date || ""}
                  onChange={(e) => setPart(i, { date: e.target.value || null, ...(e.target.value ? { invoiced: true } : {}) })} />
                <label className="ck"><input type="checkbox" disabled={dis} checked={!!p.invoiced}
                  onChange={(e) => setPart(i, { invoiced: e.target.checked, ...(e.target.checked && !p.date ? { date: todayStr() } : {}) })} />발행</label>
                <input aria-label="수금일" type="date" min={rg.min} max={rg.max} disabled={dis} value={p.paidDate || ""}
                  onChange={(e) => setPart(i, { paidDate: e.target.value || null, ...(e.target.value ? { paid: true } : {}) })} />
                <label className="ck"><input type="checkbox" disabled={dis} checked={!!p.paid}
                  onChange={(e) => setPart(i, { paid: e.target.checked, ...(e.target.checked && !p.paidDate ? { paidDate: todayStr() } : {}) })} />수금</label>
                {canWrite ? <button type="button" className="x2" aria-label="회차 삭제" onClick={() => setParts((ps) => ps.filter((_, k) => k !== i))}>×</button> : <span></span>}
              </div>
            )) : <div className="note">회차가 없습니다. 「선금 30 · 중도금 40 · 잔금 30」을 누르거나 회차를 추가하세요.</div>}
            <div className={"psum " + (parts.length && diff !== 0 ? "bad" : "")}>
              합계 {won(ptot)}원 / 판매가 {won(f.sale)}원{parts.length && diff !== 0 ? ` · 차이 ${won(diff)}원` : " · 일치"}
            </div>
          </div>
        )}
        {l && <SourceInfo r={l} />}
        {l?.updatedAt && <div className="audit">마지막 수정 {stamp(l.updatedAt)}{l.updatedBy ? ` · ${name(l.updatedBy)}` : ""}</div>}
        <div className="form-err">{err}</div>
      </form>
    </Sheet>
  );
}
