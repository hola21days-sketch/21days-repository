"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { commentStamp, isOverdue } from "@/lib/format";
import type { Card, Notice, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  cards: Card[];
  doneColumnId: string | null;
  pendingTasks: number;
  me: Profile;
  profileById: Record<string, Profile>;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Cabecera de cada cliente: cómo va el mes y los avisos importantes.
 * ---------------------------------------------------------------------------
 * Las cifras salen del propio tablero, así que no hay nada que mantener a
 * mano: cambian solas al mover tarjetas. Los avisos sí se escriben, y solo se
 * muestran los del mes en curso para que la cabecera no se llene de historia.
 */
export default function Resumen({ clientId, cards, doneColumnId, pendingTasks, me, profileById }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [draft, setDraft] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicioDeMes = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("client_notices")
      .select("*")
      .eq("client_id", clientId)
      .gte("created_at", inicioDeMes.toISOString())
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
    setError(null);
    const { data, error } = await supabase
      .from("client_notices")
      .insert({ client_id: clientId, body, author_id: me.id })
      .select("*")
      .single();
    if (error || !data) {
      setError("No se ha podido guardar el aviso.");
      return;
    }
    setNotices((prev) => [data as Notice, ...prev]);
    setAbierto(false);
  }

  async function quitar(notice: Notice) {
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    await supabase.from("client_notices").delete().eq("id", notice.id);
  }

  const publicados = cards.filter(
    (c) => doneColumnId && c.column_id === doneColumnId,
  ).length;
  const enCurso = cards.filter((c) => c.column_id !== doneColumnId).length;
  const atrasadas = cards.filter(
    (c) => c.column_id !== doneColumnId && isOverdue(c.due_date),
  ).length;

  const mes = `${MESES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  return (
    <section className="digest" aria-label="Resumen del cliente">
      <div className="digest__stats">
        <div className="stat">
          <span className="stat__num">{publicados}</span>
          <span className="stat__label">Vídeos en Report</span>
        </div>
        <div className="stat">
          <span className="stat__num">{enCurso}</span>
          <span className="stat__label">En producción</span>
        </div>
        <div className={atrasadas > 0 ? "stat stat--alerta" : "stat"}>
          <span className="stat__num">{atrasadas}</span>
          <span className="stat__label">Entregas pasadas</span>
        </div>
        <div className="stat">
          <span className="stat__num">{pendingTasks}</span>
          <span className="stat__label">Tareas pendientes</span>
        </div>
      </div>

      <div className="digest__notices">
        <div className="digest__head">
          <span className="digest__title">Avisos de {mes}</span>
          <button type="button" className="btn btn--ghost" onClick={() => setAbierto((o) => !o)}>
            {abierto ? "Cancelar" : "+ Aviso"}
          </button>
        </div>

        {error && <div className="notice notice--error">{error}</div>}

        {abierto && (
          <div className="digest__new">
            <input
              className="input-inline"
              autoFocus
              placeholder="Ej.: el cliente cierra por vacaciones del 5 al 15"
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
            <button type="button" className="btn btn--primary" onClick={() => void añadir()} disabled={!draft.trim()}>
              Guardar
            </button>
          </div>
        )}

        {notices.length === 0 && !abierto && (
          <p className="digest__empty">Sin avisos este mes.</p>
        )}

        <ul className="digest__list">
          {notices.map((n) => (
            <li key={n.id}>
              <span className="digest__dot" />
              <span className="digest__body">{n.body}</span>
              <span className="digest__meta">
                {profileById[n.author_id ?? ""]?.initials ?? "··"} · {commentStamp(n.created_at)}
              </span>
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
      </div>
    </section>
  );
}
