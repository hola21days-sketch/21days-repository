"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { ClientTask, Prioridad, Profile } from "@/lib/types";

type Props = {
  me: Profile;
  profiles: Profile[];
  clientNames: Record<string, string>;
  onAbrirCliente: (clientId: string) => void;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-09-28" -> "hoy · lunes 28 de septiembre". */
function comoDia(iso: string, hoy: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerISO = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;
  const largo = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  if (iso === hoy) return `Hoy · ${largo}`;
  if (iso === ayerISO) return `Ayer · ${largo}`;
  return largo[0].toUpperCase() + largo.slice(1);
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lo mío y lo de cada uno.
 * ---------------------------------------------------------------------------
 * Arriba, mis tareas ordenadas por prioridad, con su cliente y su fecha de
 * entrega. Debajo, la misma información de todo el equipo en una tabla: qué
 * lleva cada persona, cuánto de ello es urgente y qué va con retraso. Lo ve
 * todo el mundo a propósito: así nadie tiene que preguntar quién va cargado.
 */
export default function MiPanel({ me, profiles, clientNames, onAbrirCliente }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mirando, setMirando] = useState<string>(me.id);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [diasAbiertos, setDiasAbiertos] = useState<Set<string>>(() => new Set([hoyISO()]));

  /**
   * Se traen también las hechas de los últimos quince días: marcarlas no las
   * hace desaparecer, se quedan tachadas para poder repasar de un vistazo lo
   * que ha salido esta semana.
   */
  const cargar = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 15);
    const { data } = await supabase
      .from("client_tasks")
      .select("*")
      .or(`done.eq.false,done_at.gte.${desde.toISOString()}`);
    setTasks((data ?? []) as ClientTask[]);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Las tareas se tocan desde el canal de cada cliente, así que esta pantalla
   * tiene que enterarse sola: sin esto había que salir y volver a entrar para
   * ver lo que acababa de asignarse.
   */
  useEffect(() => {
    const canal = supabase
      .channel("tareas-equipo")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_tasks" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, cargar]);

  // El menú del botón derecho se cierra con cualquier clic fuera.
  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [menu]);

  // Al cambiar de persona se suelta lo que hubiera marcado.
  useEffect(() => {
    setSeleccion(new Set());
  }, [mirando]);

  const hoy = hoyISO();

  /** Cambia la prioridad o la fecha sin salir de aquí. */
  async function guardar(task: ClientTask, patch: Partial<ClientTask>) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    await supabase.from("client_tasks").update(patch).eq("id", task.id);
  }

  /** Marcar y desmarcar. Nada se borra: lo hecho se queda tachado. */
  async function alternarHecha(task: ClientTask) {
    const done = !task.done;
    const done_at = done ? new Date().toISOString() : null;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done, done_at } : t)));
    await supabase.from("client_tasks").update({ done, done_at }).eq("id", task.id);
  }

  async function borrar(ids: string[]) {
    if (ids.length === 0) return;
    const cuantas = ids.length;
    if (
      !confirm(
        cuantas === 1
          ? "¿Borrar esta tarea? No se puede deshacer."
          : `¿Borrar ${cuantas} tareas? No se puede deshacer.`,
      )
    ) {
      return;
    }
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSeleccion(new Set());
    await supabase.from("client_tasks").delete().in("id", ids);
  }

  function alternarSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarDia(dia: string) {
    setDiasAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });
  }

  /** Clic derecho sobre una tarea: borrarla o marcarla para borrar en grupo. */
  function abrirMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setMenu({ id, x: e.clientX, y: e.clientY });
  }

  const equipo = useMemo(
    () =>
      profiles.map((p) => {
        const suyas = tasks.filter((t) => t.assignee_id === p.id && !t.done);
        const hechas = tasks.filter((t) => t.assignee_id === p.id && t.done);
        return {
          persona: p,
          total: suyas.length,
          urgentes: suyas.filter((t) => t.priority === "urgente").length,
          importantes: suyas.filter((t) => t.priority === "importante").length,
          atrasadas: suyas.filter((t) => t.due_date && t.due_date < hoy).length,
          hechas: hechas.length,
          proxima: suyas
            .filter((t) => t.due_date)
            .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0]?.due_date ?? null,
        };
      }),
    [profiles, tasks, hoy],
  );

  const sinAsignar = tasks.filter((t) => !t.assignee_id && !t.done);

  const delElegido = useMemo(
    () => tasks.filter((t) => (mirando === "" ? !t.assignee_id : t.assignee_id === mirando)),
    [tasks, mirando],
  );

  const hechas = useMemo(
    () =>
      delElegido
        .filter((t) => t.done)
        .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    [delElegido],
  );

  const suyas = useMemo(
    () =>
      delElegido
        .filter((t) => !t.done)
        .sort(
          (a, b) =>
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
            (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"),
        ),
    [delElegido],
  );

  /** Lo hecho, repartido por el día en que se marcó, de lo más reciente atrás. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, ClientTask[]>();
    for (const t of hechas) {
      const dia = (t.done_at ?? t.created_at).slice(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), t]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [hechas]);

  const porPrioridad = PRIORIDADES.map((p) => ({
    ...p,
    items: suyas.filter((t) => t.priority === p.key),
  })).filter((g) => g.items.length > 0);

  const quienMiro = mirando === "" ? null : profiles.find((p) => p.id === mirando);

  return (
    <section className="panel">
      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Reparto del equipo</h2>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void cargar()}
            title="Volver a leer las tareas"
          >
            Actualizar
          </button>
        </div>
        <p className="panel__pista">Pulsa sobre una persona para ver lo que lleva.</p>
        <div className="panel__rejillawrap">
          <table className="rejilla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Tareas</th>
                <th>Urgentes</th>
                <th>Importantes</th>
                <th>Atrasadas</th>
                <th>Hechas</th>
                <th>Próxima entrega</th>
              </tr>
            </thead>
            <tbody>
              {equipo.map((f) => (
                <tr
                  key={f.persona.id}
                  className={mirando === f.persona.id ? "is-mirando" : undefined}
                  onClick={() => setMirando(f.persona.id)}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="rejilla__cliente"
                      onClick={() => setMirando(f.persona.id)}
                      aria-pressed={mirando === f.persona.id}
                    >
                      <Stamp label={f.persona.initials} color={f.persona.color} />
                      <span>
                        <span className="rejilla__nombre">
                          {f.persona.full_name}
                          {f.persona.id === me.id && <em> · tú</em>}
                        </span>
                        <span className="rejilla__tipo">
                          {f.persona.role === "admin" ? "Administradora" : "Equipo"}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="rejilla__num">{f.total}</td>
                  <td className="rejilla__num">
                    {f.urgentes > 0 ? <span className="prio prio--urgente">{f.urgentes}</span> : "·"}
                  </td>
                  <td className="rejilla__num">
                    {f.importantes > 0 ? (
                      <span className="prio prio--importante">{f.importantes}</span>
                    ) : (
                      "·"
                    )}
                  </td>
                  <td className="rejilla__num">
                    {f.atrasadas > 0 ? <b className="is-rojo">{f.atrasadas}</b> : "·"}
                  </td>
                  <td className="rejilla__num">{f.hechas > 0 ? f.hechas : "·"}</td>
                  <td className="rejilla__num">{f.proxima ? formatDue(f.proxima) : "·"}</td>
                </tr>
              ))}
              {sinAsignar.length > 0 && (
                <tr className={mirando === "" ? "is-mirando" : undefined} onClick={() => setMirando("")}>
                  <th scope="row">
                    <button
                      type="button"
                      className="rejilla__cliente"
                      onClick={() => setMirando("")}
                      aria-pressed={mirando === ""}
                    >
                      <Stamp label="··" color="var(--ink-faint)" />
                      <span>
                        <span className="rejilla__nombre">Sin asignar</span>
                        <span className="rejilla__tipo">A repartir</span>
                      </span>
                    </button>
                  </th>
                  <td className="rejilla__num">{sinAsignar.length}</td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.priority === "urgente").length || "·"}
                  </td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.priority === "importante").length || "·"}
                  </td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.due_date && t.due_date < hoy).length || "·"}
                  </td>
                  <td className="rejilla__num">·</td>
                  <td className="rejilla__num">·</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {seleccion.size > 0 && (
        <div className="marcadas">
          <span>
            {seleccion.size} {seleccion.size === 1 ? "tarea marcada" : "tareas marcadas"}
          </span>
          <button type="button" className="btn" onClick={() => setSeleccion(new Set())}>
            Quitar la marca
          </button>
          <button
            type="button"
            className="btn marcadas__borrar"
            onClick={() => void borrar([...seleccion])}
          >
            Borrar {seleccion.size === 1 ? "la marcada" : "las marcadas"}
          </button>
        </div>
      )}

      {menu && (
        <div className="menu-canal" style={{ top: menu.y, left: menu.x }} role="menu">
          <button
            type="button"
            className="menu-canal__normal"
            onClick={() => {
              alternarSeleccion(menu.id);
              setMenu(null);
            }}
          >
            {seleccion.has(menu.id) ? "Quitar la marca" : "Marcar para borrar"}
          </button>
          {seleccion.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                void borrar([...seleccion]);
              }}
            >
              Borrar las {seleccion.size} marcadas
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              void borrar([id]);
            }}
          >
            Borrar esta tarea
          </button>
        </div>
      )}

      <div className="panel__bloque">
        <h2 className="panel__titulo panel__titulo--quien">
          {quienMiro ? (
            <>
              <Stamp label={quienMiro.initials} color={quienMiro.color} />
              {quienMiro.id === me.id ? "Lo mío" : `Lo de ${quienMiro.full_name.split(" ")[0]}`}
            </>
          ) : (
            "Sin asignar"
          )}
          <span className="count-chip">{suyas.length}</span>
        </h2>

        {cargando && <p className="panel__vacio">Cargando…</p>}
        {!cargando && suyas.length === 0 && hechas.length === 0 && (
          <p className="panel__vacio">Nada pendiente por aquí.</p>
        )}
        {!cargando && suyas.length === 0 && hechas.length > 0 && (
          <p className="panel__vacio">Todo hecho. Abajo tienes lo cerrado estos días.</p>
        )}

        {porPrioridad.map((g) => (
          <div key={g.key} className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className={`prio prio--${g.key}`}>{etiqueta(g.key)}</span>
              <span className="count-chip">{g.items.length}</span>
            </div>
            <ul className="panel__objetivos">
              {g.items.map((t) => (
                <li key={t.id}>
                  <div
                    className={
                      seleccion.has(t.id)
                        ? "panel__objetivo panel__objetivo--fijo is-marcada"
                        : "panel__objetivo panel__objetivo--fijo"
                    }
                    onContextMenu={(e) => abrirMenu(e, t.id)}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => void alternarHecha(t)}
                      title="Dar por hecha"
                      aria-label={`Dar por hecha: ${t.text}`}
                    />
                    <button
                      type="button"
                      className="panel__objetivo-cuerpo panel__objetivo-abrir"
                      onClick={() =>
                        seleccion.size > 0 ? alternarSeleccion(t.id) : onAbrirCliente(t.client_id)
                      }
                    >
                      <span className="panel__objetivo-texto">{t.text}</span>
                      <span className="panel__objetivo-meta">
                        <Stamp
                          label={initialsOf(clientNames[t.client_id] ?? "?")}
                          color={stampColor(t.client_id)}
                        />
                        {clientNames[t.client_id] ?? "Cliente"}
                      </span>
                    </button>

                    <select
                      className={`input-inline panel__prio prio--${t.priority}`}
                      value={t.priority}
                      onChange={(e) => void guardar(t, { priority: e.target.value as Prioridad })}
                      aria-label="Prioridad"
                    >
                      {PRIORIDADES.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.texto}
                        </option>
                      ))}
                    </select>

                    <input
                      className={
                        t.due_date && isOverdue(t.due_date)
                          ? "input-inline panel__fecha is-overdue"
                          : "input-inline panel__fecha"
                      }
                      type="date"
                      value={t.due_date ?? ""}
                      onChange={(e) => void guardar(t, { due_date: e.target.value || null })}
                      aria-label="Para cuándo"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {porDia.length > 0 && (
          <div className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className="prio prio--hecha">Hechas</span>
              <span className="count-chip">{hechas.length}</span>
              <span className="panel__grupo-nota">de los últimos 15 días</span>
            </div>

            {porDia.map(([dia, items]) => {
              const abierto = diasAbiertos.has(dia);
              return (
                <div key={dia} className="dia">
                  <button
                    type="button"
                    className={abierto ? "dia__cab is-abierto" : "dia__cab"}
                    onClick={() => alternarDia(dia)}
                    aria-expanded={abierto}
                  >
                    <span className="dia__flecha" aria-hidden>
                      ▸
                    </span>
                    <span className="dia__nombre">{comoDia(dia, hoy)}</span>
                    <span className="count-chip">{items.length}</span>
                  </button>

                  {abierto && (
                    <ul className="panel__objetivos dia__lista">
                      {items.map((t) => (
                        <li key={t.id}>
                          <div
                            className={
                              seleccion.has(t.id)
                                ? "panel__objetivo panel__objetivo--fijo is-hecha is-marcada"
                                : "panel__objetivo panel__objetivo--fijo is-hecha"
                            }
                            onContextMenu={(e) => abrirMenu(e, t.id)}
                          >
                            <input
                              type="checkbox"
                              checked
                              onChange={() => void alternarHecha(t)}
                              title="Devolver a pendientes"
                              aria-label={`Devolver a pendientes: ${t.text}`}
                            />
                            <button
                              type="button"
                              className="panel__objetivo-cuerpo panel__objetivo-abrir"
                              onClick={() =>
                                seleccion.size > 0
                                  ? alternarSeleccion(t.id)
                                  : onAbrirCliente(t.client_id)
                              }
                            >
                              <span className="panel__objetivo-texto">{t.text}</span>
                              <span className="panel__objetivo-meta">
                                <Stamp
                                  label={initialsOf(clientNames[t.client_id] ?? "?")}
                                  color={stampColor(t.client_id)}
                                />
                                {clientNames[t.client_id] ?? "Cliente"}
                              </span>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
}
