// 엑셀 읽기 도우미 — 칸 주소 대신 「이름표」를 찾아 그 오른쪽 값을 읽는다 (시트마다 열이 한두 칸씩 다르기 때문)
import ExcelJS from "exceljs";

export type Val = string | number | Date | null;

export interface Grid {
  sheet: string;
  rows: Val[][]; // rows[r][c], 0부터
}

function plain(v: ExcelJS.CellValue): Val {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("result" in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return String(v);
}

export async function readBook(file: string, maxRows = 80): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.filter((ws) => ws.state === "visible").map((ws) => {
    const rows: Val[][] = [];
    const last = Math.min(ws.rowCount, maxRows);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const out: Val[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
        const cell = row.getCell(c);
        // 병합 칸은 첫 칸에만 값을 둔다 (나머지 칸이 같은 값을 반복하지 않게)
        out.push(cell.isMerged && cell.master !== cell ? null : plain(cell.value));
      }
      rows.push(out);
    }
    return { sheet: ws.name, rows };
  });
}

export const squash = (v: Val) => String(v ?? "").replace(/\s+/g, "");
export const text = (v: Val) => String(v ?? "").replace(/^[\s:：]+/, "").replace(/\s+/g, " ").trim();

// 이름표(공백 무시) 칸을 찾아 같은 줄 오른쪽 첫 값
export function right(g: Grid, label: RegExp): Val {
  for (const row of g.rows) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] != null && label.test(squash(row[c]))) {
        for (let k = c + 1; k < row.length; k++) if (row[k] != null && text(row[k]) !== "") return row[k];
      }
    }
  }
  return null;
}

// 이름표 칸 안에 「이름표 : 값」 형태로 함께 들어 있는 경우
export function inline(g: Grid, label: RegExp): string | null {
  for (const row of g.rows) for (const v of row) {
    if (typeof v !== "string") continue;
    const m = v.match(label);
    if (m) return (m[1] ?? "").trim() || null;
  }
  return null;
}

export function has(g: Grid, re: RegExp) {
  return g.rows.some((row) => row.some((v) => v != null && re.test(squash(v))));
}

export function toNumber(v: Val): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^0-9.-]/g, "");
  return s ? Math.round(Number(s)) : null;
}

export function toDate(v: Val): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 60000) {
    // 엑셀 날짜 일련번호
    return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  }
  const m = String(v).match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}
