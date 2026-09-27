"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { BoardColumn, ClientTask, Prioridad, Profile } from "@/lib/types";

type ClienteDePanel = { id: string; name: string; kind: string; priority: Prioridad };

type Avance = {
  client_id: string;
  month: string;
  phase_key: string;
  done: boolean;
  done_by: string | null;
};

type Props = {
  clients: ClienteDePanel[];
  columns: BoardColumn[];
  profileById: Record<string, Profile>;
  me: Profile;
  onAbrirCliente: (clientId: string) => void;
  onPrioridadCliente: (clientId: string, priority: Prioridad) => void;
};

/** El día 1 del mes que se está mirando, que es como se guarda el avance. */
function primeroDeMes(salto: number): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + salto, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombreDeMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function finDeSemanaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function finDeMesISO(): string {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
}

/**
 * Panel de clientes: el estado de todas las cuentas en una pantalla.
 * ---------------------------------------------------------------------------
 * Arriba, la rejilla del mes: una fila por cliente y una casilla por fase
 * (Idear, Grabar, Editar, Programar, Report). Marcarla deja constancia de
 * quién la dio por hecha. Debajo, los pendientes de todos los clientes
 * agrupados por prioridad, con su responsable y su fecha de entrega.
 */
export default function Panel({
  clients,
  columns,
  profileById,
  me,
  onAbrirCliente,
  onPrioridadCliente,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [avance, setAvance] = useState<Avance[]>([]);
  const [cargando, setCargando] = useState(true);
  const [salto, setSalto] = useState(0);
  const [ventana, setVentana] = useState<"hoy" | "semana" | "mes" | "todo">("semana");

  const mes = primeroDeMes(salto);

  /** Las fases salen de las columnas, que son iguales para todos los clientes. */
  const fases = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const c of [...columns].sort((a, b) => a.position - b.position)) {
      if (!vistas.has(c.key)) vistas.set(c.key, c.label);
    }
    return [...vistas.entries()].map(([key, label]) => ({ key, label }));
  }, [columns]);

  const cargar = useCallback(async () => {
    const [t, a] = await Promise.all([
      supabase.from("client_tasks").select("*").eq("done", false),
      supabase.from("client_month_progress").select("*").eq("month", mes),
    ]);
    setTasks((t.data ?? []) as ClientTask[]);
    setAvance((a.data ?? []) as Avance[]);
    setCargando(false);
  }, [supabase, mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hecho = useCallback(
    (clientId: string, phase: string) =>
      avance.find((a) => a.client_id === clientId && a.phase_key === phase),
    [avance],
  );

  async function marcar(clientId: string, phase: string, valor: boolean) {
    const fila: Avance = {
      client_id: clientId,
      month: mes,
      phase_key: phase,
      done: valor,
      done_by: valor ? me.id : null,
    };
    setAvance((prev) => [
      ...prev.filter((a) => !(a.client_id === clientId && a.phase_key === phase)),
      fila,
    ]);
    await supabase.from("client_month_progress").upsert(
      { ...fila, done_at: valor ? new Date().toISOString() : null },
      { onConflict: "client_id,month,phase_key" },
    );
  }

  const hoy = hoyISO();
  const topes = { hoy, semana: finDeSemanaISO(), mes: finDeMesISO(), todo: "9999-12-31" };

  const nombreDeCliente = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  /** Los pendientes de todos los clientes, ya ordenados. */
  const pendientes = useMemo(
    () =>
      tasks
        .filter((t) => !t.due_date || t.due_date <= topes[ventana] || t.due_date < hoy)
        .sort(
          (a, b) =>
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
            (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"),
        ),
    [tasks, ventana, topes, hoy],
  );

  const porPrioridad = useMemo(
    () =>
      PRIORIDADES.map((p) => ({
        ...p,
        items: pendientes.filter((t) => t.priority === p.key),
      })).filter((g) => g.items.length > 0),
    [pendientes],
  );

  const clientesOrdenados = useMemo(
    () =>
      [...clients].sort(
        (a, b) => pesoPrioridad(a.priority) - pesoPrioridad(b.priority) || a.name.localeCompare(b.name),
      ),
    [clients],
  );

  const atrasadas = tasks.filter((t) => t.due_date && t.due_date < hoy).length;
  const urgentes = tasks.filter((t) => t.priority === "urgente").length;
  const marcadas = avance.filter((a) => a.done).length;
  const totalCasillas = clients.length * fases.length;

  function filaDeTarea(t: ClientTask) {
    const quien = t.assignee_id ? profileById[t.assignee_id] : null;
    return (
      <li key={t.id}>
        <button type="button" className="panel__objetivo" onClick={() => onAbrirCliente(t.client_id)}>
          <Stamp label={initialsOf(nombreDeCliente[t.client_id] ?? "?")} color={stampColor(t.client_id)} />
          <span className="panel__objetivo-cuerpo">
            <span className="panel__objetivo-texto">{t.text}</span>
            <span className="panel__objetivo-meta">{nombreDeCliente[t.client_id] ?? "Cliente"}</span>
          </span>
          {quien ? (
            <span className="panel__quien">
              <Stamp label={quien.initials} color={quien.color} title={quien.full_name} />
              {quien.full_name.split(" ")[0]}
            </span>
          ) : (
            <span className="panel__quien is-libre">Sin asignar</span>
          )}
          {t.due_date ? (
            <span className={isOverdue(t.due_date) ? "panel__due is-overdue" : "panel__due"}>
              {formatDue(t.due_date)}
            </span>
          ) : (
            <span className="panel__due is-vacio">Sin fecha</span>
          )}
        </button>
      </li>
    );
  }

  return (
    <section className="panel">
      <div className="panel__cifras">
        <div className="panel__cifra">
          <span className="stat__num">
            {marcadas}
            <small>/{totalCasillas}</small>
          </span>
          <span className="stat__label">fases hechas este mes</span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{tasks.length}</span>
          <span className="stat__label">tareas abiertas</span>
        </div>
        <div className={atrasadas > 0 ? "panel__cifra is-alerta" : "panel__cifra"}>
          <span className="stat__num">{atrasadas}</span>
          <span className="stat__label">con la entrega pasada</span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{urgentes}</span>
          <span className="stat__label">urgentes</span>
        </div>
      </div>

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Avance de {nombreDeMes(mes)}</h2>
          <div className="report__nav">
            <button type="button" className="btn" onClick={() => setSalto((s) => s - 1)}>
              ←
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSalto((s) => Math.min(0, s + 1))}
              disabled={salto >= 0}
            >
              →
            </button>
          </div>
        </div>

        {cargando && <p className="panel__vacio">Cargando…</p>}

        {!cargando && (
          <div className="panel__rejillawrap">
            <table className="rejilla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Prioridad</th>
                  {fases.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesOrdenados.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <button type="button" className="rejilla__cliente" onClick={() => onAbrirCliente(c.id)}>
                        <Stamp label={initialsOf(c.name)} color={stampColor(c.id)} />
                        <span>
                          <span className="rejilla__nombre">{c.name}</span>
                          <span className="rejilla__tipo">{c.kind}</span>
                        </span>
                      </button>
                    </th>
                    <td>
                      <select
                        className={`input-inline rejilla__prio prio--${c.priority}`}
                        value={c.priority}
                        onChange={(e) => onPrioridadCliente(c.id, e.target.value as Prioridad)}
                        aria-label={`Prioridad de ${c.name}`}
                      >
                        {PRIORIDADES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.texto}
                          </option>
                        ))}
                      </select>
                    </td>
                    {fases.map((f) => {
                      const a = hecho(c.id, f.key);
                      const quien = a?.done_by ? profileById[a.done_by] : null;
                      return (
                        <td key={f.key} className={a?.done ? "rejilla__casilla is-hecha" : "rejilla__casilla"}>
                          <label title={quien ? `Marcado por ${quien.full_name}` : `${f.label} de ${c.name}`}>
                            <input
                              type="checkbox"
                              checked={!!a?.done}
                              onChange={(e) => void marcar(c.id, f.key, e.target.checked)}
                            />
                            {quien && <Stamp label={quien.initials} color={quien.color} title={quien.full_name} />}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Pendientes por prioridad</h2>
          <div className="report__switch">
            {(["hoy", "semana", "mes", "todo"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={ventana === v ? "tab is-active" : "tab"}
                onClick={() => setVentana(v)}
              >
                {v === "hoy" ? "Hoy" : v === "semana" ? "Esta semana" : v === "mes" ? "Este mes" : "Todo"}
              </button>
            ))}
          </div>
        </div>

        {!cargando && porPrioridad.length === 0 && (
          <p className="panel__vacio">No hay nada pendiente en este plazo.</p>
        )}

        {porPrioridad.map((g) => (
          <div key={g.key} className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className={`prio prio--${g.key}`}>{etiqueta(g.key)}</span>
              <span className="count-chip">{g.items.length}</span>
            </div>
            <ul className="panel__objetivos">{g.items.map(filaDeTarea)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
