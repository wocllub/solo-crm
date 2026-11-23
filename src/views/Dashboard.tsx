// 대시보드 — 원본 renderDash + 자유 배치
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCrm } from "../lib/crm";
import { eok, pct, won } from "../lib/format";
import { clone, GRID, LAY0, LS_KEY, MIN, WNAME, cleanLay } from "../lib/layout";
import { STAGE, type GoalShow, type Layout, type Stage, type WidgetId } from "../lib/types";
import { AmountInput } from "../components/ui";
import ReactGridLayout, { useContainerWidth, type Layout as GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export function Dashboard() {
  const { deals, ledger, settings, canAdmin, canWrite, backend, toast, teamLayout } = useCrm();
  const TARGET = Number(settings.target) || 100000000, Y = Number(settings.year) || 2026;
  const SALES_TARGET = Number(settings.salesTarget) || 0;
  const show: GoalShow = settings.show === "sales" || settings.show === "both" ? settings.show : "margin";
  const totSale = ledger.reduce((a, r) => a + r.sale, 0), totMargin = ledger.reduce((a, r) => a + r.margin, 0);
  // 보여 줄 목표 (마진·매출 중 고른 것)
  const metrics: Metric[] = [
    ...(show !== "sales" ? [{ key: "margin" as const, name: "마진", target: TARGET, total: totMargin }] : []),
    ...(show !== "margin" ? [{ key: "sales" as const, name: "매출", target: SALES_TARGET, total: totSale }] : []),
  ];
  const multi = metrics.length > 1;
  const now = new Date(), y0 = new Date(Y, 0, 1), y1 = new Date(Y + 1, 0, 1);
  const elapsed = Math.min(1, Math.max(0, (+now - +y0) / (+y1 - +y0)));
  const monthsLeft = Math.max(0.5, (+y1 - +now) / (30.44 * 864e5));
  const mm = now.getMonth() + 1, dd = now.getDate();
  const pipe = deals.filter((d) => ["quote", "nego", "po"].includes(d.stage));
  const pipeAmt = pipe.reduce((a, d) => a + d.amt, 0), pipeW = pipe.reduce((a, d) => a + d.w, 0);
  const lostN = deals.filter((d) => d.stage === "lost").length;

  /* ---- 목표 바꾸기 (관리자): 마진 목표 · 매출 목표 · 대시보드에 보일 목표 ---- */
  const [tgtEdit, setTgtEdit] = useState(false);
  const [tgtVal, setTgtVal] = useState(TARGET);
  const [salesVal, setSalesVal] = useState(SALES_TARGET);
  const [showVal, setShowVal] = useState<GoalShow>(show);
  const [tgtBusy, setTgtBusy] = useState(false);
  const openTgt = () => { setTgtVal(TARGET); setSalesVal(SALES_TARGET); setShowVal(show); setTgtEdit(true); };
  const saveTarget = async () => {
    if (showVal !== "sales" && !tgtVal) { toast("마진 목표 금액을 넣으세요"); return; }
    if (showVal !== "margin" && !salesVal) { toast("매출 목표 금액을 넣으세요"); return; }
    setTgtBusy(true);
    try {
      await backend.setSetting("main", { ...settings, target: tgtVal || TARGET, salesTarget: salesVal || 0, show: showVal, year: Y });
      toast("목표를 바꿨습니다"); setTgtEdit(false);
    } catch { toast("목표를 저장하지 못했습니다. 관리자 권한이 필요합니다."); }
    setTgtBusy(false);
  };

  /* ---- 자유 배치: 상자를 끌어서 원하는 칸에 놓고, 오른쪽 아래 모서리로 크기 조절 ---- */
  const [myLay, setMyLay] = useState<Layout | null>(() => { try { return cleanLay(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch { return null; } });
  const layout: Layout = myLay || teamLayout || LAY0;
  const { width, containerRef, mounted } = useContainerWidth();
  const narrow = mounted && width < 720; // 휴대폰: 끌기 끄고 한 줄로
  useEffect(() => { backend.getMyLayout().then((v) => { const c = cleanLay(v); if (c) { setMyLay(c); try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* */ } } }).catch(() => {}); }, [backend]);

  // 바뀌면 바로 이 브라우저에 저장하고, 서버에는 잠깐 모아서 저장
  const saveT = useRef<number | undefined>(undefined);
  const persist = (v: Layout, msg?: string) => {
    setMyLay(v);
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* */ }
    window.clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      backend.setMyLayout(v).then(() => { if (msg) toast(msg); }).catch(() => toast("이 브라우저에만 배치를 저장했습니다 (서버 저장 실패)"));
    }, 600);
  };
  // 끌기·크기 조절이 끝났을 때 격자 결과를 그대로 저장 (숨긴 상자는 위치 유지)
  const onGridStop = (grid: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
    const moved = new Map(grid.map((g) => [g.i, g]));
    const items = layout.items.map((it) => { const g = moved.get(it.i); return g ? { i: it.i, x: g.x, y: g.y, w: g.w, h: g.h } : it; });
    persist({ ...layout, items });
  };
  const toggleHide = (id: WidgetId) => {
    const hidden = layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id];
    // 다시 보일 때는 맨 아래에 놓는다
    const bottom = layout.items.filter((it) => !hidden.includes(it.i) && it.i !== id).reduce((a, it) => Math.max(a, it.y + it.h), 0);
    const items = layout.hidden.includes(id) ? layout.items.map((it) => (it.i === id ? { ...it, y: bottom } : it)) : layout.items;
    persist({ ...layout, items, hidden }, layout.hidden.includes(id) ? `「${WNAME[id]}」을(를) 다시 보이게 했습니다` : `「${WNAME[id]}」을(를) 숨겼습니다`);
  };
  const reset = () => persist(clone(teamLayout || LAY0), "기본 배치로 되돌렸습니다");
  const saveTeam = async () => {
    try { await backend.setSetting("layout", clone(layout)); toast("팀 기본 배치로 저장했습니다. 개인 배치가 없는 사람에게 이 배치가 보입니다."); }
    catch { toast("팀 기본 배치를 저장하지 못했습니다. 관리자 권한이 필요합니다."); }
  };

  const visible = layout.items.filter((it) => !layout.hidden.includes(it.i));
  const renderW = (id: WidgetId, cls: string, children: ReactNode) => {
    if (layout.hidden.includes(id)) return null;
    return (
      <div key={id} className={`w ${cls}`} data-w={id} style={narrow ? undefined : { overflow: "auto" }}>
        {!narrow && (
          <div className="w-grip" title="끌어서 옮기기">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
            <span>{WNAME[id]}</span>
            <button type="button" className="w-x" aria-label={`${WNAME[id]} 숨기기`} title="숨기기" onClick={() => toggleHide(id)}>×</button>
          </div>
        )}
        {children}
      </div>
    );
  };

  const noTarget = (m: Metric) => !m.target;

  const cards: ReactNode[] = [
        renderW("rate", `kpi main${multi ? " multi" : ""}`, <>{metrics.map((m) => (
          <div key={m.key} className="kpi-part">
            <span className="lb">{m.name} 목표 달성률</span><span className="v">{noTarget(m) ? "—" : pct(m.total, m.target)}</span>
            <span className="d">{noTarget(m) ? "목표를 정하지 않았습니다" : `목표 ${eok(m.target)} 원 대비`}{multi ? "" : ` · 연간 경과율 ${(elapsed * 100).toFixed(1)}% (${mm}/${dd} 기준)`}</span>
          </div>))}
          {multi && <span className="d">연간 경과율 {(elapsed * 100).toFixed(1)}% ({mm}/{dd} 기준)</span>}</>),
        renderW("margin", "kpi", <><span className="lb">확정 마진 (판매원장)</span><span className="v">{won(totMargin)}</span>
          <span className="d">판매원장 {ledger.length}건 · 확정 매출 {eok(totSale)}원 · 평균 마진율 {pct(totMargin, totSale)}</span></>),
        renderW("left", `kpi${multi ? " multi" : ""}`, <>{metrics.map((m) => { const left = Math.max(0, m.target - m.total); return (
          <div key={m.key} className="kpi-part">
            <span className="lb">잔여 목표 {m.name}</span><span className="v">{noTarget(m) ? "—" : won(left)}</span>
            <span className="d">{noTarget(m) ? "목표를 정하지 않았습니다" : left ? `남은 기간(${mm}/${dd}~12/31) 월평균 필요액 ${won(Math.ceil(left / monthsLeft))}` : "목표를 달성했습니다"}</span>
          </div>); })}</>),
        renderW("pipe", "kpi", <><span className="lb">확도 반영 예상 매출 (진행 중)</span><span className="v">{eok(pipeW)}원</span>
          <span className="d">견적 총액 {eok(pipeAmt)}원 × 확도 · 진행 {pipe.length}건{lostN ? ` · 실주 ${lostN}건 제외` : ""}</span></>),
        renderW("target", "panel", <>
          <div className="sec-head"><div><h2>{multi ? "연간 마진·매출 목표 달성률" : `연간 ${metrics[0].name} 목표 ${metrics[0].target ? eok(metrics[0].target) + " 원 " : ""}달성률`}</h2>
            <span className="hint">판매원장 기준 · 계약일 월별 누적</span>
            <div>
              {canAdmin && canWrite && !tgtEdit && <button type="button" className="linkbtn" onClick={openTgt}>목표 바꾸기</button>}
              {tgtEdit && (
                <div className="tgt-edit" style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  <label className="tgt-row"><span>마진 목표</span><AmountInput aria-label="연간 마진 목표" value={tgtVal} onChange={setTgtVal} autoFocus /></label>
                  <label className="tgt-row"><span>매출 목표</span><AmountInput aria-label="연간 매출 목표" value={salesVal} onChange={setSalesVal} /></label>
                  <div className="tgt-row" role="radiogroup" aria-label="대시보드에 보일 목표"><span>보일 목표</span>
                    <div className="seg">
                      {([["margin", "마진만"], ["sales", "매출만"], ["both", "둘 다"]] as [GoalShow, string][]).map(([k, t]) => (
                        <button key={k} type="button" role="radio" aria-checked={showVal === k} className={showVal === k ? "on" : ""} onClick={() => setShowVal(k)}>{t}</button>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="btn primary" style={{ padding: "5px 12px" }} disabled={tgtBusy} onClick={saveTarget}>저장</button>
                    <button type="button" className="btn" style={{ padding: "5px 12px" }} onClick={() => setTgtEdit(false)}>취소</button>
                  </div>
                </div>
              )}
            </div>
          </div></div>
          <div className={multi ? "goal-grid" : undefined}>
            {metrics.map((m) => <GoalBlock key={m.key} m={m} multi={multi} year={Y} elapsed={elapsed} mm={mm} dd={dd} />)}
          </div>
        </>),
        renderW("contrib", "panel", <><Contrib total={totMargin} /></>),
        renderW("funnel", "panel", <><Funnel /></>),
        renderW("notes", "panel notes", <>
          <h2>집계 기준</h2>
          <ul>
            <li>당사 발행 견적서만 펀넬에 넣습니다. 매입처가 당사에 보낸 견적서는 넣지 않습니다.</li>
            <li>수정견적은 최신 버전 1건만 남기고, 금액·버전·비고를 그 건에서 고칩니다. 대안 견적은 1건으로 묶고 비고에 다른 안의 금액을 적습니다.</li>
            <li>확도 반영 금액 = 견적금액 × 확도. 진행 중(견적제출·수정견적·발주서 접수) 건만 예상 매출에 들어갑니다.</li>
            <li>판매원장을 작성하면 연결한 견적이 자동으로 「판매원장 작성(100%)」 단계로 바뀌고 마진(판매가−원가)과 매출(판매가)이 달성률에 반영됩니다. 대시보드에 보일 목표(마진·매출·둘 다)는 관리자가 「목표 바꾸기」에서 정합니다.</li>
            <li>최근 7일 안에 추가된 건에는 NEW 표시가 붙습니다. 모든 변경은 열어 둔 모든 직원 화면에 바로 반영됩니다.</li>
          </ul>
        </>),
  ];
  // 휴대폰 폭: 배치 순서(위→아래, 왼쪽→오른쪽)대로 한 줄로 쌓기
  const order = new Map([...visible].sort((a, b) => a.y - b.y || a.x - b.x).map((it, k) => [it.i as string, k]));
  const shown = cards.filter(Boolean) as React.ReactElement[];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="dash-bar">
        <span className="hint">{narrow ? "넓은 화면에서 상자를 끌어 배치를 바꿀 수 있습니다." : "상자 위쪽 ⠿ 막대를 잡고 원하는 곳으로 끌어 놓고, 오른쪽 아래 모서리를 끌어 크기를 바꾸세요. 배치는 사람마다 자동 저장됩니다."}</span>
        <div className="grp">
          {layout.hidden.length > 0 && (
            <span className="hint" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>숨긴 항목:
              {layout.hidden.map((id) => <button key={id} type="button" className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => toggleHide(id)}>＋ {WNAME[id]}</button>)}
            </span>
          )}
          <button type="button" className="btn ghost" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={reset}>기본 배치로</button>
          {canAdmin && !narrow && <button type="button" className="btn ghost" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={saveTeam}>이 배치를 팀 기본값으로</button>}
        </div>
      </div>
      <div ref={containerRef} aria-label="대시보드 항목">
        {mounted && (narrow ? (
          <div className="dgrid-m">{[...shown].sort((a, b) => (order.get(String(a.key)) ?? 0) - (order.get(String(b.key)) ?? 0))}</div>
        ) : (
          <ReactGridLayout className="rgl-dash" width={width} layout={visible.map((it) => {
            // 마진·매출을 둘 다 보이면 달성률·잔여 목표 상자에 두 줄이 들어가도록 높이를 늘린다
            const tall = multi && (it.i === "rate" || it.i === "left");
            return { ...it, h: tall ? Math.max(it.h, 7) : it.h, minW: MIN[it.i].w, minH: tall ? 7 : MIN[it.i].h };
          })}
            gridConfig={{ cols: GRID.cols, rowHeight: GRID.rowHeight, margin: GRID.margin, containerPadding: [0, 0] }}
            dragConfig={{ enabled: true, handle: ".w-grip", cancel: ".w-x" }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            onDragStop={(l: GridLayout) => onGridStop(l)} onResizeStop={(l: GridLayout) => onGridStop(l)}>
            {shown}
          </ReactGridLayout>
        ))}
      </div>
    </section>
  );
}

// 목표 하나(마진 또는 매출)
interface Metric { key: "margin" | "sales"; name: string; target: number; total: number }
const valOf = (key: Metric["key"]) => (r: { margin: number; sale: number }) => (key === "sales" ? r.sale : r.margin);

// 목표 하나의 달성 막대 + 월별 누적 차트
function GoalBlock({ m, multi, year, elapsed, mm, dd }: { m: Metric; multi: boolean; year: number; elapsed: number; mm: number; dd: number }) {
  if (!m.target) return <div><h3 className="goal-h">{m.name}</h3><p className="note">연간 {m.name} 목표를 정하지 않았습니다. 관리자가 「목표 바꾸기」에서 정할 수 있습니다.</p></div>;
  const rate = (m.total / m.target) * 100;
  return (
    <div>
      {multi && <h3 className="goal-h">{m.name} 목표 {eok(m.target)} 원</h3>}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(100, rate)}%` }}></div>
        <div className="bar-tick" style={{ left: `${elapsed * 100}%` }}></div>
        <div className="bar-mark" style={{ left: `${Math.min(92, Math.max(8, elapsed * 100))}%` }}>{mm}/{dd} 기준선 {eok(m.target * elapsed)}</div>
        <div className="bar-val" style={rate > 70 ? { right: `calc(${100 - Math.min(100, rate)}% + 8px)`, color: "var(--on-accent)" } : { left: `calc(${rate}% + 8px)` }}>
          {pct(m.total, m.target)} · {eok(m.total)}원
        </div>
      </div>
      <div className="bar-labels">{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{f ? eok(m.target * f) : "0"}</span>)}</div>
      <div style={{ marginTop: 22 }}><MonthlyChart target={m.target} year={year} metric={m} /></div>
    </div>
  );
}

function MonthlyChart({ target: TARGET, year: Y, metric }: { target: number; year: number; metric: Metric }) {
  const { ledger } = useCrm();
  const now = new Date(), mm = now.getMonth() + 1;
  const val = valOf(metric.key), nm = metric.name;
  const monthly = Array(12).fill(0) as number[];
  ledger.forEach((r) => { if (r.date && +r.date.slice(0, 4) === Y) monthly[+r.date.slice(5, 7) - 1] += val(r); });
  const inYear = ledger.filter((r) => r.date && +r.date.slice(0, 4) === Y).map((r) => +r.date.slice(5, 7) - 1);
  const first = ledger.length ? Math.min(...inYear, mm - 1) : 0;
  const lastM = now.getFullYear() === Y ? mm - 1 : now.getFullYear() > Y ? 11 : -1;
  const months: number[] = []; for (let i = Math.max(0, first); i < 12; i++) months.push(i);
  const cum: (number | null)[] = []; let s = 0;
  months.forEach((i) => { s += monthly[i]; cum.push(i <= lastM ? s : null); });
  const W = 560, H = 230, L = 58, R = 14, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
  const top = Math.max(TARGET, s) || 1;
  const y = (v: number) => T + ih - (v / top) * ih;
  const bw = iw / months.length, x = (i: number) => L + bw * i + bw / 2;
  const pts = cum.map((v, i) => (v == null ? null : ([x(i), y(v)] as [number, number]))).filter(Boolean) as [number, number][];
  const li = pts.length - 1, lv = cum[li] ?? 0;
  const mtxt = months.filter((m) => m <= lastM).map((m) => `${m + 1}월 ${won(monthly[m])}`).join(" · ");
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`월별 누적 ${nm}과 목표`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = top * f; return (
          <g key={f}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v ? eok(v) : "0"}</text></g>); })}
        <line x1={L} x2={W - R} y1={y(TARGET)} y2={y(TARGET)} stroke="var(--target)" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={W - R} y={y(TARGET) - 6} textAnchor="end" style={{ fill: "var(--target)" }}>목표 {eok(TARGET)}</text>
        {months.map((m, i) => { const v = monthly[m]; if (v <= 0) return null; const h = (ih * v) / top;
          return <rect key={m} x={x(i) - bw * 0.22} y={T + ih - h} width={bw * 0.44} height={Math.max(h, 1.5)} fill="var(--accent)" opacity=".35"><title>{m + 1}월 {nm} {won(v)}원</title></rect>; })}
        {pts.length > 0 && (
          <>
            <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
            {li < months.length - 1 && lv < TARGET && (
              <>
                <line x1={x(li)} y1={y(lv)} x2={x(months.length - 1)} y2={y(TARGET)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 4" />
                <text x={(x(li) + x(months.length - 1)) / 2 + 6} y={(y(lv) + y(TARGET)) / 2 + 16}>남은 기간 필요분</text>
              </>
            )}
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === li ? 5 : 3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2"><title>{months[i] + 1}월 누적 {won(cum[i] ?? 0)}원</title></circle>)}
            <text x={pts[li][0]} y={pts[li][1] - 12} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>{eok(lv)}</text>
          </>
        )}
        {months.map((m, i) => <text key={m} x={x(i)} y={H - 10} textAnchor="middle">{m + 1}월</text>)}
      </svg>
      <div className="note" style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 4 }}>
        <span><b style={{ color: "var(--accent)" }}>━</b> 누적 {nm}</span><span><b style={{ color: "var(--accent)", opacity: 0.5 }}>■</b> 월 {nm}</span>
        <span><b style={{ color: "var(--target)" }}>┅</b> 목표</span><span>{mtxt}</span>
      </div>
    </>
  );
}

function Contrib({ total }: { total: number }) {
  const { ledger } = useCrm();
  const rows = [...ledger].sort((a, b) => b.margin - a.margin).slice(0, 10);
  const short = (r: (typeof rows)[number]) => (r.end || r.client || "").replace("(주)", "");
  return (
    <>
      <div className="sec-head"><div><h2>건별 마진 기여</h2><span className="hint">확정 마진 대비 비중 · 상위 10건</span></div></div>
      <div className="contrib">
        {!rows.length ? <p className="note">판매원장이 아직 없습니다. 판매원장 탭에서 첫 건을 작성하세요.</p> : (() => {
          const max = Math.max(1, rows[0].margin);
          return rows.map((r) => (
            <div key={r.id} className="c-row"><span className="nm" title={`${r.end || r.client} · ${r.name}`}>{short(r)}</span>
              <div className="c-bar"><i style={{ width: `${(Math.max(0, r.margin) / max) * 100}%` }}></i></div><span className="val">{won(r.margin)}</span></div>));
        })()}
      </div>
      {rows.length > 0 && total > 0 && (
        <p className="note" style={{ margin: "14px 0 0" }}>
          {short(rows[0])} 1건이 확정 마진의 {pct(rows[0].margin, total)}입니다. 나머지 {ledger.length - 1}건 합계는 {won(total - rows[0].margin)}원입니다.
        </p>
      )}
    </>
  );
}

function Funnel() {
  const { deals } = useCrm();
  const order: [Stage, string][] = [["quote", "10%"], ["nego", "30%"], ["po", "90%"], ["won", "100%"]];
  const color: Record<string, string> = { quote: "var(--quote)", nego: "var(--nego)", po: "var(--po)", won: "var(--won)" };
  const widths = [100, 78, 56, 40];
  const sum = (arr: typeof deals, k: "w" | "amt") => arr.reduce((a, d) => a + d[k], 0);
  const segs = order.map(([k]) => { const rs = deals.filter((d) => d.stage === k); return { k, n: rs.length, w: sum(rs, "w") }; });
  const totW = segs.reduce((a, x) => a + x.w, 0);
  const Rr = 60, C = 2 * Math.PI * Rr; let off = 0;
  return (
    <>
      <div className="sec-head"><div><h2>견적 기반 영업 펀넬</h2><span className="hint">확도: 견적제출 10% · 수정견적 30% · 발주서 접수 90% · 판매원장 작성 100% · 실주 0%</span></div></div>
      <div className="funnel">
        <div className="f-grid">
          <div className="f-bars">
            {order.map(([k, p], i) => { const rs = deals.filter((d) => d.stage === k); return (
              <div key={k} className="f-step"><span className="nm">{STAGE[k]} <span className="prob" style={{ color: color[k] }}>{p}</span></span>
                <div className="f-shape" style={{ width: `${widths[i]}%`, background: color[k] }}><span>{rs.length}건</span><span className="num">{won(sum(rs, "w"))}원</span></div></div>); })}
          </div>
          <div className="donut">
            <svg viewBox="0 0 170 170" role="img" aria-label="단계별 확도 반영 금액 비중">
              <circle cx="85" cy="85" r={Rr} fill="none" stroke="var(--line)" strokeWidth="24" />
              {segs.map((x) => { if (!x.w) return null; const len = (C * x.w) / totW; const el = (
                <circle key={x.k} cx="85" cy="85" r={Rr} fill="none" stroke={color[x.k]} strokeWidth="24" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 85 85)">
                  <title>{STAGE[x.k]} {won(x.w)}원 ({pct(x.w, totW)})</title></circle>); off += len; return el; })}
              <text x="85" y="80" textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>확도 반영</text>
              <text x="85" y="98" textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{eok(totW)}</text>
            </svg>
            <div className="d-legend">
              {segs.map((x) => <div key={x.k}><span className="sw" style={{ background: color[x.k] }}></span>{STAGE[x.k]} <b>{pct(x.w, totW)}</b> <span className="note">{x.n}건 · {eok(x.w)}</span></div>)}
              <div className="note">실주 {deals.filter((d) => d.stage === "lost").length}건은 제외</div>
            </div>
          </div>
        </div>
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>단계</th><th className="r">확도</th><th className="r">건수</th><th className="r">견적금액</th><th className="r">확도 반영 금액</th></tr></thead>
            <tbody>
              {[...order, ["lost", "0%"] as [Stage, string]].map(([k, p]) => { const rs = deals.filter((d) => d.stage === k); return (
                <tr key={k}><td><span className={`pill ${k}`}>{STAGE[k]}</span></td><td className="r">{p}</td><td className="r">{rs.length}</td><td className="r">{won(sum(rs, "amt"))}</td><td className="r">{won(sum(rs, "w"))}</td></tr>); })}
            </tbody>
            <tfoot><tr><td colSpan={2}>합계 (실주 포함)</td><td className="r">{deals.length}</td><td className="r">{won(sum(deals, "amt"))}</td><td className="r">{won(sum(deals, "w"))}</td></tr></tfoot>
          </table>
        </div>
        <p className="note" style={{ margin: "8px 0 0" }}>막대 길이는 단계 순서이고, 막대 안 금액은 확도 반영 금액입니다. 원형 그래프는 확도 반영 금액의 단계별 비중입니다.</p>
      </div>
    </>
  );
}
