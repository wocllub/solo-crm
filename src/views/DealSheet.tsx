// 견적 추가·수정 시트 — 원본 openDeal
import { useState, type FormEvent } from "react";
import { useCrm, useName } from "../lib/crm";
import { stamp, todayStr, won } from "../lib/format";
import { PROB, STAGES, type DealInput, type Stage } from "../lib/types";
import { AmountInput, DeleteButton, Sheet } from "../components/ui";
import { SourceInfo } from "./SyncView";

export function DealSheet({ id, onClose, onToLedger }: { id: string | null; onClose: () => void; onToLedger: (dealId: string) => void }) {
  const { rawDeals, rawLedger, canWrite, me, backend, toast, writeFail } = useCrm();
  const name = useName();
  const d = id ? rawDeals.find((x) => x.id === id) : null;
  const isNewDeal = !d;
  const linked = d ? rawLedger.find((l) => l.dealId === d.id) : null;

  const [f, setF] = useState({
    stage: (d?.stage || "quote") as Stage, date: d?.date || todayStr(), client: d?.client || "", end: d?.end || "", name: d?.name || "",
    no: d?.no || "", ver: d?.ver || "", amt: d?.amt || 0, memo: d?.memo || "",
  });
  const [owner, setOwner] = useState<string | null>(d ? d.owner : me.id);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const clients = [...new Set(rawDeals.map((x) => x.client).filter(Boolean))];
  const dis = !canWrite;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const data: DealInput = {
      stage: f.stage, date: f.date || null, client: f.client.trim(), end: f.end.trim() || null, name: f.name.trim(), no: f.no.trim() || null,
      ver: f.ver.trim() || null, amt: f.amt, memo: f.memo.trim() || null, owner: owner || null, updatedBy: me.id,
    };
    if (!data.client || !data.name || !data.amt) { setErr("거래처, 사업명, 견적금액을 입력하세요."); return; }
    setBusy(true);
    try {
      if (isNewDeal) await backend.addDeal({ ...data, createdBy: me.id });
      else await backend.putDeal(d.id, data);
      onClose(); toast(isNewDeal ? "견적을 추가했습니다" : "저장했습니다");
    } catch (e) { setErr(writeFail(e)); setBusy(false); }
  };
  const del = async () => {
    if (!d) return;
    setBusy(true);
    try { await backend.delDeal(d.id); onClose(); toast("견적을 삭제했습니다"); }
    catch (e) { setErr(writeFail(e)); setBusy(false); }
  };

  const foot = canWrite ? (
    <>
      <div className="grp">
        {!isNewDeal && <DeleteButton onConfirm={del} disabled={busy} />}
        {!isNewDeal && !linked && <button type="button" className="btn" onClick={() => { onClose(); onToLedger(d.id); }}>판매원장 작성</button>}
      </div>
      <div className="grp">
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" form="deal-form" className="btn primary" disabled={busy}>{isNewDeal ? "추가" : "저장"}</button>
      </div>
    </>
  ) : (
    <><span className="note">보기 전용입니다. 수정하려면 편집 권한이 필요합니다.</span><button type="button" className="btn" onClick={onClose}>닫기</button></>
  );

  return (
    <Sheet title={isNewDeal ? "새 견적" : "견적 수정"} onClose={onClose} foot={foot}>
      <form className="form" id="deal-form" noValidate onSubmit={submit}>
        <div className="field"><label htmlFor="f-stage">단계</label>
          <select id="f-stage" disabled={dis} value={f.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
            {STAGES.map((s) => <option key={s[0]} value={s[0]}>{Math.round(s[2] * 100)}% {s[1]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="f-date">견적일</label><input id="f-date" type="date" disabled={dis} value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div className="field"><label htmlFor="f-client">거래처 (매출처) *</label><input id="f-client" list="dl-client" autoComplete="off" disabled={dis} value={f.client} onChange={(e) => set("client", e.target.value)} /></div>
        <div className="field"><label htmlFor="f-end">최종 고객</label><input id="f-end" autoComplete="off" disabled={dis} value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
        <div className="field full"><label htmlFor="f-name">사업명 *</label><input id="f-name" autoComplete="off" disabled={dis} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field"><label htmlFor="f-no">견적번호</label><input id="f-no" placeholder="W-261018-01" autoComplete="off" disabled={dis} value={f.no} onChange={(e) => set("no", e.target.value)} /></div>
        <div className="field"><label htmlFor="f-ver">버전</label><input id="f-ver" placeholder="ver2" autoComplete="off" disabled={dis} value={f.ver} onChange={(e) => set("ver", e.target.value)} /></div>
        <div className="field"><label htmlFor="f-amt">견적금액 (원) *</label><AmountInput id="f-amt" disabled={dis} value={f.amt} onChange={(n) => set("amt", n)} /></div>
        <div className="field"><label htmlFor="f-w">확도 반영 금액</label><input id="f-w" className="amt" disabled value={won(f.amt * PROB[f.stage])} /></div>
        <div className="field full"><label htmlFor="f-memo">비고</label><textarea id="f-memo" disabled={dis} value={f.memo} onChange={(e) => set("memo", e.target.value)} /></div>
        <div className="field full"><label>담당</label>
          <div className="owner-row"><span>{owner ? name(owner) : "지정 안 됨"}</span>
            {canWrite && owner !== me.id && <button type="button" className="linkbtn" onClick={() => setOwner(me.id)}>내가 담당하기</button>}</div></div>
        {linked && <div className="audit">판매원장 연결됨: {linked.name} (마진 {won((linked.sale || 0) - (linked.cost || 0))}원)</div>}
        {d && <SourceInfo r={d} />}
        {d?.updatedAt && <div className="audit">마지막 수정 {stamp(d.updatedAt)}{d.updatedBy ? ` · ${name(d.updatedBy)}` : ""}</div>}
        <div className="form-err">{err}</div>
        <datalist id="dl-client">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      </form>
    </Sheet>
  );
}
