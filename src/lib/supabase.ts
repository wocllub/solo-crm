import { createClient } from "@supabase/supabase-js";
import { desktop } from "./desktop";

// 웹: 빌드할 때 넣은 값(.env.local / 호스팅 환경변수)
// 데스크톱 앱: 처음 실행할 때 입력한 값 (앱 설정 파일)
const url = (desktop ? desktop.config.supabaseUrl : import.meta.env.VITE_SUPABASE_URL) as string | undefined;
const anonKey = (desktop ? desktop.config.supabaseKey : import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const isDesktop = Boolean(desktop);

// 설정이 없으면 null — 웹은 데모 모드, 데스크톱 앱은 처음 설정 화면
export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

// 데스크톱 앱: 로그인 토큰이 바뀔 때마다 앱(트레이 동기화)에 알려 준다
if (desktop && supabase) {
  const d = desktop;
  const sb = supabase;
  sb.auth.onAuthStateChange((_ev, s) => d.setAuth(s ? { token: s.access_token, uid: s.user.id } : null));
  // 트레이에 숨겨진 동안에는 자동 갱신이 멈추므로, 앱이 부탁하면 바로 새 토큰을 받는다
  d.onRefreshRequest?.(() => {
    sb.auth.refreshSession().then(({ data }) => { if (data.session) d.setAuth({ token: data.session.access_token, uid: data.session.user.id }); });
  });
}
