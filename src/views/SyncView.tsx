// 자동 동기화 탭 — 마지막 반영 시각, 동기화 PC·폴더 설정, 「확인 필요」 목록
import { useEffect, useState } from "react";
import { useCrm } from "../lib/crm";
import { stamp } from "../lib/format";
import { Sheet } from "../components/ui";
import type { SourceFile, SyncAgent, SyncIssue } from "../lib/types";

export function SyncView() {
  const { issues, lastRun, backend, canWrite, toast, writeFail, deals } = useCrm();
  const [busy, setBusy] = useState<string | null>(null);
  const synced = deals.filter((d) => d.source === "sync").length;

  const setStatus = async (x: SyncIssue, status: SyncIssue["status"]) => {
    setBusy(x.id);
    try { await backend.setIssue(x.id, status); toast(status === "resolved" ? "처리 완료로 표시했습니다" : "무시로 표시했습니다"); }
    catch (e) { toast(writeFail(e)); }
    setBusy(null);
  };

  if (backend.demo) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <div className="panel">
          <h2>영업 폴더 자동 동기화</h2>
          <p className="hint">데모 모드입니다. 아래 「DEMO-PC」는 화면을 둘러보기 위한 가상 PC이고, 실제 폴더를 읽지 않습니다. Supabase를 연결하고 각 PC에서 동기화 프로그램을 켜면 실제 PC가 나타납니다.</p>
        </div>
        <CompanySettings />
        <AgentSettings />
      </section>
    );
  }

  const ok = lastRun && !lastRun.error;
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="panel">
        <div className="sec-head"><div>
          <h2>영업 폴더 자동 동기화</h2>
          <span className="hint">영업 폴더의 견적서·발주서·판매원장을 읽어 반영합니다. CRM에서 직접 고친 칸은 동기화가 덮어쓰지 않습니다. 세금계산서 발행·수금은 동기화가 건드리지 않습니다.</span>
        </div></div>
        {!lastRun ? (
          <p className="status">아직 동기화 기록이 없습니다. 이 PC에서 <code>npm run sync:watch</code> 를 켜 두세요.</p>
        ) : (
          <div className="inv-sum" style={{ margin: 0 }}>
            <div className="grp"><span className="k">마지막 반영</span><b>{stamp(lastRun.finishedAt || lastRun.startedAt)}</b>
              <span className="k" style={{ color: ok ? "var(--won)" : "var(--lost)" }}>{ok ? "정상" : lastRun.finishedAt ? "실패: " + lastRun.error : "진행 중…"}</span></div>
            {lastRun.stats && (
              <div className="grp"><span className="k">지난 반영 내용</span>
                <b>견적 +{lastRun.stats.dealsNew ?? 0} · 갱신 {lastRun.stats.dealsUpdated ?? 0}</b>
                <span className="k">판매원장 +{lastRun.stats.ledgerNew ?? 0} · 갱신 {lastRun.stats.ledgerUpdated ?? 0} · 손으로 고친 칸 보존 {lastRun.stats.lockedSkipped ?? 0}</span></div>
            )}
            <div className="grp"><span className="k">자동으로 들어온 견적</span><b>{synced}건</b><span className="k">전체 {deals.length}건 중</span></div>
          </div>
        )}
      </div>

      <CompanySettings />
      <AgentSettings />

      <div className="panel">
        <div className="sec-head"><div>
          <h2>확인 필요 <span className="cnt num">{issues.length || ""}</span></h2>
          <span className="hint">짐작해서 넣지 않은 파일입니다. 파일을 고치거나 엑셀을 저장하면 다음 동기화 때 저절로 사라집니다. 상관없는 항목은 「무시」를 누르세요.</span>
        </div></div>
        {!issues.length ? <p className="status">확인할 항목이 없습니다.</p> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>내용</th><th>파일 (영업 폴더 기준)</th>{canWrite && <th></th>}</tr></thead>
              <tbody>
                {issues.map((x) => (
                  <tr key={x.id}>
                    <td><b>{x.title}</b>{x.detail && <div className="note">{x.detail}</div>}</td>
                    <td className="note" style={{ wordBreak: "break-all" }}>{x.file}</td>
                    {canWrite && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy === x.id} onClick={() => setStatus(x, "resolved")}>처리 완료</button>{" "}
                        <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy === x.id} onClick={() => setStatus(x, "ignored")}>무시</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- 우리 회사 이름: 자동 동기화가 「당사 견적서」(발신자가 우리 회사)와 매입 견적을 구분하는 기준 ---- */
function CompanySettings() {
  const { company, canAdmin, backend, toast, writeFail } = useCrm();
  const [text, setText] = useState(company.join(", "));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(company.join(", ")); }, [company]);
  const names = text.split(",").map((s) => s.trim()).filter(Boolean);
  const dirty = names.join(",") !== company.join(",");
  const save = async () => {
    setBusy(true);
    try { await backend.setSetting("company", { names }); toast("우리 회사 이름을 저장했습니다. 다음 동기화부터 적용됩니다"); }
    catch (e) { toast(writeFail(e)); }
    setBusy(false);
  };
  return (
    <div className="panel">
      <div className="sec-head"><div>
        <h2>우리 회사 이름</h2>
        <span className="hint">견적서의 발신자가 이 이름이면 「당사 견적서」로 보고 영업 펀넬에 넣습니다. 다른 회사가 보낸 견적서(매입 견적)는 넣지 않습니다. 표기가 여러 개면 쉼표로 구분하세요 (예: 가나다, GANADA). (주)·주식회사·띄어쓰기는 무시합니다.</span>
      </div></div>
      {!company.length && <p className="status" style={{ color: "var(--lost)" }}>아직 정하지 않았습니다. 정할 때까지 자동 동기화가 견적서를 넣지 않습니다.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input aria-label="우리 회사 이름" value={text} disabled={!canAdmin || busy} onChange={(e) => setText(e.target.value)} placeholder="예: 가나다, GANADA"
          style={{ flex: "1 1 240px", font: "inherit", fontSize: 14, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg)", color: "var(--ink)" }} />
        {canAdmin
          ? <button type="button" className="btn primary" disabled={busy || !dirty || !names.length} onClick={save}>저장</button>
          : <span className="note">관리자만 바꿀 수 있습니다.</span>}
      </div>
    </div>
  );
}

/* ---- 동기화 PC·폴더 설정 ---- */
const OS: Record<string, string> = { win32: "Windows", linux: "Linux", darwin: "macOS" };
// 마지막 접속이 3분 안이면 켜져 있는 것으로 본다 (동기화 프로그램이 1분마다 알림)
const online = (a: SyncAgent) => !!a.lastSeen && Date.now() - Date.parse(a.lastSeen) < 3 * 60_000;

function AgentSettings() {
  const { agents, me, canAdmin, names } = useCrm();
  return (
    <div className="panel">
      <div className="sec-head"><div>
        <h2>동기화 PC·폴더 설정</h2>
        <span className="hint">
          동기화 프로그램을 켠 PC가 여기에 나타납니다. PC마다 읽을 <b>영업 폴더 경로</b>와 <b>기준일</b>을 정하세요.
          저장하면 1분 안에 그 PC에 반영됩니다. 본인 PC는 본인이, 모든 PC는 관리자가 바꿀 수 있습니다.
        </span>
      </div></div>
      {!agents.length ? (
        <div className="status" style={{ display: "grid", gap: 6 }}>
          <span>아직 등록된 PC가 없습니다. 영업 폴더가 있는 PC에서 동기화 프로그램을 한 번 실행하면 여기에 나타납니다.</span>
          <span>Windows: <code>npm run sync:watch</code> (또는 README 「PC를 켜면 자동 시작」) · 리눅스: README 「리눅스에서 자동 동기화」</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {agents.map((a) => <AgentRow key={a.id} a={a} editable={a.userId === me.id || canAdmin} owner={a.userId === me.id ? "나" : names[a.userId] || "직원"} />)}
        </div>
      )}
    </div>
  );
}

function AgentRow({ a, editable, owner }: { a: SyncAgent; editable: boolean; owner: string }) {
  const { backend, toast, writeFail } = useCrm();
  const [dir, setDir] = useState(a.salesDir || "");
  const [since, setSince] = useState(a.since || "");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const dirty = dir.trim() !== (a.salesDir || "") || since !== (a.since || "");
  const on = online(a);
  const example = a.platform === "win32" ? "C:\\Users\\이름\\OneDrive - 회사\\영업자료" : "/home/이름/영업자료";

  const save = async (patch: { salesDir?: string | null; since?: string | null; enabled?: boolean }, msg: string) => {
    setBusy(true);
    try { await backend.setAgent(a.id, patch); toast(msg); }
    catch (e) { toast(writeFail(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(`「${a.machine}」을(를) 목록에서 지울까요? 그 PC의 동기화 프로그램이 다시 켜지면 다시 등록됩니다.`)) return;
    setBusy(true);
    try { await backend.delAgent(a.id); toast("목록에서 지웠습니다"); }
    catch (e) { toast(writeFail(e)); setBusy(false); }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "grid", gap: 10, opacity: a.enabled ? 1 : 0.7 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <b>{a.machine}</b>
          <span className="pill quote">{OS[a.platform || ""] || a.platform || "?"}</span>
          <span className={"pill " + (on ? "won" : "lost")}>{on ? "켜져 있음" : "꺼져 있음"}</span>
          {!a.enabled && <span className="pill po">동기화 꺼 둠</span>}
          <span className="note">사용자: {owner} · 마지막 접속 {a.lastSeen ? stamp(a.lastSeen) : "—"}</span>
        </div>
        {editable && (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy}
              onClick={() => save({ enabled: !a.enabled }, a.enabled ? "이 PC의 동기화를 껐습니다" : "이 PC의 동기화를 켰습니다")}>
              {a.enabled ? "동기화 끄기" : "동기화 켜기"}
            </button>
            <button type="button" className="btn danger" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={remove}>목록에서 지우기</button>
          </div>
        )}
      </div>
      <div className="form" style={{ padding: 0, gridTemplateColumns: "minmax(0,1fr) minmax(0,11em)" }}>
        <div className="field">
          <label htmlFor={`dir-${a.id}`}>영업 폴더 경로 (그 PC 기준)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input id={`dir-${a.id}`} value={dir} disabled={!editable} placeholder={example} onChange={(e) => setDir(e.target.value)} spellCheck={false} style={{ flex: 1 }} />
            {editable && (
              <button type="button" className="btn" style={{ whiteSpace: "nowrap" }} disabled={busy || !on}
                title={on ? "그 PC의 폴더를 찾아 고릅니다 (동기화는 하지 않음)" : "그 PC가 꺼져 있어 찾아볼 수 없습니다. 경로를 직접 입력하세요."}
                onClick={() => setPicking(true)}>폴더 찾아보기</button>
            )}
          </div>
          {editable && (
            <span className="note">
              {on
                ? "폴더 찾아보기는 폴더를 고르기만 하고 동기화는 하지 않습니다. 고른 뒤 「저장」을 눌러야 바뀝니다. 언제든 다시 바꿀 수 있습니다."
                : "그 PC가 꺼져 있거나 Solo-CRM 프로그램이 실행 중이 아니라 폴더를 찾아볼 수 없습니다. 경로는 직접 입력해도 됩니다."}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={`since-${a.id}`}>기준일 (이후 견적·계약만)</label>
          <input id={`since-${a.id}`} type="date" value={since} disabled={!editable} onChange={(e) => setSince(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span className="note" style={{ color: a.folderOk === false ? "var(--lost)" : undefined }}>
          {a.lastError ? `오류: ${a.lastError}` : a.folderOk === false ? "이 경로의 폴더를 그 PC에서 찾지 못했습니다. 경로를 확인하세요." : a.folderOk ? "폴더 확인됨" : "폴더 확인 전"}
        </span>
        {editable && (
          <div style={{ display: "flex", gap: 6 }}>
            {dirty && <button type="button" className="btn" disabled={busy} onClick={() => { setDir(a.salesDir || ""); setSince(a.since || ""); }}>되돌리기</button>}
            <button type="button" className="btn primary" disabled={busy || !dirty || !dir.trim()}
              onClick={() => save({ salesDir: dir.trim(), since: since || null }, a.enabled ? "저장했습니다. 그 PC가 새 폴더를 곧 읽습니다" : "저장했습니다. 동기화를 켜면 새 폴더를 읽습니다")}>저장</button>
          </div>
        )}
      </div>
      {picking && <FolderPicker agentId={a.id} machine={a.machine} start={dir.trim()} onClose={() => setPicking(false)}
        onPick={(p) => { setDir(p); setPicking(false); toast("폴더를 채웠습니다. 「저장」을 눌러야 바뀝니다"); }} />}
    </div>
  );
}

/* ---- 폴더 찾아보기: 그 PC의 동기화 프로그램에 폴더 목록을 요청해 고른다 ---- */
function FolderPicker({ agentId, machine, start, onClose, onPick }: { agentId: string; machine: string; start: string; onClose: () => void; onPick: (path: string) => void }) {
  const { agents, backend, writeFail } = useCrm();
  const [reqAt, setReqAt] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [err, setErr] = useState("");
  const [pickMode, setPickMode] = useState(false); // 그 PC 화면에 탐색기 창을 띄운 요청인지
  const result = agents.find((x) => x.id === agentId)?.browse;
  const ready = !!result && !!reqAt && result.reqAt === reqAt;
  const waitingPick = pickMode && ready && !!result.picking;

  const go = async (path: string, pick = false) => {
    setTimedOut(false); setErr(""); setPickMode(pick);
    try { setReqAt(await backend.browseAgent(agentId, (pick ? "pick:" : "") + path)); }
    catch (e) { setErr(writeFail(e)); }
  };
  // 처음 열 때: 지금 경로(없으면 드라이브·내 폴더 목록)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { go(start); }, []);
  // 답이 없으면 안내 (목록은 10초, 탐색기 창은 사람이 고를 시간 10분)
  useEffect(() => {
    if (!reqAt || (ready && !waitingPick)) return;
    const t = setTimeout(() => setTimedOut(true), waitingPick ? 10 * 60_000 : 10_000);
    return () => clearTimeout(t);
  }, [reqAt, ready, waitingPick]);
  // 탐색기 창에서 고르면 바로 채운다
  useEffect(() => { if (pickMode && ready && result.picked && result.path) onPick(result.path); }, [pickMode, ready, result, onPick]);

  const join = (base: string, name: string, sep: string) => (base.endsWith(sep) ? base + name : base + sep + name);
  const chip: React.CSSProperties = { padding: "4px 10px", fontSize: 12 };

  return (
    <Sheet title={`폴더 찾아보기 — ${machine}`} onClose={onClose}
      foot={<>
        <span className="note" style={{ wordBreak: "break-all" }}>{waitingPick ? "그 PC의 탐색기 창에서 고르는 중…" : ready && result.path ? result.path : "폴더를 고르세요"}</span>
        <div className="grp">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" disabled={!ready || waitingPick || !result.path || !!result.error} onClick={() => ready && onPick(result.path)}>이 폴더 선택</button>
        </div>
      </>}>
      <div style={{ padding: "12px 18px", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "var(--accent-soft)" }}>
          <span style={{ fontSize: 12.5 }}>그 PC 앞에 계시면 Windows 탐색기 창으로 바로 고를 수 있습니다.</span>
          <button type="button" className="btn primary" style={chip} disabled={waitingPick}
            onClick={() => go(ready && result.path ? result.path : start, true)}>🗂 {machine}에서 탐색기로 선택</button>
        </div>
        {waitingPick && (
          <p className="status">「{machine}」 화면에 <b>「Solo-CRM — 영업 폴더 선택」</b> 창을 띄웠습니다. 그 창에서 폴더를 고르고 「이 폴더 선택」을 누르세요. 고르면 여기에 바로 채워집니다.</p>
        )}
        {pickMode && ready && result.cancelled && <p className="note">탐색기 창을 닫았습니다. 아래 목록에서 고르거나 다시 시도하세요.</p>}
        {ready && !waitingPick && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.roots.map((r) => (
              <button key={r.path} type="button" className="btn" style={chip} onClick={() => go(r.path)}>{r.label}</button>
            ))}
          </div>
        )}
        {err && <p className="form-err">{err}</p>}
        {!ready && !err && (
          <p className="status">{timedOut ? `「${machine}」에서 답이 없습니다. 그 PC가 켜져 있는지 확인하거나, 경로를 직접 입력하세요.` : `「${machine}」에서 폴더 목록을 받는 중…`}</p>
        )}
        {ready && !waitingPick && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {result.parent !== null && <button type="button" className="btn" style={chip} onClick={() => go(result.parent ?? "")}>↑ 위로</button>}
              <b style={{ wordBreak: "break-all", fontSize: 13 }}>{result.path || "드라이브·내 폴더"}</b>
            </div>
            {result.error ? <p className="form-err">{result.error}</p> : !result.path ? (
              <p className="note">위의 바로가기에서 시작할 곳을 고르세요.</p>
            ) : !result.dirs.length ? (
              <p className="note">하위 폴더가 없습니다. 이 폴더를 고르려면 「이 폴더 선택」을 누르세요.</p>
            ) : (
              <div style={{ display: "grid", gap: 2, maxHeight: 340, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 4 }}>
                {result.dirs.map((d) => (
                  <button key={d} type="button" onClick={() => go(join(result.path, d, result.sep))}
                    style={{ textAlign: "left", font: "inherit", fontSize: 13, padding: "7px 10px", border: 0, borderRadius: 6, background: "none", color: "var(--ink)", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                    📁 {d}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

// 견적·판매원장 시트 아래: 어느 파일에서 왔는지, 손으로 고친 칸
const KIND: Record<SourceFile["kind"], string> = { quote: "견적", po: "발주서", ledger: "판매원장" };
const COL: Record<string, string> = {
  stage: "단계", date: "날짜", client: "거래처", end_client: "최종 고객", name: "사업명·건명", no: "견적번호", ver: "버전", amt: "견적금액",
  memo: "비고", owner: "담당", deal_id: "연결 견적", file: "파일명", sale: "판매가", cost: "원가", tax_type: "과세 구분",
};
export function SourceInfo({ r }: { r: { source?: string; sourceFiles?: SourceFile[] | null; locked?: string[] } }) {
  if (r.source !== "sync") return null;
  return (
    <div className="audit" style={{ display: "grid", gap: 4 }}>
      <span>영업 폴더 자동 동기화로 들어온 건{r.locked?.length ? ` · 손으로 고친 칸(동기화가 덮어쓰지 않음): ${r.locked.map((k) => COL[k] || k).join(", ")}` : ""}</span>
      {!!r.sourceFiles?.length && (
        <details><summary style={{ cursor: "pointer" }}>근거 파일 {r.sourceFiles.length}개</summary>
          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
            {r.sourceFiles.map((f, i) => <li key={i} style={{ wordBreak: "break-all" }}>{KIND[f.kind] ?? f.kind} {f.date ?? ""} — {f.file}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
