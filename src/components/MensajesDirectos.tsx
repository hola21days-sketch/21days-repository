"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import Adjunto, { type ArchivoVisible } from "./Adjunto";
import GrabadorVoz from "./GrabadorVoz";
import { dayLabel, formatSize, formatTime } from "@/lib/format";
import { conEnlaces } from "@/lib/enlaces";
import { subirArchivo, ErrorDeSubida, MAX_MB } from "@/lib/subir";
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
  // Archivos y notas de voz, igual que en los canales.
  const [files, setFiles] = useState<File[]>([]);
  const [adjuntos, setAdjuntos] = useState<Record<string, ArchivoVisible[]>>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const con = conId ? compañeros.find((p) => p.id === conId) ?? null : null;

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("dm_messages")
      .select("*")
      .order("created_at")
      .limit(500);
    const lista = (data ?? []) as DirectMessage[];
    setMensajes(lista);

    // Los adjuntos de esos mensajes. La base de datos ya solo devuelve los de
    // conversaciones tuyas, así que no hay que filtrar nada aquí.
    if (lista.length > 0) {
      const { data: files } = await supabase
        .from("dm_attachments")
        .select("*")
        .in("message_id", lista.map((m) => m.id));
      const mapa: Record<string, ArchivoVisible[]> = {};
      for (const f of (files ?? []) as (ArchivoVisible & { message_id: string })[]) {
        mapa[f.message_id] = [...(mapa[f.message_id] ?? []), f];
      }
      setAdjuntos(mapa);
    }

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

  /**
   * Manda el mensaje y, si lleva archivos, los sube después.
   * Primero el mensaje y luego los ficheros a propósito: los adjuntos cuelgan
   * de él, y si la subida falla queda el texto, que es lo importante.
   */
  async function enviar() {
    const texto = draft.trim();
    const aSubir = files;
    if ((!texto && aSubir.length === 0) || !conId) return;
    setDraft("");
    setFiles([]);
    setError(null);

    const { data } = await supabase
      .from("dm_messages")
      .insert({ sender_id: me.id, recipient_id: conId, body: texto })
      .select("*")
      .single();
    if (!data) {
      setError("No se ha podido enviar el mensaje.");
      return;
    }
    const mensaje = data as DirectMessage;
    setMensajes((prev) => (prev.some((m) => m.id === mensaje.id) ? prev : [...prev, mensaje]));

    for (const f of aSubir) {
      setSubiendo(f.name);
      setProgreso(0);
      const ruta = `dm/${mensaje.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      try {
        await subirArchivo("adjuntos", ruta, f, (a) => setProgreso(Math.round(a.parte * 100)));
        const { data: fila } = await supabase
          .from("dm_attachments")
          .insert({
            message_id: mensaje.id,
            path: ruta,
            name: f.name,
            mime: f.type || "application/octet-stream",
            size_bytes: f.size,
          })
          .select("*")
          .single();
        if (fila) {
          const att = fila as ArchivoVisible;
          setAdjuntos((prev) => ({ ...prev, [mensaje.id]: [...(prev[mensaje.id] ?? []), att] }));
        }
      } catch (e) {
        const motivo = e instanceof ErrorDeSubida ? e.message : "se ha cortado la subida";
        setError(`No se ha podido subir ${f.name}: ${motivo}`);
      }
    }
    setSubiendo(null);
    setProgreso(null);
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
                <Stamp label={p.initials} color={p.color} foto={p.avatar_url} />
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
              <Stamp label={con.initials} color={con.color} foto={con.avatar_url} />
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
                      <Stamp label={quien.initials} color={quien.color} foto={quien.avatar_url} title={quien.full_name} />
                      <div className="msg__body">
                      {/* Misma barra que en los canales: sale al pasar por
                          encima, y siempre puesta en pantallas táctiles. */}
                      {mio && editando !== m.id && (
                        <div className="msg__barra">
                          <button
                            type="button"
                            className="msg__barra-op"
                            onClick={() => {
                              setEditando(m.id);
                              setBorrador(m.body);
                            }}
                            title="Editar el mensaje"
                          >
                            ✎ Editar
                          </button>
                          <button
                            type="button"
                            className="msg__barra-op msg__barra-op--borrar"
                            onClick={() => {
                              if (confirm("¿Borrar este mensaje? No se puede deshacer.")) {
                                void borrar(m.id);
                              }
                            }}
                            title="Borrar el mensaje"
                          >
                            🗑 Borrar
                          </button>
                        </div>
                      )}
                        <div className="msg__head">
                          <span className="msg__author">{quien.full_name}</span>
                          <span className="msg__time">{formatTime(m.created_at)}</span>
                          {m.edited_at && <span className="msg__time">· editado</span>}

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
                          <>
                            {m.body && (
                              <div className="msg__text">{conEnlaces(m.body, m.id)}</div>
                            )}
                            {(adjuntos[m.id] ?? []).length > 0 && (
                              <ul className="files">
                                {(adjuntos[m.id] ?? []).map((a) => (
                                  <li key={a.id}>
                                    <Adjunto att={a} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="composer">
              {error && <div className="notice notice--error">{error}</div>}

              {subiendo && (
                <p className="composer__aviso">
                  Subiendo {subiendo}
                  {progreso !== null ? ` · ${progreso}%` : "…"}
                </p>
              )}

              {files.length > 0 && (
                <ul className="composer__files">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      {f.name} <b>{formatSize(f.size)}</b>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, x) => x !== i))}
                        aria-label={`Quitar ${f.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="composer__field">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    const elegidos = Array.from(e.target.files ?? []);
                    const grandes = elegidos.filter((f) => f.size > MAX_MB * 1024 * 1024);
                    if (grandes.length > 0) {
                      setError(
                        `${grandes.map((f) => f.name).join(", ")}: pasan de ${MAX_MB} MB, que es el tope por archivo.`,
                      );
                    }
                    setFiles((prev) => [
                      ...prev,
                      ...elegidos.filter((f) => f.size <= MAX_MB * 1024 * 1024),
                    ]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="composer__clip"
                  onClick={() => fileRef.current?.click()}
                  title="Adjuntar archivos"
                  aria-label="Adjuntar archivos"
                >
                  📎
                </button>
                <GrabadorVoz
                  disabled={subiendo !== null}
                  onGrabado={(nota) => setFiles((prev) => [...prev, nota])}
                />
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
                  disabled={(!draft.trim() && files.length === 0) || subiendo !== null}
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
