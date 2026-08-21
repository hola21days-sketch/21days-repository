"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientTask } from "@/lib/types";

/**
 * Lista de pendientes propia de cada cliente.
 * ---------------------------------------------------------------------------
 * Es aparte del tablero a propósito: el tablero lleva los vídeos (Idear,
 * Grabar…) y esto es la lista suelta de recados de ese canal.
 */
export default function Tareas({ clientId, onCount }: { clientId: string; onCount?: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [draft, setDraft] = useState("");
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
  }

  async function marcar(task: ClientTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await supabase.from("client_tasks").update({ done: !task.done }).eq("id", task.id);
  }

  async function quitar(task: ClientTask) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await supabase.from("client_tasks").delete().eq("id", task.id);
  }

  const pendientes = tasks.filter((t) => !t.done);
  const hechas = tasks.filter((t) => t.done);

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
            Nada pendiente por aquí. Lo que apuntes se guarda solo para este cliente y lo ve todo el
            equipo.
          </div>
        )}

        <ul className="checklist tasks__list">
          {pendientes.map((t) => (
            <li key={t.id}>
              <input type="checkbox" checked={false} onChange={() => void marcar(t)} aria-label={t.text} />
              <span className="checklist__text">{t.text}</span>
              <button
                type="button"
                className="checklist__remove"
                onClick={() => void quitar(t)}
                aria-label={`Quitar "${t.text}"`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        {hechas.length > 0 && (
          <>
            <div className="drawer__label" style={{ marginTop: "1.1rem" }}>
              Hechas · {hechas.length}
            </div>
            <ul className="checklist tasks__list">
              {hechas.map((t) => (
                <li key={t.id} className="is-done">
                  <input type="checkbox" checked onChange={() => void marcar(t)} aria-label={t.text} />
                  <span className="checklist__text">{t.text}</span>
                  <button
                    type="button"
                    className="checklist__remove"
                    onClick={() => void quitar(t)}
                    aria-label={`Quitar "${t.text}"`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
