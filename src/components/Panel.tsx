"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { destaca, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { BoardColumn, Card, ClientTask, Prioridad, Profile } from "@/lib/types";

type ClienteDePanel = {
  id: string;
  name: string;
  kind: string;
  priority: Prioridad;
};

type Props = {
  clients: ClienteDePanel[];
  cards: Card[];
  columns: BoardColumn[];
  doneColumnIds: Set<string>;
  profileById: Record<string, Profile>;
  onAbrirCliente: (clientId: string) => void;
  onPrioridadCliente: (clientId: string, priority: Prioridad) => void;
};

/** Un objetivo del listado: viene de una tarjeta del tablero o de una tarea. */
type Objetivo = {
  id: string;
  clientId: string;
  clientName: string;
  texto: string;
  fase: string;
  due: string | null;
  priority: Prioridad;
  asignados: Profile[];
  origen: "tablero" | "tarea";
};

/** Hoy en formato AAAA-MM-DD, que es como se guardan las entregas. */
function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Domingo de esta semana (la semana va de lunes a domingo). */
function finDeSemanaISO(): string {
  const d = new Date();
  const restan = 7 - ((d.getDay() + 6) % 7) - 1;
  d.setDate(d.getDate() + restan);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Último día de este mes. */
function finDeMesISO(): string {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
}

/**
 * Panel de clientes: todo lo que hay abierto, de un vistazo.
 * ---------------------------------------------------------------------------
 * Arriba, qué hay que cerrar hoy, esta semana y este mes, con los atrasos
 * primero. Abajo, una tarjeta por cliente con su prioridad, lo que lleva en
 * producción y lo que tiene pendiente. Las cifras salen del tablero y de las
 * listas de tareas: no hay nada que mantener a mano.
 */
export default function Panel({
  clients,
  cards,
  columns,
  doneColumnIds,
  profileById,
  onAbrirCliente,
  onPrioridadCliente,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ventana, setVentana] = useState<"hoy" | "semana" | "mes">("semana");

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("client_tasks").select("*").eq("done", false);
    setTasks((data ?? []) as ClientTask[]);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombreDeCliente = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );
  const faseDeColumna = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.label])),
    [columns],
  );

  /** Todo lo que sigue abierto, venga del tablero o de la lista de tareas. */
  const objetivos = useMemo<Objetivo[]>(() => {
    const deTablero: Objetivo[] = cards
      .filter((c) => !doneColumnIds.has(c.column_id))
      .map((c) => ({
        id: `card-${c.id}`,
        clientId: c.client_id,
        clientName: nombreDeCliente[c.client_id] ?? "Cliente",
        texto: c.title,
        fase: faseDeColumna[c.column_id] ?? "",
        due: c.due_date,
        priority: c.priority,
        asignados: c.assignees.map((id) => profileById[id]).filter(Boolean),
        origen: "tablero",
      }));

    const deTareas: Objetivo[] = tasks.map((t) => ({
      id: `task-${t.id}`,
      clientId: t.client_id,
      clientName: nombreDeCliente[t.client_id] ?? "Cliente",
      texto: t.text,
      fase: "Tarea",
      due: t.due_date,
      priority: t.priority,
      asignados: t.assignee_id && profileById[t.assignee_id] ? [profileById[t.assignee_id]] : [],
      origen: "tarea",
    }));

    return [...deTablero, ...deTareas].sort(
      (a, b) =>
        pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
        (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99") ||
        a.clientName.localeCompare(b.clientName),
    );
  }, [cards, tasks, doneColumnIds, nombreDeCliente, faseDeColumna, profileById]);

  const hoy = hoyISO();
  const topes = { hoy, semana: finDeSemanaISO(), mes: finDeMesISO() };

  const atrasados = objetivos.filter((o) => o.due && o.due < hoy);
  const enPlazo = objetivos.filter((o) => o.due && o.due >= hoy && o.due <= topes[ventana]);
  const sinFecha = objetivos.filter((o) => !o.due);

  const urgentes = objetivos.filter((o) => o.priority === "urgente");

  /** Cifras de cada cliente, para su tarjeta del panel. */
  const porCliente = useMemo(
    () =>
      clients
        .map((c) => {
          const suyos = objetivos.filter((o) => o.clientId === c.id);
          return {
            ...c,
            abiertos: suyos.length,
            urgentes: suyos.filter((o) => o.priority === "urgente").length,
            importantes: suyos.filter((o) => o.priority === "importante").length,
            atrasados: suyos.filter((o) => o.due && o.due < hoy).length,
            estaSemana: suyos.filter((o) => o.due && o.due >= hoy && o.due <= topes.semana).length,
            tareas: suyos.filter((o) => o.origen === "tarea").length,
          };
        })
        .sort(
          (a, b) =>
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
            b.atrasados - a.atrasados ||
            b.urgentes - a.urgentes ||
            a.name.localeCompare(b.name),
        ),
    [clients, objetivos, hoy, topes.semana],
  );

  function listaDeObjetivos(items: Objetivo[], vacio: string) {
    if (items.length === 0) return <p className="panel__vacio">{vacio}</p>;
    return (
      <ul className="panel__objetivos">
        {items.map((o) => (
          <li key={o.id}>
            <button type="button" className="panel__objetivo" onClick={() => onAbrirCliente(o.clientId)}>
              <Stamp label={initialsOf(o.clientName)} color={stampColor(o.clientId)} />
              <span className="panel__objetivo-cuerpo">
                <span className="panel__objetivo-texto">{o.texto}</span>
                <span className="panel__objetivo-meta">
                  {o.clientName} · {o.fase}
                </span>
              </span>
              {destaca(o.priority) && (
                <span className={`prio prio--${o.priority}`}>
                  {o.priority === "urgente" ? "Urgente" : "Importante"}
                </span>
              )}
              {o.asignados.length > 0 && (
                <span className="avatar-stack">
                  {o.asignados.map((p) => (
                    <Stamp key={p.id} label={p.initials} color={p.color} title={p.full_name} />
                  ))}
                </span>
              )}
              {o.due && (
                <span className={isOverdue(o.due) ? "panel__due is-overdue" : "panel__due"}>
                  {formatDue(o.due)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="panel">
      <div className="panel__cifras">
        <div className="panel__cifra">
          <span className="stat__num">{objetivos.length}</span>
          <span className="stat__label">abiertos en total</span>
        </div>
        <div className={atrasados.length > 0 ? "panel__cifra is-alerta" : "panel__cifra"}>
          <span className="stat__num">{atrasados.length}</span>
          <span className="stat__label">con la entrega pasada</span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{urgentes.length}</span>
          <span className="stat__label">marcados como urgentes</span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{clients.length}</span>
          <span className="stat__label">clientes activos</span>
        </div>
      </div>

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Objetivos</h2>
          <div className="report__switch">
            {(["hoy", "semana", "mes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={ventana === v ? "tab is-active" : "tab"}
                onClick={() => setVentana(v)}
              >
                {v === "hoy" ? "Para hoy" : v === "semana" ? "Esta semana" : "Este mes"}
              </button>
            ))}
          </div>
        </div>

        {cargando && <p className="panel__vacio">Cargando…</p>}

        {!cargando && (
          <>
            {atrasados.length > 0 && (
              <>
                <div className="drawer__label">Atrasados · {atrasados.length}</div>
                {listaDeObjetivos(atrasados, "")}
              </>
            )}

            <div className="drawer__label" style={{ marginTop: atrasados.length > 0 ? "1rem" : 0 }}>
              {ventana === "hoy"
                ? "Para hoy"
                : ventana === "semana"
                  ? "Hasta el domingo"
                  : "Hasta final de mes"}{" "}
              · {enPlazo.length}
            </div>
            {listaDeObjetivos(
              enPlazo,
              ventana === "hoy"
                ? "Nada con entrega para hoy."
                : "Nada con entrega en este plazo.",
            )}

            {sinFecha.length > 0 && (
              <>
                <div className="drawer__label" style={{ marginTop: "1rem" }}>
                  Sin fecha · {sinFecha.length}
                </div>
                {listaDeObjetivos(sinFecha, "")}
              </>
            )}
          </>
        )}
      </div>

      <div className="panel__bloque">
        <h2 className="panel__titulo">Clientes</h2>
        <div className="panel__rejilla">
          {porCliente.map((c) => (
            <article key={c.id} className="panel__cliente">
              <header className="panel__cliente-cab">
                <button type="button" className="panel__cliente-nombre" onClick={() => onAbrirCliente(c.id)}>
                  <Stamp label={initialsOf(c.name)} color={stampColor(c.id)} />
                  <span>
                    <span className="panel__cliente-titulo">{c.name}</span>
                    <span className="panel__cliente-tipo">{c.kind}</span>
                  </span>
                </button>
              </header>

              <select
                className="input-inline panel__cliente-prio"
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

              <dl className="panel__cliente-datos">
                <div>
                  <dt>Abiertos</dt>
                  <dd>{c.abiertos}</dd>
                </div>
                <div className={c.atrasados > 0 ? "is-alerta" : undefined}>
                  <dt>Atrasados</dt>
                  <dd>{c.atrasados}</dd>
                </div>
                <div>
                  <dt>Esta semana</dt>
                  <dd>{c.estaSemana}</dd>
                </div>
                <div>
                  <dt>Urgentes</dt>
                  <dd>{c.urgentes}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
