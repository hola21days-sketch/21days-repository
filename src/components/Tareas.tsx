"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue } from "@/lib/format";
import { destaca, etiqueta, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { ClientTask, Prioridad, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  profiles: Profile[];
  profileById: Record<string, Profile>;
  onCount?: (n: number) => void;
};

/**
 * Lista de pendientes propia de cada cliente.
 * ---------------------------------------------------------------------------
 * Es aparte del tablero a propósito: el tablero lleva los vídeos (Idear,
 * Grabar…) y esto es la lista suelta de recados de ese canal. Cada tarea puede
 * abrirse para poner quién la hace, las indicaciones y para cuándo.
 */
export default function Tareas({ clientId, profiles, profileById, onCount }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [draft, setDraft] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [reciente, setReciente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_id", clientId)
      .order("done")
      .order("position");
    setTasks((data ?? []) as ClientTask[]);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Lo que toque otra persona en este canal se ve aquí sin recargar. */
  useEffect(() => {
    const canal = supabase
      .channel(`tareas-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_tasks", filter: `client_id=eq.${clientId}` },
        () => {
          void cargar();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, clientId, cargar]);

  useEffect(() => {
    onCount?.(tasks.filter((t) => !t.done).length);
  }, [tasks, onCount]);

  /**
   * Añade una tarea y deja el campo listo para la siguiente. No se abre su
   * ficha: lo normal es escribir varias seguidas, y abrirla cada vez dejaba
   * el formulario enterrado bajo un panel.
   */
  async function añadir() {
    const text = draft.trim();
    if (guardando) return;
    // Sin texto no se añade nada, pero tampoco se deja el botón muerto: se
    // lleva el cursor al campo, que es lo que hace falta.
    if (!text) {
      campoRef.current?.focus();
      return;
    }
    setGuardando(true);
    setError(null);

    const position = Math.max(0, ...tasks.map((t) => t.position)) + 1;
    const { data, error } = await supabase
      .from("client_tasks")
      .insert({ client_id: clientId, text, position })
      .select("*")
      .single();

    setGuardando(false);
    if (error || !data) {
      // El texto no se borra: así no se pierde lo escrito si falla.
      setError(`No se ha podido guardar la tarea. ${error?.message ?? ""}`.trim());
      return;
    }

    const nueva = data as ClientTask;
    setTasks((prev) => [...prev, nueva]);
    setDraft("");
    campoRef.current?.focus();

    // La lista se ordena por prioridad, así que una tarea nueva no aparece
    // necesariamente al final: se resalta un momento y se lleva a la vista
    // para que se vea que ha entrado.
    setReciente(nueva.id);
    setTimeout(() => setReciente((r) => (r === nueva.id ? null : r)), 2500);
    setTimeout(() => {
      document
        .getElementById(`tarea-${nueva.id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
  }

  /** Guarda un cambio suelto de la tarea (responsable, indicaciones, fecha…). */
  async function guardar(task: ClientTask, patch: Partial<ClientTask>) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("client_tasks").update(patch).eq("id", task.id);
    if (error) setError("No se ha podido guardar el cambio.");
  }

  async function quitar(task: ClientTask) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await supabase.from("client_tasks").delete().eq("id", task.id);
  }

  // Lo urgente arriba; a igualdad de prioridad, manda la fecha de entrega y
  // después el orden en que se escribieron.
  const pendientes = tasks
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.position - b.position,
    );
  const hechas = tasks.filter((t) => t.done);

  function fila(t: ClientTask) {
    const responsable = t.assignee_id ? profileById[t.assignee_id] : null;
    const abierto = abierta === t.id;
    return (
      <li
        key={t.id}
        id={`tarea-${t.id}`}
        className={[t.done ? "task is-done" : "task", reciente === t.id ? "is-nueva" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="task__row">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() =>
              void guardar(t, {
                done: !t.done,
                done_at: t.done ? null : new Date().toISOString(),
              })
            }
            aria-label={t.text}
          />
          {destaca(t.priority) && (
            <span className={`prio prio--${t.priority}`} title={`Prioridad: ${t.priority}`}>
              {etiqueta(t.priority)}
            </span>
          )}
          <button type="button" className="task__text" onClick={() => setAbierta(abierto ? null : t.id)}>
            {t.text}
          </button>
          {responsable && (
            <Stamp
              label={responsable.initials}
              color={responsable.color}
              title={`Lo lleva ${responsable.full_name}`}
            />
          )}
          {t.due_date && <span className="task__due">{formatDue(t.due_date)}</span>}
          {t.notes && !abierto && <span className="task__flag" title="Tiene indicaciones">✎</span>}
          <button
            type="button"
            className="checklist__remove"
            onClick={() => void quitar(t)}
            aria-label={`Quitar "${t.text}"`}
          >
            ✕
          </button>
        </div>

        {abierto && (
          <div className="task__panel">
            <div className="task__fields">
              <label className="task__field">
                <span>Quién lo hace</span>
                <select
                  className="input-inline"
                  value={t.assignee_id ?? ""}
                  onChange={(e) => void guardar(t, { assignee_id: e.target.value || null })}
                >
                  <option value="">Sin asignar</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task__field">
                <span>Prioridad</span>
                <select
                  className="input-inline"
                  value={t.priority}
                  onChange={(e) => void guardar(t, { priority: e.target.value as Prioridad })}
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.texto}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task__field">
                <span>Para cuándo</span>
                <input
                  className="input-inline"
                  type="date"
                  value={t.due_date ?? ""}
                  onChange={(e) => void guardar(t, { due_date: e.target.value || null })}
                />
              </label>
            </div>

            <label className="task__field">
              <span>Indicaciones</span>
              <textarea
                className="input-inline task__notes"
                defaultValue={t.notes}
                placeholder="Cómo se hace, qué hace falta, enlaces, referencias…"
                onBlur={(e) => {
                  if (e.target.value !== t.notes) void guardar(t, { notes: e.target.value });
                }}
              />
            </label>
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="tasks">
      <div className="tasks__panel">
        <div className="tasks__head">
          <h2 className="tasks__title">Pendientes de este cliente</h2>
          <span className="count-chip">{pendientes.length}</span>
        </div>

        {error && <div className="notice notice--error">{error}</div>}

        <div className="tasks__new">
          <input
            ref={campoRef}
            className="input-inline tasks__campo"
            placeholder="Escribe una tarea y pulsa Intro o Añadir"
            value={draft}
            disabled={guardando}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void añadir();
              }
            }}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void añadir()}
            disabled={guardando}
          >
            {guardando ? "Añadiendo…" : "Añadir"}
          </button>
        </div>

        <p className="tasks__pista">
          Escribe y pulsa <b>Añadir</b> tantas veces como quieras: el campo se queda listo para la
          siguiente. Para poner quién la hace, la prioridad o la fecha, pulsa después sobre la
          tarea.
        </p>

        {loading && <div className="tasks__empty">Cargando…</div>}
        {!loading && tasks.length === 0 && (
          <div className="tasks__empty">
            Nada pendiente por aquí. Pulsa sobre una tarea para poner quién la hace y las
            indicaciones.
          </div>
        )}

        <ul className="tasks__list">{pendientes.map(fila)}</ul>

        {hechas.length > 0 && (
          <>
            <div className="drawer__label" style={{ marginTop: "1.1rem" }}>
              Hechas · {hechas.length}
            </div>
            <ul className="tasks__list">{hechas.map(fila)}</ul>
          </>
        )}
      </div>
    </section>
  );
}
