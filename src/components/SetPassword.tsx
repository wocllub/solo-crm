// 새 비밀번호 정하기 — 비밀번호 재설정 메일의 링크로 들어왔을 때, 또는 헤더의 「비밀번호 변경」
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function SetPassword({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (pw.length < 6) { setMsg("비밀번호는 6자 이상이어야 합니다."); return; }
    if (pw !== pw2) { setMsg("두 비밀번호가 다릅니다."); return; }
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg("비밀번호를 바꾸지 못했습니다: " + error.message); return; }
    onDone();
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="sub">Solo-CRM · HANUL AI Inc.</div>
        <h1>새 비밀번호 정하기</h1>
        <p className="hint" style={{ margin: 0 }}>
          자동 동기화를 이 계정으로 쓰신다면, 여기서 정한 비밀번호를 <code>.env.local</code> 의 <code>SYNC_PASSWORD="…"</code> 따옴표 안에도 똑같이 넣어 주세요.
        </p>
        <div className="field">
          <label htmlFor="np1">새 비밀번호</label>
          <input id="np1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="np2">새 비밀번호 확인</label>
          <input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />
        </div>
        <div className="form-err">{msg}</div>
        <button type="submit" className="btn primary" disabled={busy}>비밀번호 바꾸기</button>
        {onCancel && <button type="button" className="linkbtn" onClick={onCancel}>취소</button>}
      </form>
    </div>
  );
}
