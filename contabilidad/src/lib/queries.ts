import { prisma } from "./prisma";
import { summarizeYear, type PriorSettlement } from "./finance";

/** Resumen anual completo, con las liquidaciones de años anteriores que caen en enero. */
export async function getYearSummary(year: number) {
  const [movements, prior] = await Promise.all([
    prisma.movement.findMany({ where: { year } }),
    prisma.taxSettlement.findMany({ where: { year: { lt: year } } }),
  ]);

  const priorSettlements: PriorSettlement[] = prior.map((p) => ({
    year: p.year,
    quarter: p.quarter,
    kind: p.kind,
    amount: Number(p.manualAmount ?? p.computedAmount),
  }));

  return summarizeYear(year, movements, { priorSettlements });
}

export async function getCatalogCounts() {
  const [clients, concepts, movements, budgets, settlements] = await Promise.all([
    prisma.client.count(),
    prisma.costConcept.count(),
    prisma.movement.count(),
    prisma.budgetLine.count(),
    prisma.taxSettlement.count(),
  ]);
  return { clients, concepts, movements, budgets, settlements };
}

/** Rango de periodos con datos. */
export async function getDataRange() {
  const [first, last] = await Promise.all([
    prisma.movement.findFirst({ orderBy: [{ year: "asc" }, { month: "asc" }] }),
    prisma.movement.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }] }),
  ]);
  return { first, last };
}
