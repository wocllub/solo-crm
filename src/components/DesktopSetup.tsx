// 데스크톱 앱 처음 실행: 회사 Supabase 주소·공개 키 입력 (또는 데모로 둘러보기)
import { useState, type FormEvent } from "react";
import { desktop } from "../lib/desktop";

export function DesktopSetup({ onDemo }: { onDemo: () => void }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!desktop) return;
    setBusy(true);
    setMsg("");
    try {
      await desktop.saveConfig({ supabaseUrl: url, supabaseKey: key }); // 저장되면 앱이 화면을 다시 연다
    } catch (err) {
      setMsg(String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="sub">Solo-CRM · HANUL AI Inc.</div>
        <h1>처음 설정</h1>
        <p className="hint" style={{ margin: 0 }}>
          회사에서 쓰는 Supabase 프로젝트를 연결합니다. 관리자에게 받은 값을 넣거나, Supabase 대시보드 →
          Project Settings → API 에서 복사하세요.
        </p>
        <div className="field">
          <label htmlFor="s-url">Supabase 주소 (Project URL)</label>
          <input id="s-url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://xxxx.supabase.co" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="s-key">공개 키 (anon / publishable)</label>
          <input id="s-key" value={key} onChange={(e) => setKey(e.target.value)} required spellCheck={false} autoComplete="off" />
        </div>
        <p className="hint" style={{ margin: 0 }}>secret·service_role 키는 넣지 마세요. 값은 이 PC에만 저장됩니다.</p>
        <div className="form-err">{msg}</div>
        <button type="submit" className="btn primary" disabled={busy}>연결하기</button>
        <button type="button" className="linkbtn" onClick={onDemo}>설정 없이 데모로 둘러보기</button>
      </form>
    </div>
  );
}
