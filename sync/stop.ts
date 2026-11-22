// 자동 동기화 끄기 (Windows·리눅스 공통) — npm run sync:stop
// 다음 PC 시작 때 다시 켜진다. 아예 끄려면 CRM 「동기화 PC·폴더 설정」에서 「동기화 끄기」 또는 자동 시작 해제
import fs from "node:fs";
import path from "node:path";

const pidFile = path.join(import.meta.dirname, "out", "sync.pid");
let pid = 0;
try { pid = Number(fs.readFileSync(pidFile, "utf8")); } catch { /* 없음 */ }
if (!pid) {
  console.log("자동 동기화가 실행 중이 아닙니다.");
} else {
  try {
    process.kill(pid);
    console.log(`자동 동기화를 껐습니다 (프로세스 ${pid}).`);
  } catch {
    console.log("자동 동기화가 실행 중이 아닙니다.");
  }
  try { fs.unlinkSync(pidFile); } catch { /* */ }
}
