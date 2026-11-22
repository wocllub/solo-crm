// 데스크톱 앱용 화면 빌드 — .env.local 의 Supabase 주소·키를 넣지 않는다
// (데스크톱 앱은 처음 실행할 때 입력한 값을 쓰므로, 설치 파일에 회사 값이 들어가면 안 됨)
// Vite 는 이미 있는 환경변수를 .env 파일보다 먼저 쓰므로 빈 값으로 덮는다
import { execSync } from "node:child_process";

const env = { ...process.env, VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" };
execSync("npx tsc -b && npx vite build", { stdio: "inherit", env });
