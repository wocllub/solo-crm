// 원본의 숫자·날짜·월 색 도우미
import type { CSSProperties } from "react";

export const won = (n: number | null | undefined) => Math.round(n || 0).toLocaleString("ko-KR");

export const eok = (n: number) => {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "억";
  return (n / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "만";
};

export const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");

export const toNum = (s: unknown) => Number(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayStr = () => ymd(new Date());

export const isNew = (r: { createdAt?: string | null }) =>
  !!r.createdAt && Date.now() - Date.parse(r.createdAt) < 7 * 864e5;

export const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// 월별 색 (1~12월): [옅은 배경, 진한 띠]
export const MCOL: [string, string][] = [
  ["#f2f4fb", "#6375c9"], ["#f5f2fa", "#8a6cc0"], ["#fbf1f5", "#c25b85"], ["#eef7f3", "#3f9a78"],
  ["#fbf5ea", "#c8962e"], ["#eef6f8", "#3b8fa6"], ["#f8f6e8", "#a8952c"], ["#fbf0f0", "#c75c5c"],
  ["#eef4fa", "#4a85c0"], ["#eef6f0", "#4f9a5d"], ["#f3f1fa", "#7461b8"], ["#fbf2ec", "#c87642"],
];

export const mOf = (d: string | null | undefined) => {
  const m = +String(d || "").slice(5, 7);
  return m >= 1 && m <= 12 ? m : 0;
};

export const mStyle = (d: string | null | undefined): CSSProperties => {
  const m = mOf(d);
  return m ? ({ "--mbg": MCOL[m - 1][0], "--mbar": MCOL[m - 1][1] } as CSSProperties) : {};
};

// 달력 선택 가능 범위: 오늘 기준 전후 6개월
export const calRange = () => {
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth() - 6, t.getDate());
  const b = new Date(t.getFullYear(), t.getMonth() + 6, t.getDate());
  return { min: ymd(a), max: ymd(b), minYM: a.getFullYear() * 12 + a.getMonth(), maxYM: b.getFullYear() * 12 + b.getMonth() };
};

// 비교용 정규화 (판매원장 검색)
export const norm = (t: unknown) => String(t || "").toLowerCase().replace(/[()㈜]|주식회사|\(주\)/g, "");
