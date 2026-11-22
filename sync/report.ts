// 시험 실행 보고서 (HTML 한 장)
import type { Issue, PlannedDeal, PlannedLedger } from "./group.ts";
import type { Doc } from "./parse.ts";
import { config } from "./config.ts";
import type { Comparison } from "./compare.ts";
import path from "node:path";

function renderCompare(c: Comparison) {
  const dDiff = c.deals.both.filter((x) => x.diffs.length);
  const lDiff = c.ledger.both.filter((x) => x.diffs.length);
  const li = (s: string) => `<li>${s}</li>`;
  return `<section><h2>지금 CRM(손으로 입력한 데이터)과 비교</h2>
<p class="hint">견적은 견적번호·거래처·금액으로, 판매원장은 거래처·계약금액으로 맞춰 봤습니다.</p>
<div class="kpis" style="margin-bottom:12px">
  <div class="kpi"><div class="lb">견적 — 양쪽 모두 있음</div><div class="v">${c.deals.both.length}건</div><div class="d">그중 값이 다른 건 ${dDiff.length}건</div></div>
  <div class="kpi"><div class="lb">견적 — CRM에만 있음</div><div class="v">${c.deals.manualOnly.length}건</div><div class="d">폴더에 엑셀 견적이 없거나 다른 이름</div></div>
  <div class="kpi"><div class="lb">견적 — 폴더에만 있음 (새로 추가될 건)</div><div class="v">${c.deals.autoOnly.length}건</div></div>
  <div class="kpi"><div class="lb">판매원장 — 일치 / CRM에만 / 폴더에만</div><div class="v" style="font-size:18px;padding-top:4px">${c.ledger.both.length} / ${c.ledger.manualOnly.length} / ${c.ledger.autoOnly.length}</div><div class="d">값이 다른 건 ${lDiff.length}건</div></div>
</div>
<details><summary>견적 — 값이 다른 건 ${dDiff.length}</summary><ul>${dDiff.map((x) => li(`${esc(x.manual.client)} · ${esc(x.manual.name)} — ${esc(x.diffs.join(", "))}`)).join("")}</ul></details>
<details><summary>견적 — CRM에만 있음 ${c.deals.manualOnly.length}</summary><ul>${c.deals.manualOnly.map((m) => li(`${esc(m.no)} ${esc(m.client)} · ${esc(m.name)} (${won(m.amt ?? null)}원, ${esc(m.stage)})`)).join("")}</ul></details>
<details><summary>견적 — 폴더에만 있음 ${c.deals.autoOnly.length}</summary><ul>${c.deals.autoOnly.map((d) => li(`${esc(d.no)} ${esc(d.client)} · ${esc(d.name)} (${won(d.amt)}원) <span class="note">${esc(d.folder)}</span>`)).join("")}</ul></details>
<details><summary>판매원장 — 값이 다른 건 ${lDiff.length}</summary><ul>${lDiff.map((x) => li(`${esc(x.manual.client)} · ${esc(x.manual.name)} — ${esc(x.diffs.join(", "))}`)).join("")}</ul></details>
<details><summary>판매원장 — CRM에만 있음 ${c.ledger.manualOnly.length}</summary><ul>${c.ledger.manualOnly.map((m) => li(`${esc(m.client)} · ${esc(m.name)} (${won(m.sale ?? null)}원)`)).join("")}</ul></details>
<details><summary>판매원장 — 폴더에만 있음 ${c.ledger.autoOnly.length}</summary><ul>${c.ledger.autoOnly.map((l) => li(`${esc(l.doc.client)} · ${esc(l.doc.project)} (${won(l.doc.sale)}원)`)).join("")}</ul></details>
</section>`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const won = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("ko-KR"));
const STAGE: Record<string, [string, string]> = { quote: ["견적제출 10%", "quote"], nego: ["수정견적 30%", "nego"], po: ["발주서 접수 90%", "po"], won: ["판매원장 100%", "won"] };
const relf = (f: string) => path.relative(config.root, f);

export function renderReport(
  s: Record<string, unknown>,
  r: { deals: PlannedDeal[]; ledger: PlannedLedger[]; issues: Issue[] },
  skipped: Doc[],
  cmp: Comparison | null = null,
) {
  const cmpHtml = cmp ? renderCompare(cmp) : "";
  const deals = [...r.deals].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const byKey = Object.fromEntries(r.deals.map((d) => [d.key, d]));
  const cnt = (st: string) => r.deals.filter((d) => d.stage === st).length;
  const totAmt = r.deals.reduce((a, d) => a + d.amt, 0);
  const totMargin = r.ledger.reduce((a, l) => a + l.margin, 0);

  const dealRows = deals.map((d) => `<tr>
    <td><span class="pill ${STAGE[d.stage][1]}">${STAGE[d.stage][0]}</span></td>
    <td>${esc(d.client)}</td><td>${esc(d.end) || "—"}</td>
    <td>${esc(d.name)}${d.memo ? `<div class="note">${esc(d.memo)}</div>` : ""}</td>
    <td class="num">${esc(d.no)}${d.ver ? ` <span class="note">(${esc(d.ver)})</span>` : ""}</td>
    <td class="num">${esc(d.date)}</td><td class="r">${won(d.amt)}</td><td>${esc(d.owner) || "—"}</td>
    <td><details><summary>파일 ${d.quotes.length + d.pos.length + (d.ledger ? 1 : 0)}개</summary><ul>
      ${d.quotes.map((q) => `<li>견적 ${esc(q.date)} · ${won(q.amt)}원 — ${esc(relf(q.file))}</li>`).join("")}
      ${d.pos.map((p) => `<li>발주서 ${esc(p.date)} (${p.direction === "purchase" ? "당사→매입처" : p.direction === "sales" ? "고객→당사" : "방향 모름"}) — ${esc(relf(p.file))}</li>`).join("")}
      ${d.ledger ? `<li>판매원장 — ${esc(relf(d.ledger.file))}</li>` : ""}
    </ul></details></td></tr>`).join("");

  const ledRows = [...r.ledger].sort((a, b) => (b.doc.date || "").localeCompare(a.doc.date || "")).map((l) => {
    const d = l.dealKey ? byKey[l.dealKey] : null;
    return `<tr><td>${esc(l.doc.client)}</td><td>${esc(l.doc.project)}</td><td class="num">${esc(l.doc.date) || "<b class='bad'>없음</b>"}</td>
      <td class="r">${won(l.doc.sale)}</td><td class="r">${won(l.doc.cost)}</td><td class="r">${won(l.margin)}</td>
      <td class="r">${l.doc.sale ? ((l.margin / l.doc.sale) * 100).toFixed(1) + "%" : "—"}</td>
      <td>${d ? `✓ ${esc(d.name)}` : "<span class='bad'>연결 안 됨</span>"}</td><td class="note">${esc(l.doc.invoiceDue)}</td>
      <td class="note">${esc(relf(l.doc.file))}</td></tr>`;
  }).join("");

  const autoRows = r.issues.filter((x) => x.auto).map((x) => `<li><b>${esc(x.title)}</b> — ${esc(x.file)} <span class="note">${esc(x.detail)}</span></li>`).join("");
  const review = r.issues.filter((x) => !x.auto);
  const issueRows = review.map((x) => `<tr><td><b>${esc(x.title)}</b><div class="note">${esc(x.detail)}</div></td><td class="note">${esc(x.file)}</td></tr>`).join("");
  const skipRows = skipped.map((x) => `<li>${esc(relf(x.file))} <span class="note">— ${esc("reason" in x ? x.reason : "")}</span></li>`).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>영업 폴더 동기화 시험 실행</title>
<style>
:root{--bg:#f4f5f2;--surface:#fff;--ink:#17202a;--muted:#68727d;--line:#e4e7e2;--accent:#0f7a5c;--won:#0f7a5c;--won-bg:#e2f0e9;--nego:#3d5fc4;--nego-bg:#e8edfa;--quote:#7d8794;--quote-bg:#eef0f2;--po:#c0801a;--po-bg:#fbf0dc;--lost:#c8484f}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Malgun Gothic",-apple-system,sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:24px 16px 64px;display:grid;gap:20px}
header{padding:20px 24px;border-radius:14px;background:linear-gradient(135deg,#11201b,#1f4c3d);color:#f2f6f4}
header h1{margin:4px 0;font-size:22px} header .sub{color:#8fd9bb;font-weight:600;font-size:13px} header p{margin:6px 0 0;font-size:12.5px;color:rgba(242,246,244,.75)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .lb{font-size:12px;color:var(--muted)} .kpi .v{font-size:22px;font-weight:700} .kpi .d{font-size:12px;color:var(--muted)}
section{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0}
h2{font-size:16px;margin:0 0 4px} .hint{font-size:12.5px;color:var(--muted);margin:0 0 12px}
.tbl{overflow-x:auto} table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:900px}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#f7f8f5;color:var(--muted);font-weight:600;white-space:nowrap} .r{text-align:right;white-space:nowrap} .num{white-space:nowrap;font-family:Consolas,monospace}
.note{font-size:11.5px;color:var(--muted)} .bad{color:var(--lost);font-weight:600}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap}
.pill.won{background:var(--won-bg);color:var(--won)}.pill.nego{background:var(--nego-bg);color:var(--nego)}.pill.quote{background:var(--quote-bg);color:var(--quote)}.pill.po{background:var(--po-bg);color:var(--po)}
details summary{cursor:pointer;color:var(--accent);font-size:12px;white-space:nowrap} details ul{margin:6px 0 0;padding-left:16px;font-size:11.5px;color:var(--muted)}
</style></head><body><div class="wrap">
<header><div class="sub">Solo-CRM · 자동 동기화</div><h1>영업 폴더 시험 실행 보고서</h1>
<p>읽기만 했고 CRM에는 아무것도 저장하지 않았습니다 · ${esc(s.root)} · 기준일 ${esc(s.since)} 이후 · ${esc(String(s.generatedAt).slice(0, 16).replace("T", " "))} 생성 (${esc(s.seconds)}초)</p></header>
<div class="kpis">
  <div class="kpi"><div class="lb">CRM 견적 (파이프라인)</div><div class="v">${r.deals.length}건</div><div class="d">견적 파일 ${esc(s.quotes)}개를 묶음 · 합계 ${won(totAmt)}원</div></div>
  <div class="kpi"><div class="lb">단계</div><div class="v" style="font-size:15px;padding-top:6px">10% ${cnt("quote")} · 30% ${cnt("nego")} · 90% ${cnt("po")} · 100% ${cnt("won")}</div><div class="d">실주는 파일로 알 수 없어 직접 표시</div></div>
  <div class="kpi"><div class="lb">판매원장</div><div class="v">${r.ledger.length}건</div><div class="d">견적 연결 ${r.ledger.filter((l) => l.dealKey).length}건 · 마진 합계 ${won(totMargin)}원</div></div>
  <div class="kpi"><div class="lb">확인 필요</div><div class="v" style="color:${review.length ? "var(--po)" : "var(--won)"}">${review.length}건</div><div class="d">아래 목록 참고</div></div>
  <div class="kpi"><div class="lb">제외한 파일</div><div class="v">${skipped.length}개</div><div class="d">매입 견적 등 · 기준일 이전 ${esc(s.old)}개</div></div>
</div>
${cmpHtml}<section><h2>견적 파이프라인에 들어갈 건</h2><p class="hint">같은 폴더·같은 프로젝트의 여러 버전은 1건으로 묶고 최신 금액을 씁니다. 이전 버전과 대안 금액은 비고에 남깁니다. 「파일」을 누르면 근거 파일이 보입니다.</p>
<div class="tbl"><table><thead><tr><th>단계</th><th>거래처</th><th>최종 고객 (폴더로 추정)</th><th>사업명 / 비고</th><th>견적번호</th><th>견적일</th><th class="r">견적금액</th><th>담당</th><th>근거</th></tr></thead><tbody>${dealRows || "<tr><td colspan=9>없음</td></tr>"}</tbody></table></div></section>
<section><h2>판매원장에 들어갈 건</h2><p class="hint">판매관리원장 엑셀의 계약금액·원가·계약일을 그대로 씁니다. 세금계산서 발행·수금은 엑셀에 없어 CRM에서 직접 체크합니다.</p>
<div class="tbl"><table><thead><tr><th>업체명</th><th>프로젝트</th><th>계약일</th><th class="r">계약금액</th><th class="r">원가</th><th class="r">마진</th><th class="r">마진율</th><th>연결된 견적</th><th>계산서 발행 예정</th><th>파일</th></tr></thead><tbody>${ledRows || "<tr><td colspan=10>없음</td></tr>"}</tbody></table></div></section>
<section><h2>확인 필요</h2><p class="hint">짐작해서 넣지 않은 항목입니다. 실제 동기화 때는 CRM 화면의 「확인 필요」 목록에서 처리합니다.</p>
<div class="tbl"><table><thead><tr><th>내용</th><th>파일</th></tr></thead><tbody>${issueRows || "<tr><td colspan=2>없음</td></tr>"}</tbody></table></div></section>
${autoRows ? `<section><h2>규칙으로 자동 처리한 항목</h2><ul>${autoRows}</ul></section>` : ""}<section><h2>제외한 파일 (${skipped.length}개)</h2><p class="hint">매입처가 당사에 보낸 견적서 등 당사 발행 양식이 아닌 파일입니다.</p><details><summary>목록 펼치기</summary><ul>${skipRows}</ul></details></section>
</div></body></html>`;
}
