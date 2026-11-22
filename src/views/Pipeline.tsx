// 견적 파이프라인 — 원본 renderPipe
import { useState } from "react";
import { useCrm, useName } from "../lib/crm";
import type { DealView } from "../lib/calc";
import { eok, isNew, mOf, mStyle, won } from "../lib/format";
import { ORDER, STAGE, STAGES, type Stage } from "../lib/types";
import { MonthChips, MonthLegend, MonthTag, NewBadge } from "../components/ui";

const cols: [keyof DealView, string][] = [["stage", "단계"], ["p", "확도"], ["client", "거래처"], ["end", "최종 고객"], ["name", "사업명"], ["no", "견적번호"],
  ["date", "견적일"], ["amt", "견적금액"], ["w", "확도 반영"], ["owner", "담당"], ["memo", "비고"]];

export function Pipeline({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const { deals: all, me, loaded, canWrite } = useCrm();
  const name = useName();
  const [filter, setFilter] = useState<"all" | Stage>("all");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [pMonth, setPMonth] = useState(0);
  const [sortKey, setSortKey] = useState<keyof DealView>("amt");
  const [sortDir, setSortDir] = useState(-1);

  const qq = q.trim().toLowerCase();
  const base = all.filter((d) => (filter === "all" || d.stage === filter) && (!mine || d.owner === me.id) &&
    (!qq || [d.client, d.end, d.name, d.memo, d.no].join(" ").toLowerCase().includes(qq)));
  const rows = base.filter((d) => !pMonth || mOf(d.date) === pMonth).sort((a, b) => {
    let va: unknown = a[sortKey] ?? "", vb: unknown = b[sortKey] ?? "";
    if (sortKey === "stage") { va = ORDER[a.stage]; vb = ORDER[b.stage]; }
    return ((va as number) > (vb as number) ? 1 : (va as number) < (vb as number) ? -1 : 0) * sortDir;
  });
  const sum = rows.reduce((a, d) => a + d.amt, 0), sumW = rows.reduce((a, d) => a + d.w, 0);
  const empty = !loaded.deals ? "불러오는 중…" : all.length ? "조건에 맞는 견적이 없습니다." : "아직 견적이 없습니다. 「+ 새 견적」으로 첫 건을 넣으세요.";
  const sortBy = (k: keyof DealView) => {
    if (sortKey === k) setSortDir(-sortDir);
    else { setSortKey(k); setSortDir(["amt", "w", "p", "date"].includes(k) ? -1 : 1); }
  };

  return (
    <section>
      <div className="sec-head">
        <div><h2>견적 파이프라인</h2><span className="hint">{rows.length}건 · 견적 합계 {won(sum)}원 · 확도 반영 {won(sumW)}원</span></div>
        {canWrite && <button type="button" className="btn primary add-top" onClick={onAdd}>+ 새 견적</button>}
      </div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <div className="chips" role="group" aria-label="단계 필터">
          {[["all", "전체"] as [string, string], ...STAGES.map((s) => [s[0], `${Math.round(s[2] * 100)}% ${s[1]}`] as [string, string])].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k as typeof filter); }}>{l}</button>
          ))}
        </div>
        <button type="button" className="toggle" aria-pressed={mine} onClick={() => setMine(!mine)}>내 담당만</button>
        <input type="search" placeholder="거래처·사업명·비고 검색" aria-label="거래처·사업명·비고 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="filters" style={{ marginBottom: 10 }}>
        <div className="mchips" role="group" aria-label="견적일 월 필터"><MonthChips list={base} cur={pMonth} onPick={setPMonth} /></div>
      </div>
      <MonthLegend list={rows} />
      <div className="tbl-wrap list">
        <table className="wide">
          <thead><tr>{cols.map(([k, l]) => (
            <th key={k} className={"sort " + (["amt", "w", "p"].includes(k) ? "r" : "")} tabIndex={0} onClick={() => sortBy(k)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortBy(k); } }}>
              {l}{sortKey === k ? (sortDir > 0 ? " ▲" : " ▼") : ""}</th>))}</tr></thead>
          <tbody>
            {rows.length ? rows.map((d) => (
              <tr key={d.id} className={"row " + (d.stage === "lost" ? "is-lost" : "")} style={mStyle(d.date)} tabIndex={0} onClick={() => onOpen(d.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(d.id); } }}>
                <td><span className={`pill ${d.stage}`}>{STAGE[d.stage]}</span></td>
                <td className="r">{Math.round(d.p * 100)}%</td>
                <td>{d.client}</td>
                <td>{d.end || "—"}</td>
                <td className="nm">{d.name}<NewBadge show={isNew(d)} /></td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>{d.no}{d.ver ? <> <span className="note">({d.ver})</span></> : null}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}><MonthTag date={d.date} />{d.date}</td>
                <td className="r">{won(d.amt)}</td>
                <td className="r">{won(d.w)}</td>
                <td className="who">{name(d.owner)}</td>
                <td className="note">{d.memo}</td>
              </tr>
            )) : <tr><td colSpan={cols.length} className="note" style={{ padding: 18 }}>{empty}</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={7}>합계</td><td className="r">{won(sum)}</td><td className="r">{won(sumW)}</td><td colSpan={2}></td></tr></tfoot>
        </table>
      </div>
      <div className="cards">
        {rows.length ? (
          <>
            <div className="cards-sum">{rows.length}건 · 합계 {eok(sum)}원 · 확도 반영 {eok(sumW)}원</div>
            {rows.map((d) => (
              <button key={d.id} type="button" className={"card " + (d.stage === "lost" ? "is-lost" : "")} style={mStyle(d.date)} onClick={() => onOpen(d.id)}>
                <span className="top"><span className={`pill ${d.stage}`}>{Math.round(d.p * 100)}% {STAGE[d.stage]}</span><span className="note num"><MonthTag date={d.date} />{d.date}</span></span>
                <span className="t">{d.name}<NewBadge show={isNew(d)} /></span>
                <span className="s">{d.client}{d.end ? " → " + d.end : ""}</span>
                <span className="bot"><span className="amt">{won(d.amt)}원</span><span className="who">{d.owner ? name(d.owner) : ""}</span></span>
              </button>
            ))}
          </>
        ) : <p className="status">{empty}</p>}
      </div>
    </section>
  );
}
