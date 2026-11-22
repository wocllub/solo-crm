// 공용 UI: 시트(모달), 금액 입력, 삭제 2단 확인, 월 칩, 월 범례, 월 태그
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MCOL, mOf, toNum, won } from "../lib/format";

export function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const f = ref.current?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled])");
      if (f && matchMedia("(min-width:721px)").matches) f.focus();
    }, 30);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t" ref={ref}>
        <div className="sheet-head">
          <h3 id="sheet-t">{title}</h3>
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        {children}
        <div className="sheet-foot">{foot}</div>
      </div>
    </div>
  );
}

// 천 단위 쉼표가 붙는 금액 입력 (원본 bindAmt)
export function AmountInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value ? won(value) : "");
  useEffect(() => { if (toNum(text) !== value) setText(value ? won(value) : ""); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input {...rest} className={"amt " + (rest.className || "")} inputMode="numeric" autoComplete="off" value={text}
      onChange={(e) => { const n = toNum(e.target.value); setText(n ? won(n) : ""); onChange(n); }} />
  );
}

export function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={"btn danger" + (armed ? " armed" : "")} disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? "한 번 더 누르면 삭제" : "삭제"}
    </button>
  );
}

export function MonthTag({ date }: { date: string | null | undefined }) {
  const m = mOf(date);
  return m ? <span className="mtag" style={{ "--mbar": MCOL[m - 1][1] } as React.CSSProperties}>{m}월</span> : null;
}

export function MonthChips({ list, cur, onPick }: { list: { date: string | null }[]; cur: number; onPick: (m: number) => void }) {
  const ms = [...new Set(list.map((x) => mOf(x.date)).filter(Boolean))].sort((a, b) => a - b);
  return (
    <>
      <span className="lb">월</span>
      <button type="button" aria-pressed={cur === 0} onClick={() => onPick(0)}>전체 {list.length}</button>
      {ms.map((m) => (
        <button key={m} type="button" aria-pressed={cur === m} style={{ "--mbar": MCOL[m - 1][1] } as React.CSSProperties} onClick={() => onPick(m)}>
          <i></i>{m}월 {list.filter((x) => mOf(x.date) === m).length}
        </button>
      ))}
    </>
  );
}

export function MonthLegend({ list }: { list: { date: string | null }[] }) {
  const ms = [...new Set(list.map((x) => mOf(x.date)).filter(Boolean))].sort((a, b) => a - b);
  if (!ms.length) return null;
  return (
    <div className="mlegend">
      월 구분{" "}
      {ms.map((m) => (
        <span key={m} className="mk" style={{ "--mbg": MCOL[m - 1][0], "--mbar": MCOL[m - 1][1] } as React.CSSProperties}>
          <i></i>{m}월 {list.filter((x) => mOf(x.date) === m).length}건
        </span>
      ))}
    </div>
  );
}

export const NewBadge = ({ show }: { show: boolean }) => (show ? <span className="new">NEW</span> : null);
