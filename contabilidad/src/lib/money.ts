// Todo el dinero se maneja en numeros con 2 decimales redondeados
// "half away from zero", que es lo que hace Excel.

export const VAT_RATE = 0.21;

/** Redondeo a 2 decimales igual que Excel (half away from zero). */
export function r2(n: number): number {
  const s = n < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(n) * 100 + Number.EPSILON * 100)) / 100;
}

/** Redondeo a n decimales. */
export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  const s = n < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(n) * f + Number.EPSILON * f)) / f;
}

/** Base imponible a partir del importe con IVA. */
export function baseFromGross(gross: number, rate = VAT_RATE): number {
  return gross / (1 + rate);
}

/** Cuota de IVA contenida en un importe con IVA. */
export function vatFromGross(gross: number, rate = VAT_RATE): number {
  return (gross * rate) / (1 + rate);
}

/** Suma tolerante a nulos y a Prisma.Decimal. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
}

const EUR = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12345.6 -> "12.345,60 €" */
export function formatEur(v: unknown): string {
  return `${EUR.format(num(v))} €`;
}

/** Sin simbolo, para tablas densas. */
export function formatNum(v: unknown): string {
  return EUR.format(num(v));
}

/** Vacio en vez de "0,00" para matrices con muchos huecos. */
export function formatNumOrDash(v: unknown, dash = "—"): string {
  const n = num(v);
  return n === 0 ? dash : EUR.format(n);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** El trimestre N se paga el dia 20 del mes siguiente al cierre. */
export function settlementDueDate(year: number, quarter: number): Date {
  // Q1->abr, Q2->jul, Q3->oct, Q4->ene del año siguiente
  const map = [
    { y: year, m: 3 },       // Q1 -> abril (indice 3)
    { y: year, m: 6 },       // Q2 -> julio
    { y: year, m: 9 },       // Q3 -> octubre
    { y: year + 1, m: 0 },   // Q4 -> enero
  ];
  const { y, m } = map[quarter - 1];
  return new Date(Date.UTC(y, m, 20));
}
