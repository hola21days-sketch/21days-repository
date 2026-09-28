"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { conEnlaces } from "@/lib/enlaces";
import { formatDue, isOverdue } from "@/lib/format";
import type { PersonalNote, Profile } from "@/lib/types";

type Props = { me: Profile };

/**
 * Agenda personal.
 * ---------------------------------------------------------------------------
 * Lo de cada uno que no es trabajo: el dentista, la revisión del coche, llamar
 * a tu madre. No aparece en ningún panel del equipo ni en los informes.
 *
 * Es privada de verdad, no solo escondida: la base de datos solo deja leer y
 * escribir las filas propias, así que nadie la ve aunque sea administrador y
 * aunque se salte la pantalla.
 */
export default function Agenda({ me }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [notas, setNotas] = useState<PersonalNote[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase
      .from("personal_notes")
      .select("*")
      .eq("profile_id", me.id)
      .order("done")
      .order("due_date", { nullsFirst: false })
      .order("created_at");
    if (fallo) setError("No se ha podido cargar la agenda.");
    else setNotas((data ?? []) as PersonalNote[]);
    setCargando(false);
  }, [supabase, me.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function añadir() {
    const t = texto.trim();
    if (guardando) return;
    if (!t) {
      campoRef.current?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    const { data, error: fallo } = await supabase
      .from("personal_notes")
      .insert({
        profile_id: me.id,
        text: t,
        due_date: fecha || null,
        position: Math.max(0, ...notas.map((n) => n.position)) + 1,
      })
      .select("*")
      .single();
    setGuardando(false);
    if (fallo || !data) {
      setError(`No se ha podido guardar. ${fallo?.message ?? ""}`.trim());
      return;
    }
    setNotas((prev) => [...prev, data as PersonalNote]);
    setTexto("");
    setFecha("");
    campoRef.current?.focus();
  }

  async function guardar(n: PersonalNote, patch: Partial<PersonalNote>) {
    setNotas((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...patch } : x)));
    const { error: fallo } = await supabase
      .from("personal_notes")
      .update(patch)
      .eq("id", n.id);
    if (fallo) setError("No se ha podido guardar el cambio.");
  }

  async function quitar(n: PersonalNote) {
    if (!confirm(`¿Borrar "${n.text}"?`)) return;
    setNotas((prev) => prev.filter((x) => x.id !== n.id));
    await supabase.from("personal_notes").delete().eq("id", n.id);
  }

  const pendientes = notas.filter((n) => !n.done);
  const hechas = notas.filter((n) => n.done);

  function fila(n: PersonalNote) {
    const abierto = abierta === n.id;
    return (
      <li key={n.id} className={n.done ? "task is-done" : "task"}>
        <div className="task__row">
          <input
            type="checkbox"
            checked={n.done}
            onChange={() =>
              void guardar(n, {
                done: !n.done,
                done_at: n.done ? null : new Date().toISOString(),
              })
            }
            aria-label={n.text}
          />
          <button
            type="button"
            className="task__text"
            onClick={() => setAbierta(abierto ? null : n.id)}
          >
            {n.text}
          </button>
          {n.due_date && (
            <span
              className={
                !n.done && isOverdue(n.due_date) ? "task__due is-rojo" : "task__due"
              }
            >
              {formatDue(n.due_date)}
            </span>
          )}
          {n.notes && !abierto && (
            <span className="task__flag" title="Tiene apuntes">
              ✎
            </span>
          )}
          <button
            type="button"
            className="checklist__remove"
            onClick={() => void quitar(n)}
            aria-label={`Borrar "${n.text}"`}
          >
            ✕
          </button>
        </div>

        {abierto && (
          <div className="task__panel">
            <div className="task__fields">
              <label className="task__field">
                <span>Para cuándo</span>
                <input
                  className="input-inline"
                  type="date"
                  value={n.due_date ?? ""}
                  onChange={(e) => void guardar(n, { due_date: e.target.value || null })}
                />
              </label>
            </div>
            <label className="task__field">
              <span>Apuntes</span>
              <textarea
                className="input-inline task__notes"
                defaultValue={n.notes}
                placeholder="Dirección, teléfono, enlace, lo que necesites recordar…"
                onBlur={(e) => {
                  if (e.target.value !== n.notes) void guardar(n, { notes: e.target.value });
                }}
              />
            </label>
            {n.notes && <div className="nota__leer">{conEnlaces(n.notes, n.id)}</div>}
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="tasks">
      <div className="tasks__panel">
        <div className="tasks__head">
          <h2 className="tasks__title">Mi agenda</h2>
          <span className="count-chip">{pendientes.length}</span>
        </div>

        <p className="claves__aviso">
          Tus cosas, no las del trabajo. <b>Solo las ves tú</b>: no salen en el panel del equipo,
          ni en los informes, ni las puede leer nadie más, tenga el perfil que tenga.
        </p>

        {error && <div className="notice notice--error">{error}</div>}

        <div className="tasks__new">
          <input
            ref={campoRef}
            className="input-inline tasks__campo"
            placeholder="Dentista, ITV del coche, llamar a…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void añadir();
              }
            }}
          />
          <input
            className="input-inline"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Para cuándo"
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

        {cargando && <div className="tasks__empty">Cargando…</div>}
        {!cargando && notas.length === 0 && (
          <div className="tasks__empty">
            Todavía no hay nada. Escribe lo primero que no quieras que se te olvide.
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
