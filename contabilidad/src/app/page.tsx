import { getYearSummary, getCatalogCounts, getDataRange } from "@/lib/queries";
import { formatNum, formatNumOrDash, MONTHS_SHORT } from "@/lib/money";

export const dynamic = "force-dynamic";

const YEAR = 2026;

export default async function Page() {
  const [s, counts, range] = await Promise.all([
    getYearSummary(YEAR),
    getCatalogCounts(),
    getDataRange(),
  ]);

  const real = s.months.filter((m) => !m.isForecast && m.income + m.costs > 0);
  const sum = (k: "income" | "costs" | "grossProfit" | "netProfit") =>
    real.reduce((a, m) => a + m[k], 0);

  const rows = [
    { label: "Ingresos", key: "income" as const },
    { label: "Costes", key: "costs" as const },
    { label: "Beneficio bruto", key: "grossProfit" as const, rule: true },
    { label: "IVA repercutido", key: "vatOutput" as const },
    { label: "IVA soportado", key: "vatInput" as const },
    { label: "IVA neto", key: "vatNet" as const },
    { label: "Retenciones IRPF", key: "irpf" as const },
    { label: "Liquidación IVA", key: "vatSettlement" as const },
    { label: "Liquidación IRPF", key: "irpfSettlement" as const },
    { label: "Beneficio neto", key: "netProfit" as const, rule: true, strong: true },
  ];

  return (
    <main className="mx-auto max-w-[1180px] px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="th mb-1">21Days · Contabilidad</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ejercicio {YEAR}
          </h1>
        </div>
        <p className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          Fase 1 — datos importados y verificados
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Facturado ene–jul", value: sum("income") },
          { label: "Costes ene–jul", value: sum("costs") },
          { label: "Beneficio bruto", value: sum("grossProfit") },
          { label: "Beneficio neto", value: sum("netProfit") },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className="th mb-2">{k.label}</p>
            <p
              className={`tnum text-xl font-semibold ${
                k.value < 0 ? "text-bad" : "text-ink"
              }`}
            >
              {formatNum(k.value)} €
            </p>
          </div>
        ))}
      </section>

      <section className="card mb-8 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th sticky left-0 bg-surface px-4 py-3 text-left">
                Concepto
              </th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={`th px-3 py-3 text-right ${
                    s.months[i].isForecast ? "text-ink-faint/70" : ""
                  }`}
                >
                  {m}
                </th>
              ))}
              <th className="th px-4 py-3 text-right">Año</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-b border-line/60 last:border-0 ${
                  r.rule ? "bg-sunken/60" : ""
                }`}
              >
                <td
                  className={`sticky left-0 px-4 py-2 text-left ${
                    r.rule ? "bg-sunken/60" : "bg-surface"
                  } ${r.strong ? "font-semibold" : ""}`}
                >
                  {r.label}
                </td>
                {s.months.map((m) => {
                  const v = m[r.key];
                  return (
                    <td
                      key={m.month}
                      className={`tnum px-3 py-2 text-right ${
                        m.isForecast ? "text-ink-faint" : ""
                      } ${v < 0 ? "text-bad" : ""} ${r.strong ? "font-semibold" : ""}`}
                    >
                      {formatNumOrDash(v)}
                    </td>
                  );
                })}
                <td
                  className={`tnum px-4 py-2 text-right font-medium ${
                    s.totals[r.key] < 0 ? "text-bad" : ""
                  }`}
                >
                  {formatNum(s.totals[r.key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="th mb-3">Base de datos</p>
          <dl className="space-y-1.5 text-sm">
            {[
              ["Movimientos", counts.movements],
              ["Clientes", counts.clients],
              ["Conceptos de coste", counts.concepts],
              ["Previsiones de cobro", counts.budgets],
              ["Liquidaciones", counts.settlements],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="tnum font-medium">{v as number}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card p-4 sm:col-span-2">
          <p className="th mb-3">Alcance de los datos</p>
          <p className="text-sm text-ink-muted">
            Desde{" "}
            <span className="tnum font-medium text-ink">
              {MONTHS_SHORT[(range.first?.month ?? 1) - 1]} {range.first?.year}
            </span>{" "}
            hasta{" "}
            <span className="tnum font-medium text-ink">
              {MONTHS_SHORT[(range.last?.month ?? 1) - 1]} {range.last?.year}
            </span>
            . Enero–julio de 2026 son datos reales; agosto–diciembre, previsión
            de la hoja 2 (en gris claro). Los meses en gris son previsión.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Ejecuta <code className="rounded bg-sunken px-1.5 py-0.5 text-xs">npm run verify</code>{" "}
            para ver la comparación celda a celda contra el Excel.
          </p>
        </div>
      </section>
    </main>
  );
}
