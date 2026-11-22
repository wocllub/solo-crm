// 영업 폴더 전체를 읽어 CRM 계획(견적·판매원장·확인 필요)을 만든다. 저장은 하지 않는다.
// 감시 모드에서는 cache 를 넘겨 바뀐 파일만 다시 읽는다 (파일 수정 시각 기준).
import fs from "node:fs";
import path from "node:path";
import { config, isOurs } from "./config.ts";
import { parseFile, parsePdfQuote, type Doc, type LedgerDoc, type PoDoc, type QuoteDoc } from "./parse.ts";
import { plan, type Issue } from "./group.ts";

export type ParseCache = Map<string, { mtime: number; doc: Doc }>;

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (config.skipName.some((re) => re.test(e.name))) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

async function cached(cache: ParseCache | undefined, file: string, read: () => Promise<Doc>) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cache?.get(file);
  if (hit && hit.mtime === mtime) return hit.doc;
  const doc = await read();
  cache?.set(file, { mtime, doc });
  return doc;
}

export async function scan(opts: { cache?: ParseCache; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const started = Date.now();
  if (!fs.existsSync(config.root)) throw new Error("영업 폴더를 찾을 수 없습니다: " + config.root);

  // 거래처·고객사 같은 최상위 폴더가 하나도 없으면(다른 회사의 폴더 구성) 영업 폴더 전체를 본다
  const tops = config.includeTop.filter((t) => fs.existsSync(path.join(config.root, t)));
  const files = tops.length ? tops.flatMap((t) => walk(path.join(config.root, t))) : walk(config.root);
  const sinceMs = Date.parse(config.since) - 45 * 864e5; // 파일 수정일로 1차 거르기 (여유 45일)
  const fresh = (f: string) => fs.statSync(f).mtimeMs >= sinceMs;
  const targets = files.filter((f) => {
    const n = path.basename(f), ext = path.extname(n).toLowerCase();
    if (!fresh(f)) return false;
    if (/발주/.test(n)) return true;
    return ext === ".xlsx" || ext === ".xlsm";
  });
  const pdfQuotes = files.filter((f) => /\.pdf$/i.test(f) && /견적/.test(path.basename(f)) && isOurs(path.basename(f)) && /From/i.test(path.basename(f)) && fresh(f));
  log(`전체 ${files.length}개 중 검사 대상 ${targets.length}개 (기준일 ${config.since})`);

  const docs: Doc[] = [];
  let i = 0;
  for (const f of targets) {
    docs.push(await cached(opts.cache, f, () => parseFile(f)));
    if (++i % 50 === 0) log(`  ${i}/${targets.length} 읽음`);
  }

  const inRange = (d: string | null) => !d || d >= config.since;
  const quotes: QuoteDoc[] = docs.filter((d): d is QuoteDoc => d.kind === "quote" && inRange(d.date));
  const ledgers = docs.filter((d): d is LedgerDoc => d.kind === "ledger" && inRange(d.date));
  const pos = docs.filter((d): d is PoDoc => d.kind === "po" && inRange(d.date));
  const skipped = docs.filter((d) => d.kind === "vendor-quote" || d.kind === "unreadable");
  const oldOnes = docs.filter((d) => (d.kind === "quote" || d.kind === "ledger" || d.kind === "po") && !inRange(d.date)).length;

  // 엑셀 없이 PDF만 있는 당사 견적 — 같은 폴더에 같은 이름(날짜·버전 제외)의 엑셀이 있으면 이미 반영된 것.
  // 없으면 PDF 글자를 읽어 견적으로 넣는다
  const stem = (f: string) => path.basename(f).replace(/\.[^.]+$/, "").replace(/\(?\d{4}-\d{2}-\d{2}\)?|ver\.?\s*\d+|final|최종|From.*$|To\s*/gi, "").replace(/[\s_()㈜]|\(주\)/g, "");
  const xlsxExact = new Set(quotes.map((q) => q.file.replace(/\.xlsx?m?$/i, "").toLowerCase()));
  const pdfIssues: Issue[] = [];
  let pdfRead = 0;
  for (const p of pdfQuotes) {
    if (xlsxExact.has(p.replace(/\.pdf$/i, "").toLowerCase())) continue; // 같은 이름 엑셀 → 엑셀이 원본
    const twin = quotes.some((q) => !q.fromPdf && path.dirname(q.file) === path.dirname(p) && (stem(q.file).includes(stem(p)) || stem(p).includes(stem(q.file))));
    const d = await cached(opts.cache, p, () => parsePdfQuote(p));
    if (d.kind !== "quote") {
      if (!twin && "reason" in d) pdfIssues.push({ file: path.relative(config.root, p), title: "PDF 견적서를 읽지 못함", detail: d.reason });
      continue;
    }
    if (!inRange(d.date)) continue;
    // 엑셀 쌍둥이와 내용이 같으면 건너뜀. PDF가 더 새 버전이면 넣어 묶음에서 최신으로 쓰이게 한다
    if (twin && quotes.some((q) => path.dirname(q.file) === path.dirname(p) && q.no === d.no && q.date === d.date && q.amt === d.amt)) continue;
    quotes.push(d); pdfRead++;
  }

  const result = plan(quotes, ledgers, pos);
  result.issues.push(...pdfIssues);
  log(`PDF만 있는 견적 ${pdfRead}개를 PDF에서 읽음`);

  // 캐시에서 지워진 파일 정리
  if (opts.cache) { const live = new Set(files); for (const k of opts.cache.keys()) if (!live.has(k)) opts.cache.delete(k); }

  const summary = {
    root: config.root, since: config.since, generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
    files: files.length, scanned: targets.length, quotes: quotes.length, ledgers: ledgers.length, pos: pos.length,
    skipped: skipped.length, old: oldOnes,
  };
  return { summary, result, skipped };
}
