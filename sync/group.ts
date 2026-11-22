// 읽은 문서들을 CRM 건으로 묶는다
// - 같은 폴더의 같은 프로젝트(또는 같은 견적번호) 견적 → 1건 (최신 버전만 남기고 이전 버전은 비고에)
// - 판매원장 → 거래처·금액·프로젝트명이 맞는 견적과 연결, 견적은 100%
// - 발주서 → 같은 폴더 견적을 90% 로
import path from "node:path";
import { config } from "./config.ts";
import { normCompany, type LedgerDoc, type PoDoc, type QuoteDoc } from "./parse.ts";
import type { Stage } from "../src/lib/types.ts";

export interface PlannedDeal {
  key: string;
  stage: Stage;
  client: string;
  end: string | null;
  name: string;
  no: string | null;
  ver: string | null;
  date: string | null;
  amt: number;
  owner: string | null;
  memo: string;
  folder: string; // 영업 폴더 기준 상대 경로
  quotes: QuoteDoc[]; // 오래된 것 → 최신
  pos: PoDoc[];
  ledger: LedgerDoc | null;
}

export interface PlannedLedger {
  doc: LedgerDoc;
  dealKey: string | null;
  margin: number;
}

export interface Issue {
  file: string;
  title: string;
  detail: string;
  auto?: boolean; // 규칙으로 자동 처리됨 (참고용)
}

const rel = (f: string) => path.relative(config.root, f);
const dirOf = (f: string) => path.dirname(rel(f));
export const normProject = (s: string) => s.replace(/件|건|\s+|[()[\]{}_\-·,.&]/g, "").toLowerCase();

function similar(a: string, b: string) {
  const x = normProject(a), y = normProject(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  // 두 글자 조각 겹침 비율
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(x), B = grams(y);
  let n = 0; A.forEach((g) => { if (B.has(g)) n++; });
  return (2 * n) / (A.size + B.size || 1);
}

// 폴더 경로로 최종 고객 추정: 거래처\{매출처}\{최종고객}\… / 고객사\{고객}\…
function endFromFolder(dir: string, client: string): string | null {
  const parts = dir.split(path.sep);
  const companyLike = /\(주\)|㈜|주식회사|병원|대학교|공사|공단|은행|센터|그룹|전자|정보|평가/;
  if (parts[0] === "고객사" && parts[1]) return parts[1];
  if (parts[0] === "거래처" && parts[2] && companyLike.test(parts[2]) && normCompany(parts[2]) !== normCompany(client)) {
    return parts[2].replace(/_\d{6}$/, "").replace(/㈜/g, "(주)");
  }
  return null;
}

// 모델명 조각: 영문+숫자가 섞인 4글자 이상 (GWN7721P, N1524P, JL684B, AP-515, FG-121G)
export function models(s: string): string[] {
  return (s.toUpperCase().match(/[A-Z]{1,6}-?\d{2,6}[A-Z0-9]*/g) || [])
    .filter((t) => t.length >= 4 && /\d/.test(t) && /[A-Z]/.test(t) && !/^(?:20)?\d{2}(?:0[1-9]|1[0-2])\d{2}$/.test(t))
    .map((t) => t.replace("-", ""));
}

// 파일 이름 「To 거래처」와 내용의 수신처가 같은가 (이름에 To 가 없으면 같다고 봄)
function nameMatches(q: QuoteDoc) {
  const toInName = path.basename(q.file).match(/To[_\s]+(?:\(주\)|㈜)?\s*([^_\s]+)/i)?.[1];
  if (!toInName) return true;
  const a = normCompany(toInName), b = normCompany(q.client);
  return !a || !b || a.includes(b) || b.includes(a) || similar(a, b) >= 0.5;
}

export function plan(quotes: QuoteDoc[], ledgers: LedgerDoc[], pos: PoDoc[]) {
  const issues: Issue[] = [];

  /* ---- 1. 견적 묶기 ---- */
  const sorted = [...quotes].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.file.localeCompare(b.file));
  const groups: QuoteDoc[][] = [];
  const nearDir = (a: string, b: string) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  // 이 묶음이 이미 계약(판매원장)됐는가: 같은 거래처·가까운 폴더의 판매원장이 q 이전 날짜이고 금액이 묶음 안 견적과 같음
  const closedBefore = (gr: QuoteDoc[], q: QuoteDoc) => ledgers.some((l) =>
    l.date && q.date && l.date < q.date && normCompany(l.client) === normCompany(q.client) &&
    nearDir(dirOf(l.file), dirOf(gr[gr.length - 1].file)) && gr.some((o) => o.amt != null && o.amt === l.sale));
  for (const q of sorted) {
    // 다른 견적서를 복사해 내용만 고친 파일이 많다 → 파일 이름이 아니라 내용(수신처)을 기준으로 하고 참고로만 남김
    const toInName = path.basename(q.file).match(/To[_\s]+(?:\(주\)|㈜)?\s*([^_\s]+)/i)?.[1];
    if (toInName) {
      const a = normCompany(toInName), b = normCompany(q.client);
      if (a && b && !a.includes(b) && !b.includes(a) && similar(a, b) < 0.5) {
        issues.push({ file: rel(q.file), title: "파일 이름과 내용의 거래처가 다름 — 내용 기준으로 반영", detail: `파일 이름은 「${toInName}」, 내용의 수신처는 「${q.client}」입니다.`, auto: true });
      }
    }
    // 같은 견적번호를 같은 날 다른 거래처에 쓴 경우가 있어, 번호가 같아도 거래처까지 같아야 같은 건
    const same = (o: QuoteDoc) => !!q.no && o.no === q.no && normCompany(o.client) === normCompany(q.client);
    const like = (o: QuoteDoc) => dirOf(o.file) === dirOf(q.file) && normCompany(o.client) === normCompany(q.client) && similar(o.project, q.project) >= 0.75;
    // 맞는 묶음이 여럿이면(1차·2차로 나뉜 경우) 가장 최근 묶음에 붙인다
    const g = [...groups].reverse().find((gr) => gr.some((o) => same(o) || like(o)));
    if (!g) { groups.push([q]); continue; }
    const last = g[g.length - 1];
    const explicit = g.some(same) || !!q.version; // 같은 견적번호이거나 파일 이름에 ver2·final 표시
    // 규칙 1: 앞 건이 이미 판매원장까지 갔으면, 그 뒤 견적은 새 건 (1차 → 2차)
    if (!g.some(same) && closedBefore(g, q)) {
      groups.push([q]);
      issues.push({ file: rel(q.file), title: "이전 건 계약 후 나온 견적 — 새 건으로 분리", detail: `「${last.project}」는 이미 판매원장이 있어, 이 견적은 별도 건으로 넣습니다.`, auto: true });
      continue;
    }
    // 규칙 2: 버전 표시·같은 번호 없이 금액이 5배 넘게 차이 나면 추가 견적/다른 건으로 분리
    const ratio = q.amt && last.amt ? q.amt / last.amt : 1;
    if (!explicit && (ratio > 5 || ratio < 0.2)) {
      groups.push([q]);
      issues.push({ file: rel(q.file), title: "금액 차이가 커서 별도 건으로 분리", detail: `같은 폴더의 「${last.project}」(${last.amt?.toLocaleString("ko-KR")}원)와 금액이 크게 달라(${q.amt?.toLocaleString("ko-KR")}원) 수정본이 아니라 추가 견적으로 봤습니다. 같은 건이면 합쳐 주세요.` });
      continue;
    }
    g.push(q);
  }

  const won = (n: number | null) => `${n?.toLocaleString("ko-KR") ?? "?"}원`;
  const deals: PlannedDeal[] = groups.map((g, i) => {
    // 대표 견적: 가장 최근 날짜의 파일들 중
    //  - ver2·final 표시가 있으면 같은 날이라도 수정본 → 가장 높은 버전
    //  - 버전 표시가 없으면 대안 견적 → 처음 만든 파일(1안). 나머지 안은 비고에
    //  - 같은 견적번호 여러 파일 = 수정본 → 가장 나중에 저장한 것 / 다른 견적번호 = 대안 → 가장 작은 번호(1안)
    //  - 대표 금액이 비어 있으면 다음 안
    const lastDate = g[g.length - 1].date;
    const sameDay = g.filter((q) => q.date === lastDate);
    const vrank = (q: QuoteDoc) => (q.version === "최종" ? 999 : q.version ? +q.version.replace(/\D/g, "") || 1 : 0);
    // 동점이면 파일 이름의 거래처가 내용과 맞는 파일 우선 (다른 견적서를 복사해 쓴 파일보다)
    const latestOf = (qs: QuoteDoc[]) => [...qs].sort((a, b) => vrank(b) - vrank(a) || (b.amt ? 1 : 0) - (a.amt ? 1 : 0) ||
      (nameMatches(b) ? 1 : 0) - (nameMatches(a) ? 1 : 0) || b.mtime - a.mtime)[0];
    const byNo = new Map<string, QuoteDoc[]>();
    for (const q of sameDay) { const k = q.no || q.file; byNo.set(k, [...(byNo.get(k) || []), q]); }
    const options = [...byNo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, qs]) => latestOf(qs));
    const versioned = sameDay.filter((q) => q.version);
    const pick = versioned.length ? latestOf(versioned) : options[0];
    const last = pick.amt ? pick : options.find((o) => o.amt) || pick;
    const alts = versioned.length ? [] : options.filter((o) => o !== last);
    // 같은 견적의 엑셀·PDF처럼 번호·날짜·금액이 같은 이전 견적은 한 번만
    const prev = g.filter((q) => q.date !== lastDate)
      .filter((q, k, all) => all.findIndex((o) => o.no === q.no && o.date === q.date && o.amt === q.amt) === k);
    const memo: string[] = [];
    const altList = [...last.alternatives.map((a) => `${a.sheet} ${won(a.amt)}`), ...alts.map((a) => `${a.project === last.project ? "다른 안" : a.project} ${won(a.amt)}`)];
    if (altList.length) memo.push("대안: " + altList.join(", "));
    if (prev.length) memo.push(`이전 견적 ${prev.length}건: ` + prev.map((p) => `${p.date ?? "?"} ${won(p.amt)}`).join(", "));
    if (!last.amt) issues.push({ file: rel(last.file), title: "견적금액을 읽지 못함", detail: "견적금액·DC 제안가·합계 칸이 비어 있습니다. 0원으로 넣지 않고 확인을 기다립니다." });
    // 같은 날 만든 여러 파일은 대안 견적 → 「견적제출」 유지. 날짜가 다른 후속 견적이 있어야 「수정견적」
    const days = new Set(g.map((q) => q.date)).size;
    return {
      key: `D${i + 1}`,
      stage: days > 1 ? "nego" : "quote",
      client: last.client,
      end: endFromFolder(dirOf(last.file), last.client),
      name: last.project,
      no: last.no,
      ver: days > 1 ? last.version || `ver${days}` : last.version,
      date: last.date,
      amt: last.amt || 0,
      owner: last.owner,
      memo: memo.join(" / "),
      folder: dirOf(last.file),
      quotes: g,
      pos: [],
      ledger: null,
    };
  });

  const near = (a: string, b: string) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  // 모델명(GWN7721P, N1524P, JL684B, AP-515 …)이 겹치면 같은 건일 가능성이 높다
  const dealModels = (x: PlannedDeal) => new Set([x.name, ...x.quotes.map((q) => path.basename(q.file))].flatMap(models));
  const sharesModel = (x: PlannedDeal, s: string) => { const m = dealModels(x); return models(s).some((t) => m.has(t)); };

  /* ---- 2. 판매원장 → 견적 ---- */
  const plannedLedger: PlannedLedger[] = [];
  // 같은 판매원장의 수정본(「수정_01.판매원장…」 등)은 가장 최근 파일 하나만
  const latestLedgers: LedgerDoc[] = [];
  for (const l of [...ledgers].sort((a, b) => b.mtime - a.mtime)) {
    const dup = latestLedgers.find((o) => normCompany(o.client) === normCompany(l.client) && similar(o.project, l.project) >= 0.85 &&
      near(path.dirname(dirOf(o.file)), path.dirname(dirOf(l.file))));
    if (dup) issues.push({ file: rel(l.file), title: "판매원장 수정본 — 최신 파일만 사용", detail: `최신본: ${rel(dup.file)}`, auto: true });
    else latestLedgers.push(l);
  }
  for (const l of latestLedgers) {
    const ld = dirOf(l.file);
    const lname = `${l.project} ${path.basename(l.file)}`;
    const nearL = (x: PlannedDeal) => near(ld, x.folder) || path.dirname(ld) === path.dirname(x.folder);
    const scored = deals.map((x) => {
      let s = 0;
      if (normCompany(x.client) === normCompany(l.client)) s += 2;
      if (l.sale && x.amt === l.sale) s += 3;
      else if (l.sale && x.quotes.some((q) => q.amt === l.sale || q.alternatives.some((a) => a.amt === l.sale))) s += 2;
      s += 2 * similar(x.name, l.project);
      if (sharesModel(x, lname)) s += 2;
      if (nearL(x)) s += 1;
      return { x, s };
    }).filter((c) => !c.x.ledger).sort((a, b) => b.s - a.s);
    const [best, second] = scored;
    const margin = (l.sale || 0) - (l.cost || 0);
    // 같은 거래처·가까운 폴더의 후보가 하나뿐이고 사업명이 조금이라도 비슷하면 그 건 (협상으로 금액이 바뀐 경우)
    const sameClientNear = deals.filter((x) => !x.ledger && normCompany(x.client) === normCompany(l.client) && nearL(x));
    const onlyOne = sameClientNear.length === 1 && (similar(sameClientNear[0].name, l.project) >= 0.2 || sharesModel(sameClientNear[0], lname)) ? sameClientNear[0] : null;
    // 금액까지 같으면 확실(≥5). 금액이 달라도(할인 등) 거래처·폴더·사업명이 맞고 다른 후보보다 확실히 앞서면 연결
    if (best && (best.s >= 5 || (best.s >= 4 && (!second || best.s - second.s >= 1)) || onlyOne === best.x)) {
      best.x.ledger = l; best.x.stage = "won";
      // 규칙 3: 계약된 건의 금액은 판매원장 계약금액 (견적 금액과 다르면 비고에 남김)
      if (l.sale && l.sale !== best.x.amt) {
        best.x.memo = [`최종 견적 ${best.x.amt.toLocaleString("ko-KR")}원 → 계약 ${l.sale.toLocaleString("ko-KR")}원`, best.x.memo].filter(Boolean).join(" / ");
        best.x.amt = l.sale;
      }
      plannedLedger.push({ doc: l, dealKey: best.x.key, margin });
    } else {
      // 연결할 견적이 없으면 판매원장으로 100% 건을 새로 만든다 (손으로 「(견적서 없음)」 건을 만들던 방식)
      const key = `L${plannedLedger.length + 1}`;
      deals.push({
        key, stage: "won", client: l.client, end: endFromFolder(ld, l.client), name: l.project, no: null, ver: null,
        date: l.date, amt: l.sale || 0, owner: l.writer, memo: "견적서 없음 — 판매원장에서 만듦", folder: ld, quotes: [], pos: [], ledger: l,
      });
      plannedLedger.push({ doc: l, dealKey: key, margin });
      const weak = best && best.s >= 3 && similar(best.x.name, l.project) >= 0.3;
      issues.push({
        file: rel(l.file), title: "견적서 없는 판매원장 — 새 건으로 추가",
        detail: weak ? `혹시 「${best.x.client} · ${best.x.name}」(${best.x.amt.toLocaleString("ko-KR")}원) 건이면 합쳐 주세요.` : "같은 건의 당사 견적을 찾지 못해 판매원장 내용으로 100% 건을 만들었습니다.",
        auto: !weak,
      });
    }
    if (!l.date) issues.push({ file: rel(l.file), title: "판매원장 계약일이 비어 있음", detail: "월별 달성률에 필요합니다. 작성일로 대신할지 확인이 필요합니다." });
  }

  /* ---- 3. 발주서 → 같은 폴더(또는 상·하위 폴더)의 건 중 이름이 가장 비슷한 건 ---- */
  for (const po of pos) {
    const d = dirOf(po.file);
    const base = path.basename(po.file);
    let poName = base.replace(/\.[^.]+$/, "").replace(/발주서|\(주\)|㈜|_\d{6,8}_?|\d{2}\.\d{2}\.\d{2}/g, " ");
    config.ourNames.forEach((re) => { poName = poName.replace(new RegExp(re.source, "gi"), " "); }); // 당사 상호는 비교에서 뺌
    const cands = deals
      .filter((x) => near(d, x.folder) && (!po.date || !x.date || !x.quotes.length || x.date <= po.date))
      // 견적 사업명과 판매원장 프로젝트명 중 더 비슷한 쪽 (판매원장 이름이 발주서와 같은 경우가 많음)
      .map((x) => ({ x, s: Math.max(similar(poName, x.name), x.ledger ? similar(poName, x.ledger.project) : 0) + (d === x.folder ? 0.2 : 0) + (sharesModel(x, base) ? 0.5 : 0) }))
      // 다른 폴더(상·하위)의 건은 이름이 어느 정도 비슷할 때만 — 하위 폴더 발주서를 상위의 엉뚱한 건에 붙이지 않게
      .filter((c) => c.x.folder === d || c.s >= 0.3)
      .sort((a, b) => b.s - a.s);
    if (!cands.length) {
      issues.push({ file: rel(po.file), title: "발주서에 맞는 견적이 없음", detail: po.direction === "purchase" ? "매입처에 보낸 발주서인데 같은 폴더에 당사 견적이 없습니다." : "같은 폴더에서 발주일 이전의 당사 견적을 찾지 못했습니다." });
      continue;
    }
    const [best, second] = cands;
    best.x.pos.push(po);
    if (second && best.s - second.s < 0.15) {
      issues.push({ file: rel(po.file), title: "발주서가 어느 견적 건인지 애매함", detail: `후보 ${cands.length}건 중 「${best.x.name}」에 연결했습니다. 다른 건이면 바꿔 주세요.` });
    }
  }

  /* ---- 4. 발주서만 있고 판매원장이 없으면 90% ---- */
  deals.forEach((x) => { if (!x.ledger && x.pos.length) x.stage = "po"; });

  return { deals, ledger: plannedLedger, issues };
}
