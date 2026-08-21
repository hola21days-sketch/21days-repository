"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isOverdue } from "@/lib/format";
import type { Card, Notice, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  cards: Card[];
  doneColumnId: string | null;
  pendingTasks: number;
  me: Profile;
};

/**
 * Una línea con cómo va el cliente y sus avisos del mes.
 * ---------------------------------------------------------------------------
 * Va apretada a propósito: es una cinta de estado, no un panel. Las cifras
 * salen del tablero (nada que mantener a mano) y solo se enseña lo que tiene
 * algo que decir: si no hay atrasos ni avisos, esos huecos no ocupan sitio.
 * Los avisos se despliegan al pulsar, para no robarle alto al tablero.
 */
export default function Resumen({ clientId, cards, doneColumnId, pendingTasks, me }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [draft, setDraft] = useState("");

  const inicioDeMes = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("client_notices")
      .select("*")
      .eq("client_id", clientId)
      .gte("created_at", inicioDeMes)
      .order("created_at", { ascending: false });
    setNotices((data ?? []) as Notice[]);
  }, [supabase, clientId, inicioDeMes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function añadir() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { data } = await supabase
      .from("client_notices")
      .insert({ client_id: clientId, body, author_id: me.id })
      .select("*")
      .single();
    if (data) setNotices((prev) => [data as Notice, ...prev]);
  }

  async function quitar(notice: Notice) {
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    await supabase.from("client_notices").delete().eq("id", notice.id);
  }

  const enReport = cards.filter((c) => doneColumnId && c.column_id === doneColumnId).length;
  const enCurso = cards.filter((c) => c.column_id !== doneColumnId).length;
  const atrasadas = cards.filter(
    (c) => c.column_id !== doneColumnId && isOverdue(c.due_date),
  ).length;

  return (
    <section className="digest" aria-label="Estado del cliente">
      <div className="digest__line">
        <span className="digest__stat">
          <b>{enCurso}</b> en producción
        </span>
        <span className="digest__stat">
          <b>{enReport}</b> en report
        </span>
        {atrasadas > 0 && (
          <span className="digest__stat is-alerta">
            <b>{atrasadas}</b> con la entrega pasada
          </span>
        )}
        {pendingTasks > 0 && (
          <span className="digest__stat">
            <b>{pendingTasks}</b> tareas
          </span>
        )}

        <button
          type="button"
          className="digest__toggle"
          onClick={() => setAbierto((o) => !o)}
          aria-expanded={abierto}
        >
          {notices.length > 0 ? `Avisos del mes · ${notices.length}` : "Avisos del mes"}
        </button>
      </div>

      {abierto && (
        <div className="digest__panel">
          <div className="digest__new">
            <input
              className="input-inline"
              autoFocus
              placeholder="Ej.: cierran por vacaciones del 5 al 15"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void añadir();
                }
                if (e.key === "Escape") setAbierto(false);
              }}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void añadir()}
              disabled={!draft.trim()}
            >
              Añadir
            </button>
          </div>

          {notices.length === 0 ? (
            <p className="digest__empty">Nada apuntado este mes.</p>
          ) : (
            <ul className="digest__list">
              {notices.map((n) => (
                <li key={n.id}>
                  <span className="digest__dot" />
                  <span className="digest__body">{n.body}</span>
                  <button
                    type="button"
                    className="checklist__remove"
                    onClick={() => void quitar(n)}
                    aria-label="Quitar aviso"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
