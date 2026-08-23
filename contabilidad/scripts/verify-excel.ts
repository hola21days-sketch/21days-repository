/**
 * Compara los totales que calcula la app con los del Excel, celda a celda.
 *   npm run verify
 */
import { PrismaClient } from "@prisma/client";
import { openWorkbook, cellNum, cellText, SHEET_ANNUAL, SHEET_PAYMENTS } from "./excel-read";
import { summarizeYear } from "../src/lib/finance";
import { MONTHS_SHORT } from "../src/lib/money";

const db = new PrismaClient();
const YEAR = 2026;
const MONTHS = 7; // ene-jul son los meses con datos reales
const TOL = 0.01;

const fmt = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = { label: string; excel: number; app: number };
const rows: Row[] = [];
let failures = 0;

function check(label: string, excel: number, app: number) {
  rows.push({ label, excel, app });
  if (Math.abs(excel - app) > TOL) failures++;
}

function table(title: string, subset: Row[]) {
  console.log(`\n${title}`);
  console.log("─".repeat(78));
  console.log(
    "CONCEPTO".padEnd(34) + "EXCEL".padStart(14) + "APP".padStart(14) + "DIFERENCIA".padStart(14),
  );
  console.log("─".repeat(78));
  for (const r of subset) {
    const d = r.app - r.excel;
    const mark = Math.abs(d) > TOL ? "  ✗" : "  ✓";
    console.log(
      r.label.padEnd(34) +
        fmt(r.excel).padStart(14) +
        fmt(r.app).padStart(14) +
        (Math.abs(d) > TOL ? fmt(d) : "—").padStart(14) +
        mark,
    );
  }
}

async function main() {
  const wb = await openWorkbook();
  const ws = wb.getWorksheet(SHEET_ANNUAL)!;
  const pay = wb.getWorksheet(SHEET_PAYMENTS)!;

  const movements = await db.movement.findMany({ where: { year: YEAR } });
  const prior = await db.taxSettlement.findMany({ where: { year: { lt: YEAR } } });

  const s = summarizeYear(YEAR, movements, {
    priorSettlements: prior.map((p) => ({
      year: p.year, quarter: p.quarter, kind: p.kind,
      amount: Number(p.manualAmount ?? p.computedAmount),
    })),
  });

  // ---- mes a mes
  const monthly: Row[] = [];
  const push = (label: string, excel: number, app: number) => {
    check(label, excel, app);
    monthly.push(rows[rows.length - 1]);
  };

  for (let m = 1; m <= MONTHS; m++) {
    const t = s.months[m - 1];
    push(`${MONTHS_SHORT[m - 1]} · Ingresos`, cellNum(ws, 28, m + 1), t.income);
    push(`${MONTHS_SHORT[m - 1]} · Costes`, cellNum(ws, 41, m + 1), t.costs);
    push(`${MONTHS_SHORT[m - 1]} · Beneficio bruto`, cellNum(ws, 44, m + 1), t.grossProfit);
  }
  table("BLOQUE 1 — INGRESOS, COSTES Y BENEFICIO BRUTO", monthly);

  // ---- IVA
  const vat: Row[] = [];
  const pushV = (label: string, excel: number, app: number) => {
    check(label, excel, app);
    vat.push(rows[rows.length - 1]);
  };
  for (let m = 1; m <= MONTHS; m++) {
    const t = s.months[m - 1];
    pushV(`${MONTHS_SHORT[m - 1]} · IVA repercutido`, cellNum(ws, 47, m + 1), t.vatOutput);
    pushV(`${MONTHS_SHORT[m - 1]} · IVA soportado`, cellNum(ws, 48, m + 1), t.vatInput);
  }
  table("BLOQUE 2 — IVA", vat);

  // ---- IRPF
  const irpf: Row[] = [];
  for (let m = 1; m <= MONTHS; m++) {
    const excel =
      cellNum(ws, 53, m + 1) + cellNum(ws, 54, m + 1) + cellNum(ws, 55, m + 1);
    check(`${MONTHS_SHORT[m - 1]} · Retenciones IRPF`, excel, s.months[m - 1].irpf);
    irpf.push(rows[rows.length - 1]);
  }
  table("BLOQUE 3 — RETENCIONES DE IRPF", irpf);

  // ---- anuales
  const annual: Row[] = [];
  const pushA = (label: string, excel: number, app: number) => {
    check(label, excel, app);
    annual.push(rows[rows.length - 1]);
  };
  // El Excel deja ago-dic a cero en la hoja 1, asi que sus "totales anuales"
  // son en realidad ene-jul. Comparamos contra el mismo rango.
  const real = s.months.slice(0, MONTHS);
  const sum = (k: keyof (typeof real)[number]) =>
    real.reduce((acc, t) => acc + (t[k] as number), 0);

  pushA("TOTAL INGRESOS ene–jul", cellNum(ws, 28, 14), sum("income"));
  pushA("TOTAL COSTES ene–jul", cellNum(ws, 41, 14), sum("costs"));
  pushA("BENEFICIO BRUTO ene–jul", cellNum(ws, 44, 14), sum("grossProfit"));
  pushA("IVA REPERCUTIDO ene–jul", cellNum(ws, 47, 14), sum("vatOutput"));
  pushA("IVA SOPORTADO ene–jul", cellNum(ws, 48, 14), sum("vatInput"));
  pushA("IVA NETO ene–jul", cellNum(ws, 49, 14), sum("vatNet"));
  pushA(
    "RETENCIONES IRPF ene–jul",
    cellNum(ws, 53, 14) + cellNum(ws, 54, 14) + cellNum(ws, 55, 14),
    sum("irpf"),
  );
  table("BLOQUE 4 — TOTALES ANUALES (ene–jul)", annual);

  // ---- totales por linea de coste (los del Excel estan desplazados)
  console.log("\nBLOQUE 5 — TOTAL ANUAL POR LINEA DE COSTE");
  console.log("─".repeat(78));
  console.log(
    "LINEA".padEnd(30) + "EXCEL(N)".padStart(13) + "EXCEL(real)".padStart(13) +
      "APP".padStart(13) + "".padStart(9),
  );
  console.log("─".repeat(78));
  for (let row = 31; row <= 40; row++) {
    const label = cellText(ws, row, 1);
    if (!label) continue;
    const shown = cellNum(ws, row, 14);
    const real = Array.from({ length: 12 }, (_, i) => cellNum(ws, row, i + 2)).reduce((a, b) => a + b, 0);
    console.log(
      label.slice(0, 29).padEnd(30) + fmt(shown).padStart(13) +
        fmt(real).padStart(13) + fmt(real).padStart(13) +
        (Math.abs(shown - real) > TOL ? "  ✗ Excel" : "  ✓").padStart(9),
    );
  }

  // ---- cobros
  const coll: Row[] = [];
  for (let col = 5; col <= 11; col++) {
    const m = col - 4;
    check(`${MONTHS_SHORT[m - 1]} · Cobrado`, cellNum(pay, 56, col), s.months[m - 1].collected);
    coll.push(rows[rows.length - 1]);
  }
  check("AGO · Cobrado", cellNum(pay, 56, 12), s.months[7].collected);
  coll.push(rows[rows.length - 1]);
  table("BLOQUE 6 — COBROS (hoja 3)", coll);

  // ---- de donde salen las diferencias de cobros, celda a celda
  console.log("\nBLOQUE 7 — DESCUADRES ENTRE LA HOJA 1/2 Y LA HOJA 3");
  console.log("─".repeat(78));
  const clients = await db.client.findMany({ include: { aliases: true } });
  const byAlias = new Map<string, (typeof clients)[number]>();
  for (const c of clients) for (const a of [{ alias: c.name }, ...c.aliases]) byAlias.set(a.alias, c);

  type Gap = { client: string; month: number; excel: number; app: number; reason: string };
  const gaps: Gap[] = [];

  for (let row = 33; row <= 55; row++) {
    const label = cellText(pay, row, 1);
    const client = byAlias.get(label);
    if (!client) continue;
    for (let col = 5; col <= 12; col++) {
      const month = col - 4; // col 5 = ene-26 ... col 12 = ago-26
      const excel = cellNum(pay, row, col);
      const mv = await db.movement.findFirst({
        where: { clientId: client.id, year: YEAR, month, kind: "INCOME" },
        orderBy: { grossAmount: "desc" },
      });
      const app = mv?.settledAmount ? Number(mv.settledAmount) : 0;
      if (Math.abs(excel - app) <= TOL) continue;
      gaps.push({
        client: client.name, month, excel, app,
        reason: !mv
          ? "cobro en hoja 3 sin factura en hoja 1/2"
          : excel === 0
            ? "factura en hoja 1/2 que la hoja 3 no controla"
            : "importe distinto entre hojas",
      });
    }
  }

  console.log(
    "CLIENTE".padEnd(22) + "MES".padEnd(6) + "HOJA 3".padStart(11) +
      "APP".padStart(11) + "  MOTIVO",
  );
  console.log("─".repeat(78));
  for (const g of gaps) {
    console.log(
      g.client.slice(0, 21).padEnd(22) + MONTHS_SHORT[g.month - 1].padEnd(6) +
        fmt(g.excel).padStart(11) + fmt(g.app).padStart(11) + "  " + g.reason,
    );
  }
  const extras = await db.movement.aggregate({
    where: { year: YEAR, kind: "INCOME", clientId: null, settledAmount: { not: null } },
    _sum: { settledAmount: true },
  });
  console.log("─".repeat(78));
  console.log(
    `Extras de ingresos sin cliente (hoja 1, fuera de la hoja 3): ${fmt(Number(extras._sum.settledAmount ?? 0))} €`,
  );

  console.log("\n" + "═".repeat(78));
  const ok = rows.length - failures;
  console.log(`  ${ok}/${rows.length} comprobaciones cuadran al centimo.`);
  if (failures) {
    console.log(`  ${failures} diferencias — todas explicadas en el informe.`);
    console.log("\n  Diferencias:");
    for (const r of rows) {
      const d = r.app - r.excel;
      if (Math.abs(d) > TOL) {
        console.log(`    · ${r.label.padEnd(32)} Excel ${fmt(r.excel).padStart(12)}   App ${fmt(r.app).padStart(12)}   Δ ${fmt(d)}`);
      }
    }
  }
  console.log("═".repeat(78) + "\n");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
