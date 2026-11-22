// 대시보드 자유 배치 — 상자마다 12칸 격자 위의 위치(x, y)와 크기(w, h)
// 예전 형식(순서 order + 너비 span)으로 저장된 배치는 cleanLay 가 새 형식으로 옮긴다
import type { GridItem, Layout, WidgetId } from "./types";

export const WNAME: Record<WidgetId, string> = {
  rate: "마진 목표 달성률", margin: "확정 마진", left: "잔여 목표 마진", pipe: "확도 반영 예상 매출",
  target: "목표 달성률 차트", contrib: "건별 마진 기여", funnel: "영업 펀넬", notes: "집계 기준",
};
export const WIDS = Object.keys(WNAME) as WidgetId[];

// 격자: 12칸, 한 행 30px, 상자 사이 16px
export const GRID = { cols: 12, rowHeight: 30, margin: [16, 16] as [number, number] };

// 상자별 기본 높이(행 수)와 최소 크기
export const DEF_H: Record<WidgetId, number> = { rate: 4, margin: 4, left: 4, pipe: 4, target: 11, contrib: 11, funnel: 13, notes: 5 };
export const MIN: Record<WidgetId, { w: number; h: number }> = {
  rate: { w: 2, h: 3 }, margin: { w: 2, h: 3 }, left: { w: 2, h: 3 }, pipe: { w: 2, h: 3 },
  target: { w: 4, h: 7 }, contrib: { w: 3, h: 5 }, funnel: { w: 5, h: 8 }, notes: { w: 3, h: 3 },
};

// 너비를 주면 왼쪽 위부터 줄을 채워 배치
function flow(order: WidgetId[], width: Record<WidgetId, number>): GridItem[] {
  const out: GridItem[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const i of order) {
    const w = Math.max(MIN[i].w, Math.min(12, width[i] || 12));
    if (x + w > 12) { y += rowH; x = 0; rowH = 0; }
    const h = DEF_H[i];
    out.push({ i, x, y, w, h });
    x += w; rowH = Math.max(rowH, h);
  }
  return out;
}

export const LAY0: Layout = {
  v: 2,
  items: flow([...WIDS], { rate: 3, margin: 3, left: 3, pipe: 3, target: 7, contrib: 5, funnel: 12, notes: 12 }),
  hidden: [],
};
export const LS_KEY = "solo-crm-layout";

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function cleanLay(x: unknown): Layout | null {
  const v = x as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const hidden = Array.isArray(v.hidden) ? (v.hidden as string[]).filter((id): id is WidgetId => WIDS.includes(id as WidgetId)) : [];

  // 새 형식
  if (Array.isArray(v.items)) {
    const seen = new Set<WidgetId>();
    const items: GridItem[] = [];
    for (const it of v.items as Record<string, unknown>[]) {
      const i = it?.i as WidgetId;
      if (!WIDS.includes(i) || seen.has(i)) continue;
      seen.add(i);
      const w = num(it.w, MIN[i].w, 12, 12);
      items.push({ i, w, x: num(it.x, 0, 12 - w, 0), y: num(it.y, 0, 999, 0), h: num(it.h, MIN[i].h, 60, DEF_H[i]) });
    }
    // 빠진 상자는 맨 아래에
    const bottom = items.reduce((a, it) => Math.max(a, it.y + it.h), 0);
    WIDS.filter((i) => !seen.has(i)).forEach((i, k) => items.push({ i, x: 0, y: bottom + k * 20, w: 12, h: DEF_H[i] }));
    return { v: 2, items, hidden };
  }

  // 예전 형식 { order, span, hidden } → 같은 순서·너비로 격자에 배치
  if (Array.isArray(v.order)) {
    const order = (v.order as string[]).filter((id): id is WidgetId => WIDS.includes(id as WidgetId));
    WIDS.forEach((id) => { if (!order.includes(id)) order.push(id); });
    const span = (v.span || {}) as Record<WidgetId, number>;
    return { v: 2, items: flow(order, span), hidden };
  }
  return null;
}
