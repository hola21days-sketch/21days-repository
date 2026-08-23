// Motor de calculo. Reproduce las reglas del Excel, corregidas.
//
// Regla importante sobre redondeo: el IVA se calcula sobre el TOTAL del mes
// (suma de importes con IVA x 21/121), no sumando el IVA de cada linea
// redondeado. Es lo que hace el Excel y es lo que evita derivas de centimos.

import { VAT_RATE, r2, quarterOf, num } from "./money";

export type MovementLike = {
  kind: string;
  year: number;
  month: number;
  grossAmount: unknown;
  settledAmount?: unknown;
  irpfAmount: unknown;
  vatRate: unknown;
  vatDeductible: boolean;
  isForecast: boolean;
  status: string;
  clientId?: string | null;
  costConceptId?: string | null;
};

export type MonthTotals = {
  month: number;
  income: number;
  costs: number;
  grossProfit: number;
  vatOutput: number;
  vatInput: number;
  vatNet: number;
  irpf: number;
  vatSettlement: number;
  irpfSettlement: number;
  netProfit: number;
  collected: number;
  outstanding: number;
  isForecast: boolean;
};

export type YearSummary = {
  year: number;
  months: MonthTotals[];
  totals: Omit<MonthTotals, "month" | "isForecast">;
  quarters: {
    quarter: number;
    vatOutput: number;
    vatInput: number;
    vatNet: number;
    irpf: number;
    /** mes en que se paga */
    paidInMonth: number;
    paidInYear: number;
  }[];
};

const isIncome = (m: MovementLike) => m.kind === "INCOME";

/** Las liquidaciones se pagan en ene/abr/jul/oct del trimestre siguiente. */
export function settlementSlot(year: number, quarter: number) {
  return quarter === 4
    ? { year: year + 1, month: 1 }
    : { year, month: quarter * 3 + 1 };
}

export type PriorSettlement = {
  year: number;
  quarter: number;
  kind: string;
  amount: number;
};

export function summarizeYear(
  year: number,
  movements: MovementLike[],
  opts: { priorSettlements?: PriorSettlement[] } = {},
): YearSummary {
  const rows = movements.filter((m) => m.year === year);

  const months: MonthTotals[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0, costs: 0, grossProfit: 0,
    vatOutput: 0, vatInput: 0, vatNet: 0, irpf: 0,
    vatSettlement: 0, irpfSettlement: 0, netProfit: 0,
    collected: 0, outstanding: 0,
    isForecast: false,
  }));

  // acumuladores sin redondear, para aplicar 21/121 sobre el total del mes
  const vatBearingIncome = Array(13).fill(0);
  const vatDeductibleCosts = Array(13).fill(0);
  const forecastFlags = Array(13).fill(0);
  const realFlags = Array(13).fill(0);

  for (const m of rows) {
    const t = months[m.month - 1];
    const gross = num(m.grossAmount);
    const settled = m.settledAmount === null || m.settledAmount === undefined ? 0 : num(m.settledAmount);

    if (isIncome(m)) {
      t.income += gross;
      t.collected += settled;
      if (m.status !== "NA") t.outstanding += Math.max(0, gross - settled);
      if (num(m.vatRate) > 0) vatBearingIncome[m.month] += gross;
    } else {
      t.costs += gross;
      t.irpf += num(m.irpfAmount);
      if (m.vatDeductible && num(m.vatRate) > 0) vatDeductibleCosts[m.month] += gross;
    }
    if (m.isForecast) forecastFlags[m.month]++;
    else realFlags[m.month]++;
  }

  for (const t of months) {
    t.vatOutput = (vatBearingIncome[t.month] * VAT_RATE) / (1 + VAT_RATE);
    t.vatInput = (vatDeductibleCosts[t.month] * VAT_RATE) / (1 + VAT_RATE);
    t.vatNet = t.vatOutput - t.vatInput;
    t.grossProfit = t.income - t.costs;
    t.isForecast = forecastFlags[t.month] > 0 && realFlags[t.month] === 0;
  }

  // trimestres
  const quarters = [1, 2, 3, 4].map((q) => {
    const qm = months.filter((t) => quarterOf(t.month) === q);
    const slot = settlementSlot(year, q);
    return {
      quarter: q,
      vatOutput: qm.reduce((s, t) => s + t.vatOutput, 0),
      vatInput: qm.reduce((s, t) => s + t.vatInput, 0),
      vatNet: qm.reduce((s, t) => s + t.vatNet, 0),
      irpf: qm.reduce((s, t) => s + t.irpf, 0),
      paidInMonth: slot.month,
      paidInYear: slot.year,
    };
  });

  // liquidaciones que caen dentro de este año
  for (const q of quarters) {
    if (q.paidInYear !== year) continue;
    months[q.paidInMonth - 1].vatSettlement += q.vatNet;
    months[q.paidInMonth - 1].irpfSettlement += q.irpf;
  }
  // trimestres de años anteriores que se pagan en enero de este
  for (const p of opts.priorSettlements ?? []) {
    const slot = settlementSlot(p.year, p.quarter);
    if (slot.year !== year) continue;
    const t = months[slot.month - 1];
    if (p.kind === "VAT_303") t.vatSettlement += p.amount;
    else t.irpfSettlement += p.amount;
  }

  for (const t of months) {
    t.netProfit = t.grossProfit - t.vatSettlement - t.irpfSettlement;
  }

  const sum = (k: keyof MonthTotals) =>
    months.reduce((s, t) => s + (t[k] as number), 0);

  return {
    year,
    months,
    quarters,
    totals: {
      income: sum("income"), costs: sum("costs"), grossProfit: sum("grossProfit"),
      vatOutput: sum("vatOutput"), vatInput: sum("vatInput"), vatNet: sum("vatNet"),
      irpf: sum("irpf"), vatSettlement: sum("vatSettlement"),
      irpfSettlement: sum("irpfSettlement"), netProfit: sum("netProfit"),
      collected: sum("collected"), outstanding: sum("outstanding"),
    },
  };
}

/** Caja estimada mes a mes a partir de un saldo inicial. */
export function cashFlow(
  summary: YearSummary,
  opts: { startMonth: number; startAmount: number },
) {
  const out: { month: number; opening: number; net: number; closing: number }[] = [];
  let balance = opts.startAmount;
  for (let m = opts.startMonth; m <= 12; m++) {
    const t = summary.months[m - 1];
    const opening = balance;
    balance = r2(opening + t.netProfit);
    out.push({ month: m, opening, net: t.netProfit, closing: balance });
  }
  return out;
}
