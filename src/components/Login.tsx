// 이메일 + 비밀번호 로그인 / 가입 (Supabase Auth)
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg("로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { name } } });
      if (error) setMsg(error.message.includes("Password") ? "비밀번호는 6자 이상이어야 합니다." : "가입하지 못했습니다: " + error.message);
      else if (!data.session) setMsg("확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.");
    }
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="sub">Solo-CRM · HANUL AI Inc.</div>
        <h1>{mode === "in" ? "로그인" : "직원 가입"}</h1>
        {mode === "up" && (
          <div className="field">
            <label htmlFor="l-name">이름</label>
            <input id="l-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="l-email">회사 이메일</label>
          <input id="l-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="l-pw">비밀번호</label>
          <input id="l-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        <div className="form-err">{msg}</div>
        <button type="submit" className="btn primary" disabled={busy}>{mode === "in" ? "로그인" : "가입하기"}</button>
        <button type="button" className="linkbtn" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }}>
          {mode === "in" ? "처음이신가요? 직원 가입" : "이미 계정이 있습니다 · 로그인"}
        </button>
      </form>
    </div>
  );
}
