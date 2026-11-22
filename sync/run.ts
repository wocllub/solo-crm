// 실제 동기화 (명령줄)
//   npm run sync            → 한 번 읽고 CRM에 반영
//   npm run sync:watch      → 계속 켜 두고, 영업 폴더가 바뀌면 30초 뒤 다시 반영 (+ 30분마다 한 번 더)
// 읽을 영업 폴더·기준일·켜기/끄기는 CRM 「자동 동기화 → 동기화 PC·폴더 설정」에서 정한다 (1분마다 확인)
// 데스크톱 앱(Solo-CRM.exe)을 쓰면 이 명령은 필요 없다 — 앱이 같은 일을 한다
import fs from "node:fs";
import path from "node:path";
import { connect } from "./push.ts";
import { createSyncService, type Conn } from "./service.ts";

const watch = process.argv.includes("--watch");
const logFile = path.join(import.meta.dirname, "out", "sync.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = (s: string) => {
  const line = `[${new Date().toLocaleString("ko-KR")}] ${s}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + "\n"); } catch { /* 로그 실패는 무시 */ }
};

// 감시 모드는 한 PC에 하나만 (자동 시작 + 수동 실행이 겹치지 않게). sync/out/sync.pid 에 실행 중인 번호를 적어 둔다
const pidFile = path.join(import.meta.dirname, "out", "sync.pid");
if (watch) {
  try {
    const old = Number(fs.readFileSync(pidFile, "utf8"));
    if (old && old !== process.pid) { process.kill(old, 0); log(`이미 감시 중입니다 (프로세스 ${old}). 이번 실행은 끝냅니다.`); process.exit(0); }
  } catch { /* 파일이 없거나 이전 프로세스가 이미 끝남 */ }
  fs.writeFileSync(pidFile, String(process.pid));
  const cleanup = () => { try { if (fs.readFileSync(pidFile, "utf8") === String(process.pid)) fs.unlinkSync(pidFile); } catch { /* */ } };
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

let conn: Conn | null = null;
const service = createSyncService({ connect: async () => (conn = await connect()), log }, { watch });

if (watch) {
  await service.start();
  log("자동 동기화 켜짐 — 끄기: npm run sync:stop");
} else {
  await service.once();
  const c = conn as Conn | null; // once() 안에서 채워짐
  if (c) await c.sb.auth.signOut();
}
