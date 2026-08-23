import ExcelJS from "exceljs";
import path from "node:path";

export const EXCEL_PATH = path.join(process.cwd(), "data", "CONTABILITAT_CORRECTE.xlsx");

export const SHEET_ANNUAL = "CONTABILITAT ANUAL 2026";
export const SHEET_FORECAST = "PREVISIONS DE CAIXA 2026";
export const SHEET_PAYMENTS = "PAGAMENTS DELS CLIENTS";

export async function openWorkbook(file = EXCEL_PATH) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Valor "plano" de una celda: resuelve formulas y descarta objetos raros. */
export function cellValue(ws: ExcelJS.Worksheet, row: number, col: number): unknown {
  const v = ws.getCell(row, col).value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result ?? null;
    if ("richText" in o) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    }
    if ("text" in o) return o.text;
    return null;
  }
  return v;
}

/** Numero de la celda, o 0 si es texto/vacio. */
export function cellNum(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const v = cellValue(ws, row, col);
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Texto de la celda ya recortado, o "" */
export function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = cellValue(ws, row, col);
  if (v === null) return "";
  return String(v).trim();
}

/** Color de relleno de la celda en formato ARGB, o null. */
export function cellFill(ws: ExcelJS.Worksheet, row: number, col: number): string | null {
  const fill = ws.getCell(row, col).fill;
  if (!fill || fill.type !== "pattern") return null;
  const fg = (fill as ExcelJS.FillPattern).fgColor;
  return fg?.argb ?? null;
}
