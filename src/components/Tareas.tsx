"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue } from "@/lib/format";
import type { ClientTask, Profile } from "@/lib/types";

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
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    onCount?.(tasks.filter((t) => !t.done).length);
  }, [tasks, onCount]);

  async function añadir() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    const position = (tasks.at(-1)?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("client_tasks")
      .insert({ client_id: clientId, text, position })
      .select("*")
      .single();
    if (error || !data) {
      setError("No se ha podido guardar la tarea.");
      return;
    }
    setTasks((prev) => [...prev, data as ClientTask]);
    setAbierta((data as ClientTask).id);
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

  const pendientes = tasks.filter((t) => !t.done);
  const hechas = tasks.filter((t) => t.done);

  function fila(t: ClientTask) {
    const responsable = t.assignee_id ? profileById[t.assignee_id] : null;
    const abierto = abierta === t.id;
    return (
      <li key={t.id} className={t.done ? "task is-done" : "task"}>
        <div className="task__row">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => void guardar(t, { done: !t.done })}
            aria-label={t.text}
          />
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
            className="input-inline"
            placeholder="Escribe una tarea y pulsa Intro"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void añadir();
              }
            }}
          />
          <button type="button" className="btn btn--primary" onClick={() => void añadir()} disabled={!draft.trim()}>
            Añadir
          </button>
        </div>

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
