"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import { conEnlaces } from "@/lib/enlaces";
import type { ClientTask, DailyNote, Prioridad, Profile } from "@/lib/types";

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

/** «lleva 1 h 20 min» desde que alguien inició la tarea. */
function desdeCuando(inicio: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(inicio).getTime()) / 60000));
  if (minutos < 1) return "acaba de empezar";
  if (minutos < 60) return `lleva ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `lleva ${horas} h` : `lleva ${horas} h ${resto} min`;
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
  const [avisos, setAvisos] = useState<DailyNote[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mirando, setMirando] = useState<string>(me.id);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [diasAbiertos, setDiasAbiertos] = useState<Set<string>>(() => new Set([hoyISO()]));
  // Qué trozo de la lista se mira: lo de hoy, lo de la semana o todo.
  const [cuando, setCuando] = useState<"hoy" | "semana" | "todo">("todo");
  // Por prioridad (lo urgente arriba) o por fecha (lo que vence antes arriba).
  const [orden, setOrden] = useState<"prioridad" | "fecha">("prioridad");
  // Qué tarea tiene la explicación desplegada.
  const [desplegada, setDesplegada] = useState<string | null>(null);

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, Profile>,
    [profiles],
  );

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

    // Lo que se quedó a medias: lo pendiente de las dos últimas semanas.
    const { data: notas } = await supabase
      .from("daily_notes")
      .select("*")
      .eq("done", false)
      .gte("day", desde.toISOString().slice(0, 10))
      .order("day", { ascending: false });
    setAvisos((notas ?? []) as DailyNote[]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_notes" }, () => {
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

  /** Darlo por resuelto lo quita de la lista: ya no hay nada que avisar. */
  async function resolver(a: DailyNote) {
    setAvisos((prev) => prev.filter((x) => x.id !== a.id));
    await supabase
      .from("daily_notes")
      .update({ done: true, done_at: new Date().toISOString(), done_by: me.id })
      .eq("id", a.id);
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

  /**
   * Lo que se está haciendo en este momento: las tareas que alguien ha
   * iniciado y todavía no ha terminado. Va lo primero del panel porque es la
   * pregunta del día — ¿a qué está cada uno ahora mismo?
   */
  const enMarcha = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && t.started_at)
        .sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? "")),
    [tasks],
  );

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

  /**
   * Lo pendiente de quien se esté mirando. Lo que ya está en marcha sube del
   * todo: es lo que se está haciendo ahora, antes que ninguna prioridad.
   */
  const todasSuyas = useMemo(() => {
    // Sin fecha va al final en los dos órdenes: lo que no tiene día no corre.
    const sinFecha = "9999-99-99";
    return delElegido
      .filter((t) => !t.done)
      .sort((a, b) => {
        if (orden === "fecha") {
          return (
            (a.due_date ?? sinFecha).localeCompare(b.due_date ?? sinFecha) ||
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority)
          );
        }
        return (
          Number(!!b.started_at) - Number(!!a.started_at) ||
          pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
          (a.due_date ?? sinFecha).localeCompare(b.due_date ?? sinFecha)
        );
      });
  }, [delElegido, orden]);

  /** Lo que vence hoy o antes, y lo que vence de aquí a siete días. */
  const finDeSemana = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const deHoy = useMemo(
    () => todasSuyas.filter((t) => t.due_date && t.due_date <= hoy),
    [todasSuyas, hoy],
  );
  const deLaSemana = useMemo(
    () => todasSuyas.filter((t) => t.due_date && t.due_date <= finDeSemana),
    [todasSuyas, finDeSemana],
  );

  const suyas = cuando === "hoy" ? deHoy : cuando === "semana" ? deLaSemana : todasSuyas;

  /** Lo hecho, repartido por el día en que se marcó, de lo más reciente atrás. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, ClientTask[]>();
    for (const t of hechas) {
      const dia = (t.done_at ?? t.created_at).slice(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), t]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [hechas]);

  /**
   * Los bloques en que se parte la lista. Por prioridad salen Urgente,
   * Importante…; por fecha sale un bloque por día de entrega, y al final lo
   * que no tiene fecha puesta.
   */
  const grupos = useMemo(() => {
    if (orden === "prioridad") {
      return PRIORIDADES.map((p) => ({
        clave: p.key as string,
        titulo: p.texto,
        chip: `prio prio--${p.key}`,
        items: suyas.filter((t) => t.priority === p.key),
      })).filter((g) => g.items.length > 0);
    }
    const mapa = new Map<string, ClientTask[]>();
    for (const t of suyas) {
      const dia = t.due_date ?? "";
      mapa.set(dia, [...(mapa.get(dia) ?? []), t]);
    }
    return [...mapa.entries()]
      // El grupo sin fecha se queda el último, pase lo que pase.
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
      .map(([dia, items]) => ({
        clave: dia || "sin-fecha",
        titulo: dia ? comoDia(dia, hoy) : "Sin fecha",
        chip: dia && dia < hoy ? "prio prio--urgente" : "prio prio--hecha",
        items,
      }));
  }, [orden, suyas, hoy]);

  const quienMiro = mirando === "" ? null : profiles.find((p) => p.id === mirando);

  return (
    <section className="panel">
      {avisos.length > 0 && (
        <div className="panel__bloque">
          <div className="panel__cabecera">
            <h2 className="panel__titulo">Se quedó a medias</h2>
            <span className="count-chip">{avisos.length}</span>
          </div>
          <p className="panel__pista">
            Lo que cada uno apuntó al cerrar su jornada. Cuando esté retomado, dale a{" "}
            <b>Resuelto</b> y desaparece de aquí.
          </p>
          <ul className="medias">
            {avisos.map((a) => {
              const quien = profileById[a.profile_id];
              return (
                <li key={a.id} className="medias__fila">
                  {quien && (
                    <Stamp label={quien.initials} color={quien.color} title={quien.full_name} />
                  )}
                  <span className="medias__quien">
                    {quien ? quien.full_name.split(" ")[0] : "Alguien"}
                  </span>
                  <span className="medias__texto">{conEnlaces(a.text, a.id)}</span>
                  {a.client_id && (
                    <button
                      type="button"
                      className="marcha__cliente"
                      onClick={() => onAbrirCliente(a.client_id as string)}
                    >
                      {clientNames[a.client_id] ?? "cliente"}
                    </button>
                  )}
                  <span className="medias__dia">{comoDia(a.day, hoy)}</span>
                  <button type="button" className="task__accion" onClick={() => void resolver(a)}>
                    Resuelto
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">En marcha ahora mismo</h2>
          <span className="count-chip">{enMarcha.length}</span>
        </div>
        {enMarcha.length === 0 ? (
          <p className="panel__vacio">
            Nadie tiene ninguna tarea iniciada. Dentro de un cliente, en <b>Tareas</b>, se pulsa{" "}
            <b>Iniciar tarea</b> y aparece aquí.
          </p>
        ) : (
          <ul className="marcha">
            {enMarcha.map((t) => {
              const quien = t.started_by ? profileById[t.started_by] : null;
              return (
                <li key={t.id} className="marcha__fila">
                  {quien ? (
                    <Stamp label={quien.initials} color={quien.color} title={quien.full_name} />
                  ) : (
                    <Stamp label="?" color={stampColor(t.id)} />
                  )}
                  <span className="marcha__quien">
                    {quien ? quien.full_name.split(" ")[0] : "Alguien"}
                  </span>
                  <span className="marcha__texto">{t.text}</span>
                  <button
                    type="button"
                    className="marcha__cliente"
                    onClick={() => onAbrirCliente(t.client_id)}
                  >
                    {clientNames[t.client_id] ?? "cliente"}
                  </button>
                  {t.started_at && (
                    <span className="marcha__rato">{desdeCuando(t.started_at)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

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

        {/* Hoy, esta semana o todo. Empieza en «todo» a propósito: así nunca
            parece que falten tareas por un filtro que nadie ha tocado. */}
        <div className="panel__filtros">
          {(
            [
              ["hoy", "Para hoy", deHoy.length],
              ["semana", "Esta semana", deLaSemana.length],
              ["todo", "Todo", todasSuyas.length],
            ] as const
          ).map(([clave, texto, n]) => (
            <button
              key={clave}
              type="button"
              className={cuando === clave ? "chip is-activo" : "chip"}
              onClick={() => setCuando(clave)}
            >
              {texto} <span className="count-chip">{n}</span>
            </button>
          ))}

          <span className="panel__filtros-sep" />

          {(
            [
              ["prioridad", "Por prioridad"],
              ["fecha", "Por fecha"],
            ] as const
          ).map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              className={orden === clave ? "chip is-activo" : "chip"}
              onClick={() => setOrden(clave)}
            >
              {texto}
            </button>
          ))}
        </div>

        {cargando && <p className="panel__vacio">Cargando…</p>}
        {!cargando && suyas.length === 0 && hechas.length === 0 && (
          <p className="panel__vacio">Nada pendiente por aquí.</p>
        )}
        {!cargando && suyas.length === 0 && hechas.length > 0 && (
          <p className="panel__vacio">Todo hecho. Abajo tienes lo cerrado estos días.</p>
        )}

        {grupos.map((g) => (
          <div key={g.clave} className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className={g.chip}>{g.titulo}</span>
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
                    {/* Pulsar la tarea despliega su explicación aquí mismo. Ir
                        al canal del cliente es otro botón, abajo: al mirar tu
                        lista lo que quieres es leer, no cambiar de pantalla. */}
                    <button
                      type="button"
                      className="panel__objetivo-cuerpo panel__objetivo-abrir"
                      onClick={() =>
                        seleccion.size > 0
                          ? alternarSeleccion(t.id)
                          : setDesplegada((d) => (d === t.id ? null : t.id))
                      }
                      aria-expanded={desplegada === t.id}
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

                  {desplegada === t.id && (
                    <div className="explica">
                      <div className="explica__cab">
                        <span className="explica__cliente">
                          {clientNames[t.client_id] ?? "Cliente"}
                        </span>
                        {t.due_date && (
                          <span
                            className={
                              isOverdue(t.due_date) ? "panel__due is-overdue" : "panel__due"
                            }
                          >
                            Para {formatDue(t.due_date)}
                          </span>
                        )}
                      </div>

                      <p className="explica__titulo">{t.text}</p>

                      {t.notes ? (
                        // Los enlaces salen pulsables y el texto respeta los
                        // saltos de línea: es la explicación de la tarea, se
                        // lee tal como se escribió.
                        <div className="explica__texto">{conEnlaces(t.notes, t.id)}</div>
                      ) : (
                        <p className="explica__vacio">
                          Esta tarea no tiene explicación. Se escribe desde el canal del cliente,
                          en <b>Tareas</b>, pulsando sobre ella.
                        </p>
                      )}

                      <button
                        type="button"
                        className="btn btn--ghost explica__ir"
                        onClick={() => onAbrirCliente(t.client_id)}
                      >
                        Ir al canal de {clientNames[t.client_id] ?? "este cliente"} →
                      </button>
                    </div>
                  )}

                  {/* Iniciar y terminar desde aquí mismo: este es el panel donde
                      cada uno mira lo suyo, no hace falta entrar al cliente. */}
                  <div className="task__estado task__estado--panel">
                    {t.started_at ? (
                      <>
                        <span className="task__proceso">
                          En proceso · {desdeCuando(t.started_at)}
                        </span>
                        <button
                          type="button"
                          className="task__accion task__accion--fin"
                          onClick={() => void alternarHecha(t)}
                        >
                          Terminar proceso
                        </button>
                        <button
                          type="button"
                          className="task__accion task__accion--soltar"
                          onClick={() => void guardar(t, { started_at: null, started_by: null })}
                        >
                          Soltar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="task__accion"
                        onClick={() =>
                          void guardar(t, {
                            started_at: new Date().toISOString(),
                            started_by: me.id,
                            assignee_id: t.assignee_id ?? me.id,
                          })
                        }
                      >
                        ▶ Iniciar tarea
                      </button>
                    )}
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
