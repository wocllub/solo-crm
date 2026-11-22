// 시험 실행: 영업 폴더를 읽어 「CRM에 이렇게 넣겠다」는 보고서만 만든다. 어디에도 저장하지 않는다.
//   npm run sync:dry-run   → sync/out/dry-run.html, sync/out/dry-run.json
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { scan } from "./scan.ts";
import { renderReport } from "./report.ts";
import { compare } from "./compare.ts";

console.log(`영업 폴더: ${config.root}`);
const { summary, result, skipped } = await scan({ log: console.log });

const outDir = path.join(import.meta.dirname, "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "dry-run.json"), JSON.stringify({ summary, ...result, skipped }, null, 2));
const cmp = compare(path.join(outDir, "artifact"), result.deals, result.ledger);
fs.writeFileSync(path.join(outDir, "dry-run.html"), renderReport(summary, result, skipped, cmp));
if (cmp) console.log(`지금 CRM과 비교: 견적 일치 ${cmp.deals.both.length} · CRM에만 ${cmp.deals.manualOnly.length} · 자동에만 ${cmp.deals.autoOnly.length} / 판매원장 일치 ${cmp.ledger.both.length} · CRM에만 ${cmp.ledger.manualOnly.length} · 자동에만 ${cmp.ledger.autoOnly.length}`);

const by = (s: string) => result.deals.filter((d) => d.stage === s).length;
console.log(`\n견적 파일 ${summary.quotes}개 → CRM 견적 ${result.deals.length}건 (견적제출 ${by("quote")}, 수정견적 ${by("nego")}, 발주 ${by("po")}, 판매원장 ${by("won")})`);
console.log(`판매원장 ${result.ledger.length}건 (견적 연결 ${result.ledger.filter((l) => l.dealKey).length}건)`);
console.log(`확인 필요 ${result.issues.filter((x) => !x.auto).length}건 (자동 처리 ${result.issues.filter((x) => x.auto).length}건) · 제외 ${skipped.length}개 · 기준일 이전 ${summary.old}개`);
console.log(`보고서: ${path.join(outDir, "dry-run.html")}  (${summary.seconds}초)`);
