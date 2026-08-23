/**
 * Importa CONTABILITAT_CORRECTE.xlsx a la base de datos.
 *
 * Es idempotente: cada movimiento lleva un `importKey` derivado de su origen
 * en la hoja, asi que reimportar actualiza en vez de duplicar.
 *
 *   npm run import
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  openWorkbook, cellNum, cellText, cellFill,
  SHEET_ANNUAL, SHEET_FORECAST, SHEET_PAYMENTS,
} from "./excel-read";
import { CLIENTS, CONCEPTS } from "../src/lib/catalog";
import { r2, baseFromGross, vatFromGross, VAT_RATE, settlementDueDate } from "../src/lib/money";

const db = new PrismaClient();

const YEAR = 2026;
const log = (...a: unknown[]) => console.log(...a);

// ---------------------------------------------------------------- utilidades

const CAT_MONTHS: Record<string, number> = {
  gener: 1, febrer: 2, marc: 3, març: 3, abril: 4, maig: 5, juny: 6,
  juliol: 7, agost: 8, setembre: 9, octubre: 10, novembre: 11, desembre: 12,
};

function normalize(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "Extres Gener 26" -> 1 */
function monthFromHeader(label: string): number | null {
  const m = normalize(label).match(/^extres\s+([a-z]+)\s*2?6?$/);
  if (!m) return null;
  return CAT_MONTHS[m[1]] ?? null;
}

/** Fecha de cobro/pago que asumimos: ultimo dia del mes contable. */
function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}
function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

type MovementInput = {
  importKey: string;
  kind: "INCOME" | "EXPENSE";
  clientId?: string | null;
  costConceptId?: string | null;
  concept: string;
  year: number;
  month: number;
  gross: number;
  vatRate?: number;
  irpfRate?: number;
  irpfAmount?: number;
  vatDeductible?: boolean;
  status?: string;
  isForecast?: boolean;
  settledAmount?: number | null;
  settledDate?: Date | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  scenarioId?: string | null;
};

const D = (n: number) => new Prisma.Decimal(n.toFixed(6));

async function upsertMovement(m: MovementInput) {
  const vatRate = m.vatRate ?? VAT_RATE;
  const base = baseFromGross(m.gross, vatRate);
  const vat = vatFromGross(m.gross, vatRate);
  const irpfRate = m.irpfRate ?? 0;
  const irpfAmount = m.irpfAmount ?? base * irpfRate;

  const data = {
    kind: m.kind,
    clientId: m.clientId ?? null,
    costConceptId: m.costConceptId ?? null,
    concept: m.concept,
    year: m.year,
    month: m.month,
    issueDate: startOfMonth(m.year, m.month),
    dueDate: addDays(startOfMonth(m.year, m.month), 30),
    settledDate: m.settledDate ?? null,
    grossAmount: D(m.gross),
    baseAmount: D(base),
    vatRate: D(vatRate),
    vatAmount: D(vat),
    irpfRate: D(irpfRate),
    irpfAmount: D(irpfAmount),
    settledAmount: m.settledAmount === null || m.settledAmount === undefined ? null : D(m.settledAmount),
    vatDeductible: m.vatDeductible ?? true,
    status: m.status ?? "SETTLED",
    isForecast: m.isForecast ?? false,
    invoiceNumber: m.invoiceNumber ?? null,
    notes: m.notes ?? null,
    scenarioId: m.scenarioId ?? null,
  };

  await db.movement.upsert({
    where: { importKey: m.importKey },
    create: { ...data, importKey: m.importKey },
    update: data,
  });
}

// ---------------------------------------------------------------- catalogo

async function seedCatalog() {
  const clientIds = new Map<string, string>();
  for (const [i, c] of CLIENTS.entries()) {
    const row = await db.client.upsert({
      where: { name: c.name },
      create: {
        name: c.name,
        status: c.status ?? "ACTIVE",
        vatExempt: c.vatExempt ?? false,
        monthlyFee: c.monthlyFee !== undefined ? D(c.monthlyFee) : null,
        notes: c.notes ?? null,
        sortOrder: i,
      },
      update: {
        status: c.status ?? "ACTIVE",
        vatExempt: c.vatExempt ?? false,
        monthlyFee: c.monthlyFee !== undefined ? D(c.monthlyFee) : null,
        notes: c.notes ?? null,
        sortOrder: i,
      },
    });
    clientIds.set(normalize(c.name), row.id);
    for (const alias of [c.name, ...c.aliases]) {
      await db.clientAlias.upsert({
        where: { alias },
        create: { alias, clientId: row.id },
        update: { clientId: row.id },
      });
      clientIds.set(normalize(alias), row.id);
    }
  }

  const conceptIds = new Map<string, string>();
  for (const [i, c] of CONCEPTS.entries()) {
    const row = await db.costConcept.upsert({
      where: { name: c.name },
      create: {
        name: c.name, category: c.category,
        isFixed: c.isFixed ?? true,
        vatDeductible: c.vatDeductible ?? true,
        irpfRate: D(c.irpfRate ?? 0),
        notes: c.notes ?? null, sortOrder: i,
      },
      update: {
        category: c.category,
        isFixed: c.isFixed ?? true,
        vatDeductible: c.vatDeductible ?? true,
        irpfRate: D(c.irpfRate ?? 0),
        notes: c.notes ?? null, sortOrder: i,
      },
    });
    conceptIds.set(normalize(c.name), row.id);
    for (const alias of [c.name, ...c.aliases]) {
      await db.costConceptAlias.upsert({
        where: { alias },
        create: { alias, costConceptId: row.id },
        update: { costConceptId: row.id },
      });
      conceptIds.set(normalize(alias), row.id);
    }
  }

  log(`  catalogo: ${CLIENTS.length} clientes, ${CONCEPTS.length} conceptos`);
  return { clientIds, conceptIds };
}

// ------------------------------------------------- hoja 1: contabilidad anual

const INCOME_ROWS = { first: 5, last: 26, extras: 27 };
const COST_ROWS = { first: 31, last: 40, extras: 38, equip: 37, payroll: 31 };
const IRPF_ROWS = { aina: 53, adri: 54, marina: 55 };
const REAL_MONTHS = 7; // ene-jul 2026 tienen datos reales

/** Meses en los que el desglose de "Equip" existe (jul-26). */
const EQUIP_DETAIL_MONTH = 7;

async function importAnnual(
  ws: import("exceljs").Worksheet,
  clientIds: Map<string, string>,
  conceptIds: Map<string, string>,
) {
  let income = 0;
  let costs = 0;

  // --- ingresos por cliente
  for (let row = INCOME_ROWS.first; row <= INCOME_ROWS.last; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const clientId = clientIds.get(normalize(label));
    if (!clientId) {
      log(`  ! cliente sin catalogar en hoja 1: "${label}"`);
      continue;
    }
    const client = CLIENTS.find((c) => normalize(c.name) === normalize(label));
    for (let m = 1; m <= 12; m++) {
      const gross = cellNum(ws, row, m + 1);
      if (gross === 0) continue;
      await upsertMovement({
        importKey: `s1:income:${label}:${YEAR}-${m}`,
        kind: "INCOME",
        clientId,
        concept: label,
        year: YEAR,
        month: m,
        gross,
        // Jaume Rey factura sin IVA.
        vatRate: client?.vatExempt ? 0 : VAT_RATE,
        status: "SETTLED",
        settledAmount: gross,
        settledDate: endOfMonth(YEAR, m),
      });
      income++;
    }
  }

  // --- costes por concepto
  // Las retenciones de Aina y Adri estan escritas a mano en varios meses;
  // las leemos de la propia hoja en vez de recalcularlas.
  const payrollIrpf: number[] = [];
  const equipIrpf: number[] = [];
  for (let m = 1; m <= 12; m++) {
    payrollIrpf[m] = r2(cellNum(ws, IRPF_ROWS.aina, m + 1) + cellNum(ws, IRPF_ROWS.adri, m + 1));
    // Marina: en marzo, junio y julio el Excel no aplica la formula del 7%
    // sino un importe a mano. Importamos lo declarado, no lo recalculado.
    equipIrpf[m] = cellNum(ws, IRPF_ROWS.marina, m + 1);
  }

  for (let row = COST_ROWS.first; row <= COST_ROWS.last; row++) {
    if (row === COST_ROWS.extras) continue; // se importa desde el detalle
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const conceptId = conceptIds.get(normalize(label));
    if (!conceptId) {
      log(`  ! concepto sin catalogar en hoja 1: "${label}"`);
      continue;
    }
    const seed = CONCEPTS.find((c) => conceptIds.get(normalize(c.name)) === conceptId);
    for (let m = 1; m <= 12; m++) {
      // julio del equipo llega desglosado por proveedor
      if (row === COST_ROWS.equip && m === EQUIP_DETAIL_MONTH) continue;
      const gross = cellNum(ws, row, m + 1);
      if (gross === 0) continue;
      const isPayroll = row === COST_ROWS.payroll;
      const noVat = seed?.vatDeductible === false;
      await upsertMovement({
        importKey: `s1:cost:${label}:${YEAR}-${m}`,
        kind: "EXPENSE",
        costConceptId: conceptId,
        concept: label,
        year: YEAR,
        month: m,
        gross,
        vatRate: noVat ? 0 : VAT_RATE,
        vatDeductible: !noVat,
        irpfRate: seed?.irpfRate ?? 0,
        irpfAmount: isPayroll
          ? payrollIrpf[m]
          : row === COST_ROWS.equip
            ? equipIrpf[m]
            : undefined,
        status: "SETTLED",
        settledAmount: gross,
        settledDate: endOfMonth(YEAR, m),
        notes:
          row === COST_ROWS.equip
            ? "Linea agregada del Excel — pendiente de desglosar por proveedor."
            : null,
      });
      costs++;
    }
  }
  return { income, costs };
}

// ------------------------------------------------- hoja 1: detalle de extras

/** Recorre un bloque de detalle "Extres <Mes> 26" + lineas indentadas. */
function readDetailBlock(
  ws: import("exceljs").Worksheet,
  rows: { from: number; to: number },
  labelCol: number,
  amountCol: number,
) {
  const out: { month: number; label: string; amount: number; row: number }[] = [];
  let month: number | null = null;
  for (let row = rows.from; row <= rows.to; row++) {
    const raw = ws.getCell(row, labelCol).value;
    const label = raw === null || raw === undefined ? "" : String(raw);
    if (!label.trim()) continue;
    // El orden importa: "  Extres febrer" es una linea de detalle, no una
    // cabecera, y solo la indentacion las distingue.
    const indented = /^\s{2,}/.test(label);
    if (!indented) {
      const header = monthFromHeader(label);
      if (header) month = header;
      continue;
    }
    if (month === null) continue;
    const amount = cellNum(ws, row, amountCol);
    if (amount === 0) continue;
    out.push({ month, label: label.trim(), amount, row });
  }
  return out;
}

const EXTRA_INCOME_ROWS = { from: 62, to: 79 };
const EXTRA_COST_ROWS = { from: 80, to: 137 };
const EQUIP_DETAIL_ROWS = { from: 81, to: 95 };
const EQUIP_LABEL_COL = 4;
const EQUIP_AMOUNT_COL = 5;

/** Reparte una linea del desglose de julio al proveedor que le corresponde. */
function providerFor(label: string): { concept: string; invoice: string | null } {
  const n = normalize(label);
  const inv = label.match(/(FR-\d+|F\d{3,}|#\d+)/)?.[1] ?? null;
  if (n.includes("marina camp")) return { concept: "Marina Camp", invoice: inv };
  if (n.includes("lidia rodriguez")) return { concept: "Lidia Rodriguez", invoice: inv };
  if (n.includes("marta cumplido")) return { concept: "Marta Cumplido", invoice: inv };
  return { concept: "Equip (edicio/disseny)", invoice: inv };
}

async function importDetails(
  ws: import("exceljs").Worksheet,
  clientIds: Map<string, string>,
  conceptIds: Map<string, string>,
) {
  let n = 0;

  // extras de ingresos
  const extraIncomeConceptId = conceptIds.get(normalize("Extres"));
  for (const item of readDetailBlock(ws, EXTRA_INCOME_ROWS, 1, 2)) {
    await upsertMovement({
      importKey: `s1:extra-income:${YEAR}-${item.month}:${item.row}`,
      kind: "INCOME",
      concept: item.label,
      year: YEAR,
      month: item.month,
      gross: item.amount,
      status: "SETTLED",
      settledAmount: item.amount,
      settledDate: endOfMonth(YEAR, item.month),
      notes: "Extra de ingresos (detalle hoja 1).",
    });
    n++;
  }

  // extras de gastos — respetamos las lineas marcadas "(sense IVA)"
  for (const item of readDetailBlock(ws, EXTRA_COST_ROWS, 1, 2)) {
    const noVat = /sense\s*iva/i.test(item.label);
    await upsertMovement({
      importKey: `s1:extra-cost:${YEAR}-${item.month}:${item.row}`,
      kind: "EXPENSE",
      costConceptId: extraIncomeConceptId,
      concept: item.label,
      year: YEAR,
      month: item.month,
      gross: item.amount,
      vatRate: noVat ? 0 : VAT_RATE,
      vatDeductible: !noVat,
      status: "SETTLED",
      settledAmount: item.amount,
      settledDate: endOfMonth(YEAR, item.month),
    });
    n++;
  }

  // desglose del equipo de julio (columnas C/D)
  for (let row = EQUIP_DETAIL_ROWS.from; row <= EQUIP_DETAIL_ROWS.to; row++) {
    const raw = ws.getCell(row, EQUIP_LABEL_COL).value;
    const label = raw === null || raw === undefined ? "" : String(raw);
    if (!/^\s{2,}/.test(label)) continue;
    const amount = cellNum(ws, row, EQUIP_AMOUNT_COL);
    if (amount === 0) continue;
    const { concept, invoice } = providerFor(label);
    const seed = CONCEPTS.find((c) => c.name === concept);
    await upsertMovement({
      importKey: `s1:equip:${YEAR}-${EQUIP_DETAIL_MONTH}:${row}`,
      kind: "EXPENSE",
      costConceptId: conceptIds.get(normalize(concept)),
      concept: label.trim(),
      year: YEAR,
      month: EQUIP_DETAIL_MONTH,
      gross: amount,
      irpfRate: seed?.irpfRate ?? 0,
      invoiceNumber: invoice,
      status: "SETTLED",
      settledAmount: amount,
      settledDate: endOfMonth(YEAR, EQUIP_DETAIL_MONTH),
      notes: /\*/.test(label) ? "Excepcion de vacaciones (normalmente 01/08)." : null,
    });
    n++;
  }
  return n;
}

// ------------------------------------------------- hoja 3: cobros

/** col 2 -> oct-25 ... col 16 -> dic-26 */
function colToPeriod(col: number): { year: number; month: number } {
  const idx = col - 2 + 9; // oct-2025 es el indice 9 de 2025
  return { year: 2025 + Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const PAY_EXPECTED = { first: 5, last: 27 };
const PAY_STATUS = { first: 33, last: 55 };
const PAY_COLS = { first: 2, last: 16 };

type CellState =
  | { kind: "amount"; amount: number }
  | { kind: "na" }
  | { kind: "pending" }
  | { kind: "future" }
  | { kind: "note"; text: string }
  | { kind: "empty" };

function readState(ws: import("exceljs").Worksheet, row: number, col: number): CellState {
  const raw = cellText(ws, row, col);
  const n = cellNum(ws, row, col);
  if (n > 0) return { kind: "amount", amount: n };
  if (!raw) return { kind: "empty" };
  const t = normalize(raw);
  if (t === "x") return { kind: "na" };
  if (t === "pendent") return { kind: "pending" };
  if (t === "..." || t === "…") return { kind: "future" };
  return { kind: "note", text: raw };
}

async function importPayments(
  ws: import("exceljs").Worksheet,
  clientIds: Map<string, string>,
) {
  let budgets = 0;
  let updates = 0;
  let created = 0;

  // matriz superior: lo que esperamos cobrar
  const expectedByKey = new Map<string, number>();
  for (let row = PAY_EXPECTED.first; row <= PAY_EXPECTED.last; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const clientId = clientIds.get(normalize(label));
    if (!clientId) { log(`  ! cliente sin catalogar en hoja 3: "${label}"`); continue; }
    for (let col = PAY_COLS.first; col <= PAY_COLS.last; col++) {
      const amount = cellNum(ws, row, col);
      if (amount === 0) continue;
      const { year, month } = colToPeriod(col);
      await db.budgetLine.upsert({
        where: { clientId_year_month_scenarioKey: { clientId, year, month, scenarioKey: "base" } },
        create: { clientId, year, month, amount: D(amount) },
        update: { amount: D(amount) },
      });
      expectedByKey.set(`${clientId}:${year}:${month}`, amount);
      budgets++;
    }
  }

  // matriz inferior: estado real de cobro
  for (let row = PAY_STATUS.first; row <= PAY_STATUS.last; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const clientId = clientIds.get(normalize(label));
    if (!clientId) continue;

    for (let col = PAY_COLS.first; col <= PAY_COLS.last; col++) {
      const { year, month } = colToPeriod(col);
      const state = readState(ws, row, col);
      const fill = cellFill(ws, row, col);
      const expected = expectedByKey.get(`${clientId}:${year}:${month}`) ?? 0;

      if (state.kind === "na" || state.kind === "empty") continue;

      let movement = await db.movement.findFirst({
        where: { clientId, year, month, kind: "INCOME" },
        orderBy: { grossAmount: "desc" },
      });

      // Solo 2025 nace de aqui. Para 2026 mandan la hoja 1 (contabilidad) y la
      // hoja 2 (prevision); si la hoja 3 menciona un importe que ellas no
      // tienen, es una discrepancia que hay que ver, no un movimiento nuevo.
      if (!movement && year < YEAR && (state.kind === "amount" || expected > 0)) {
        const gross = expected || (state.kind === "amount" ? state.amount : 0);
        if (gross === 0) continue;
        const client = CLIENTS.find((c) => clientIds.get(normalize(c.name)) === clientId);
        await upsertMovement({
          importKey: `s3:income:${clientId}:${year}-${month}`,
          kind: "INCOME",
          clientId,
          concept: label,
          year, month, gross,
          vatRate: client?.vatExempt ? 0 : VAT_RATE,
          status: "INVOICED",
          settledAmount: null,
        });
        created++;
        movement = await db.movement.findFirst({
          where: { importKey: `s3:income:${clientId}:${year}-${month}` },
        });
      }
      if (!movement) continue;

      const gross = Number(movement.grossAmount);
      let status = movement.status;
      let settledAmount: number | null = null;
      let settledDate: Date | null = null;
      let notes = movement.notes;

      switch (state.kind) {
        case "amount":
          settledAmount = state.amount;
          settledDate = endOfMonth(year, month);
          status = state.amount + 0.005 >= gross ? "SETTLED" : "PARTIAL";
          break;
        case "pending":
          status = "INVOICED";
          break;
        case "future":
          status = movement.isForecast ? "FORECAST" : "INVOICED";
          break;
        case "note":
          status = "INVOICED";
          notes = [notes, `Nota del Excel: "${state.text}"`].filter(Boolean).join(" ");
          break;
      }

      await db.movement.update({
        where: { id: movement.id },
        data: {
          status,
          settledAmount: settledAmount === null ? null : D(settledAmount),
          settledDate,
          notes,
          // el color de la celda confirma la lectura del texto
          ...(fill === "FFFFEBEE" && status === "SETTLED" ? { status: "INVOICED" } : {}),
        },
      });
      updates++;
    }
  }
  return { budgets, updates, created };
}

// ------------------------------------------------- hoja 2: previsiones

const FC_INCOME = { first: 4, last: 23 };
const FC_COST = { first: 28, last: 38 };
const FC_COLS = { first: 2, last: 6 }; // ago..dic
const FC_EXTRA_DETAIL = { from: 66, to: 74 };

function fcColToMonth(col: number) {
  return col - 2 + 8; // col 2 -> agosto
}

async function importForecast(
  ws: import("exceljs").Worksheet,
  clientIds: Map<string, string>,
  conceptIds: Map<string, string>,
) {
  let n = 0;

  for (let row = FC_INCOME.first; row <= FC_INCOME.last; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const clientId = clientIds.get(normalize(label));
    if (!clientId) { log(`  ! cliente sin catalogar en hoja 2: "${label}"`); continue; }
    const client = CLIENTS.find((c) => clientIds.get(normalize(c.name)) === clientId);
    for (let col = FC_COLS.first; col <= FC_COLS.last; col++) {
      const gross = cellNum(ws, row, col);
      if (gross === 0) continue;
      const month = fcColToMonth(col);
      await upsertMovement({
        importKey: `s2:income:${label}:${YEAR}-${month}`,
        kind: "INCOME",
        clientId,
        concept: label,
        year: YEAR, month, gross,
        vatRate: client?.vatExempt ? 0 : VAT_RATE,
        status: "FORECAST",
        isForecast: true,
        settledAmount: null,
      });
      n++;
    }
  }

  for (let row = FC_COST.first; row <= FC_COST.last; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const conceptId = conceptIds.get(normalize(label));
    if (!conceptId) { log(`  ! concepto sin catalogar en hoja 2: "${label}"`); continue; }
    const seed = CONCEPTS.find((c) => conceptIds.get(normalize(c.name)) === conceptId);
    const noVat = seed?.vatDeductible === false;
    for (let col = FC_COLS.first; col <= FC_COLS.last; col++) {
      const gross = cellNum(ws, row, col);
      if (gross === 0) continue;
      const month = fcColToMonth(col);
      // agosto trae el detalle de extras desglosado mas abajo
      if (row === 38 && month === 8) continue;
      await upsertMovement({
        importKey: `s2:cost:${label}:${YEAR}-${month}`,
        kind: "EXPENSE",
        costConceptId: conceptId,
        concept: label,
        year: YEAR, month, gross,
        vatRate: noVat ? 0 : VAT_RATE,
        vatDeductible: !noVat,
        irpfRate: seed?.irpfRate ?? 0,
        status: "FORECAST",
        isForecast: true,
        settledAmount: null,
      });
      n++;
    }
  }

  // detalle de extras previstos de agosto
  const extrasId = conceptIds.get(normalize("Extres"));
  for (const item of readDetailBlock(ws, FC_EXTRA_DETAIL, 1, 2)) {
    await upsertMovement({
      importKey: `s2:extra-cost:${YEAR}-${item.month}:${item.row}`,
      kind: "EXPENSE",
      costConceptId: extrasId,
      concept: item.label,
      year: YEAR, month: item.month,
      gross: item.amount,
      status: "FORECAST",
      isForecast: true,
      settledAmount: null,
    });
    n++;
  }
  return n;
}

// ------------------------------------------------- liquidaciones y ajustes

const IVA_SETTLEMENT_ROW = 50;
const IRPF_SETTLEMENT_ROW = 56;

/** Los pagos de ene/abr/jul corresponden a Q4-25, Q1-26 y Q2-26. */
const SETTLEMENT_MONTHS: { month: number; year: number; quarter: number }[] = [
  { month: 1, year: 2025, quarter: 4 },
  { month: 4, year: 2026, quarter: 1 },
  { month: 7, year: 2026, quarter: 2 },
  { month: 10, year: 2026, quarter: 3 },
];

async function importSettlements(ws: import("exceljs").Worksheet) {
  let n = 0;
  for (const s of SETTLEMENT_MONTHS) {
    for (const [kind, row] of [["VAT_303", IVA_SETTLEMENT_ROW], ["IRPF_111", IRPF_SETTLEMENT_ROW]] as const) {
      const amount = cellNum(ws, row, s.month + 1);
      if (amount === 0) continue;
      const paidAt = endOfMonth(YEAR, s.month);
      await db.taxSettlement.upsert({
        where: { year_quarter_kind: { year: s.year, quarter: s.quarter, kind } },
        create: {
          year: s.year, quarter: s.quarter, kind,
          computedAmount: D(amount), manualAmount: D(amount),
          dueDate: settlementDueDate(s.year, s.quarter),
          paidAt, status: "PAID",
          notes: "Importe importado del Excel.",
        },
        update: {
          manualAmount: D(amount),
          dueDate: settlementDueDate(s.year, s.quarter),
          paidAt, status: "PAID",
        },
      });
      n++;
    }
  }
  return n;
}

async function importSettings(ws: import("exceljs").Worksheet) {
  // Caja inicial de agosto. La celda dice 25.582 y el subtitulo 28.582,80:
  // nos quedamos con la celda, que es la que alimenta el flujo de caja.
  const cash = cellNum(ws, 61, 2);
  const entries: [string, string][] = [
    ["cash.initial.year", String(YEAR)],
    ["cash.initial.month", "8"],
    ["cash.initial.amount", String(cash)],
    ["vat.rate", String(VAT_RATE)],
    ["company.name", "21Days"],
  ];
  for (const [key, value] of entries) {
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return cash;
}

// ---------------------------------------------------------------- main

async function main() {
  const wb = await openWorkbook();
  const annual = wb.getWorksheet(SHEET_ANNUAL)!;
  const forecast = wb.getWorksheet(SHEET_FORECAST)!;
  const payments = wb.getWorksheet(SHEET_PAYMENTS)!;

  log("\n21Days — importacion de CONTABILITAT_CORRECTE.xlsx\n");

  const { clientIds, conceptIds } = await seedCatalog();

  const a = await importAnnual(annual, clientIds, conceptIds);
  log(`  hoja 1: ${a.income} ingresos, ${a.costs} costes`);

  const d = await importDetails(annual, clientIds, conceptIds);
  log(`  hoja 1 (detalle): ${d} lineas de extras y equipo`);

  const f = await importForecast(forecast, clientIds, conceptIds);
  log(`  hoja 2: ${f} movimientos previstos`);

  const p = await importPayments(payments, clientIds);
  log(`  hoja 3: ${p.budgets} previsiones de cobro, ${p.created} movimientos nuevos, ${p.updates} estados aplicados`);

  const s = await importSettlements(annual);
  log(`  liquidaciones: ${s}`);

  const cash = await importSettings(forecast);
  log(`  caja inicial ago-26: ${cash.toLocaleString("es-ES")} €`);

  const total = await db.movement.count();
  log(`\n  total de movimientos en la base de datos: ${total}\n`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
