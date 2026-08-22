"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, formatTime } from "@/lib/format";
import type { DirectMessage, Profile } from "@/lib/types";

type Props = {
  me: Profile;
  profiles: Profile[];
  /** Con quién se abre la conversación al entrar (si venimos de una mención). */
  inicial?: string | null;
  onUnread: (n: number) => void;
};

/**
 * Mensajes directos entre miembros del equipo: la lista de compañeros a la
 * izquierda y la conversación a la derecha. Nadie más los ve — la base de
 * datos solo devuelve las filas en las que sales como remitente o destinatario.
 */
export default function MensajesDirectos({ me, profiles, inicial, onUnread }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const compañeros = useMemo(
    () => profiles.filter((p) => p.id !== me.id).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles, me.id],
  );

  const [mensajes, setMensajes] = useState<DirectMessage[]>([]);
  const [conId, setConId] = useState<string | null>(inicial ?? compañeros[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [cargando, setCargando] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const con = conId ? compañeros.find((p) => p.id === conId) ?? null : null;

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("dm_messages")
      .select("*")
      .order("created_at")
      .limit(500);
    setMensajes((data ?? []) as DirectMessage[]);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
    const canal = supabase
      .channel("dm")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages" },
        () => void cargar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, cargar]);

  /** Los que me han escrito y todavía no he abierto. */
  const sinLeer = useMemo(() => {
    const por: Record<string, number> = {};
    for (const m of mensajes) {
      if (m.recipient_id === me.id && !m.read_at) por[m.sender_id] = (por[m.sender_id] ?? 0) + 1;
    }
    return por;
  }, [mensajes, me.id]);

  useEffect(() => {
    onUnread(Object.values(sinLeer).reduce((a, b) => a + b, 0));
  }, [sinLeer, onUnread]);

  const hilo = useMemo(
    () =>
      conId
        ? mensajes.filter(
            (m) =>
              (m.sender_id === me.id && m.recipient_id === conId) ||
              (m.sender_id === conId && m.recipient_id === me.id),
          )
        : [],
    [mensajes, conId, me.id],
  );

  /** Al abrir un hilo, marcar como leídos los suyos. */
  useEffect(() => {
    if (!conId) return;
    const pendientes = hilo.filter((m) => m.recipient_id === me.id && !m.read_at).map((m) => m.id);
    if (pendientes.length === 0) return;
    void supabase
      .from("dm_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", pendientes);
  }, [supabase, conId, hilo, me.id]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [hilo.length, conId]);

  async function enviar() {
    const texto = draft.trim();
    if (!texto || !conId) return;
    setDraft("");
    const { data } = await supabase
      .from("dm_messages")
      .insert({ sender_id: me.id, recipient_id: conId, body: texto })
      .select("*")
      .single();
    if (data) setMensajes((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as DirectMessage]));
  }

  async function guardarEdicion(id: string) {
    const texto = borrador.trim();
    setEditando(null);
    if (!texto) return;
    await supabase
      .from("dm_messages")
      .update({ body: texto, edited_at: new Date().toISOString() })
      .eq("id", id);
    void cargar();
  }

  async function borrar(id: string) {
    setMensajes((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("dm_messages").delete().eq("id", id);
  }

  let ultimoDia = "";

  return (
    <section className="dm">
      <aside className="dm__gente">
        <div className="dm__gente-titulo">Equipo</div>
        <ul>
          {compañeros.length === 0 && (
            <li className="dm__vacio">Todavía no hay nadie más en la bitácora.</li>
          )}
          {compañeros.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === conId ? "dm__persona is-active" : "dm__persona"}
                onClick={() => setConId(p.id)}
              >
                <Stamp label={p.initials} color={p.color} />
                <span className="dm__persona-nombre">{p.full_name}</span>
                {sinLeer[p.id] > 0 && <span className="count-chip">{sinLeer[p.id]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="dm__hilo">
        {!con && <div className="empty">Elige a alguien del equipo para empezar a hablar.</div>}

        {con && (
          <>
            <div className="dm__hilo-cabecera">
              <Stamp label={con.initials} color={con.color} />
              <div>
                <div className="dm__hilo-nombre">{con.full_name}</div>
                <div className="dm__hilo-sub">Conversación privada · solo la veis vosotros dos</div>
              </div>
            </div>

            <div className="chat__log" ref={logRef}>
              {cargando && <div className="empty">Cargando…</div>}
              {!cargando && hilo.length === 0 && (
                <div className="empty">Aún no os habéis escrito. Rompe el hielo.</div>
              )}
              {hilo.map((m) => {
                const dia = dayLabel(m.created_at);
                const separa = dia !== ultimoDia;
                ultimoDia = dia;
                const quien = m.sender_id === me.id ? me : con;
                const mio = m.sender_id === me.id;
                return (
                  <div key={m.id}>
                    {separa && <div className="chat__divider">{dia}</div>}
                    <div className="msg">
                      <Stamp label={quien.initials} color={quien.color} title={quien.full_name} />
                      <div className="msg__body">
                        <div className="msg__head">
                          <span className="msg__author">{quien.full_name}</span>
                          <span className="msg__time">{formatTime(m.created_at)}</span>
                          {m.edited_at && <span className="msg__time">· editado</span>}
                          {mio && editando !== m.id && (
                            <span className="msg__acciones">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditando(m.id);
                                  setBorrador(m.body);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm("¿Borrar este mensaje?")) void borrar(m.id);
                                }}
                              >
                                Borrar
                              </button>
                            </span>
                          )}
                        </div>
                        {editando === m.id ? (
                          <div className="msg__edit">
                            <textarea
                              className="input-inline"
                              autoFocus
                              value={borrador}
                              onChange={(e) => setBorrador(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditando(null);
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void guardarEdicion(m.id);
                                }
                              }}
                            />
                            <div className="msg__editacciones">
                              <button
                                type="button"
                                className="btn btn--primary"
                                onClick={() => void guardarEdicion(m.id)}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() => setEditando(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="msg__text">{m.body}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="composer">
              <div className="composer__field">
                <textarea
                  className="composer__input"
                  rows={1}
                  value={draft}
                  placeholder={`Escribe a ${con.full_name.split(" ")[0]}…`}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 90)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                />
                <button
                  type="button"
                  className="composer__send"
                  onClick={() => void enviar()}
                  disabled={!draft.trim()}
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
