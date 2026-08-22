"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, formatSize, formatTime } from "@/lib/format";
import type { Attachment, Meeting, Message, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  clientName: string;
  messages: Message[];
  attachmentsByMessage: Record<string, Attachment[]>;
  profiles: Profile[];
  profileById: Record<string, Profile>;
  me: Profile;
  loading: boolean;
  pendingIds: Set<string>;
  uploading: string | null;
  onSend: (body: string, files: File[], mentions: string[]) => void;
  onEdit: (messageId: string, body: string) => void;
  onDelete: (messageId: string) => void;
};

/** Abre el fichero en una pestaña nueva con un enlace firmado de una hora. */
async function abrir(att: Attachment) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("adjuntos").createSignedUrl(att.path, 3600, {
    download: att.name,
  });
  if (error || !data) {
    alert("No se ha podido abrir el archivo. Vuelve a intentarlo.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Pinta el texto resaltando las menciones (@Nombre). */
function conMenciones(body: string, nombres: string[]) {
  if (nombres.length === 0) return body;
  const patron = new RegExp(`@(${nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const trozos = body.split(patron);
  return trozos.map((t, i) =>
    nombres.includes(t) ? (
      <span key={i} className="mention">
        @{t}
      </span>
    ) : (
      <span key={i}>{t}</span>
    ),
  );
}

export default function Chat({
  clientId,
  clientName,
  messages,
  attachmentsByMessage,
  profiles,
  profileById,
  me,
  loading,
  pendingIds,
  uploading,
  onSend,
  onEdit,
  onDelete,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [menciones, setMenciones] = useState<Profile[] | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [programando, setProgramando] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nombres = useMemo(() => profiles.map((p) => p.full_name), [profiles]);

  /** Sala fija del cliente: el enlace siempre es el mismo, sin cuentas ni claves. */
  const salaFija = useMemo(() => `https://meet.jit.si/bitacora-${clientId}`, [clientId]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, loading]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .not("starts_at", "is", null)
        .gte("starts_at", new Date(Date.now() - 3600000).toISOString())
        .order("starts_at");
      setMeetings((data ?? []) as Meeting[]);
    })();
  }, [supabase, clientId]);

  /** De "@ma" saca la lista de gente que encaja, para el desplegable. */
  function revisarMenciones(texto: string, cursor: number) {
    const antes = texto.slice(0, cursor);
    const arroba = antes.lastIndexOf("@");
    if (arroba === -1 || /\s/.test(antes.slice(arroba + 1))) {
      setMenciones(null);
      return;
    }
    const busca = antes.slice(arroba + 1).toLowerCase();
    const encajan = profiles.filter((p) => p.full_name.toLowerCase().includes(busca));
    setMenciones(encajan.length > 0 ? encajan.slice(0, 6) : null);
  }

  function elegirMencion(p: Profile) {
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const antes = draft.slice(0, cursor);
    const arroba = antes.lastIndexOf("@");
    const nuevo = `${draft.slice(0, arroba)}@${p.full_name} ${draft.slice(cursor)}`;
    setDraft(nuevo);
    setMenciones(null);
    inputRef.current?.focus();
  }

  function send() {
    const text = draft.trim();
    if (!text && files.length === 0) return;
    const mencionados = profiles.filter((p) => text.includes(`@${p.full_name}`)).map((p) => p.id);
    onSend(text, files, mencionados);
    setDraft("");
    setFiles([]);
    setMenciones(null);
    if (fileRef.current) fileRef.current.value = "";
    const input = inputRef.current;
    if (input) input.style.height = "auto";
  }

  async function programar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const cuando = String(datos.get("cuando") ?? "");
    const titulo = String(datos.get("titulo") ?? "").trim() || `Videollamada · ${clientName}`;
    if (!cuando) return;
    const url = `https://meet.jit.si/bitacora-${clientId}-${Math.random().toString(36).slice(2, 8)}`;
    const { data } = await supabase
      .from("meetings")
      .insert({
        client_id: clientId,
        title: titulo,
        url,
        starts_at: new Date(cuando).toISOString(),
        created_by: me.id,
      })
      .select("*")
      .single();
    if (data) {
      setMeetings((prev) => [...prev, data as Meeting]);
      onSend(
        `📹 ${titulo} — ${new Date(cuando).toLocaleString("es-ES", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}\n${url}`,
        [],
        [],
      );
    }
    setProgramando(false);
  }

  let lastDay = "";

  return (
    <section className="chat">
      <div className="callbar">
        <a className="btn btn--primary callbar__join" href={salaFija} target="_blank" rel="noopener">
          Entrar a la videollamada
        </a>
        <button type="button" className="btn" onClick={() => setProgramando((o) => !o)}>
          {programando ? "Cancelar" : "Programar una"}
        </button>

        {meetings.length > 0 && (
          <ul className="callbar__list">
            {meetings.map((m) => (
              <li key={m.id}>
                <a href={m.url} target="_blank" rel="noopener">
                  {m.title}
                </a>
                <span>
                  {m.starts_at &&
                    new Date(m.starts_at).toLocaleString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {programando && (
        <form className="callbar__form" onSubmit={programar}>
          <input className="input-inline" name="titulo" placeholder="Título (opcional)" />
          <input className="input-inline" name="cuando" type="datetime-local" required />
          <button type="submit" className="btn btn--primary">
            Programar
          </button>
        </form>
      )}

      <div className="chat__log" ref={logRef}>
        {loading && <div className="empty">Cargando la conversación…</div>}
        {!loading && messages.length === 0 && (
          <div className="empty">
            Aún no habéis hablado de este cliente. Escribe lo primero — solo lo ve el equipo.
          </div>
        )}
        {!loading &&
          messages.map((m) => {
            const day = dayLabel(m.created_at);
            const showDivider = day !== lastDay;
            lastDay = day;
            const author = profileById[m.author_id];
            const adjuntos = attachmentsByMessage[m.id] ?? [];
            const mio = m.author_id === me.id;
            return (
              <div key={m.id}>
                {showDivider && <div className="chat__divider">{day}</div>}
                <div className={pendingIds.has(m.id) ? "msg is-pending" : "msg"}>
                  <Stamp
                    label={author?.initials ?? "··"}
                    color={author?.color ?? "var(--ink-muted)"}
                    title={author?.full_name}
                  />
                  <div className="msg__body">
                    <div className="msg__head">
                      <span className="msg__author">{author?.full_name ?? "Alguien del equipo"}</span>
                      <span className="msg__time">{formatTime(m.created_at)}</span>
                      {m.edited_at && <span className="msg__time">· editado</span>}
                      {mio && !pendingIds.has(m.id) && editando !== m.id && (
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
                              if (confirm("¿Borrar este mensaje?")) onDelete(m.id);
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
                              if (borrador.trim()) onEdit(m.id, borrador.trim());
                              setEditando(null);
                            }
                          }}
                        />
                        <div className="msg__editacciones">
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => {
                              if (borrador.trim()) onEdit(m.id, borrador.trim());
                              setEditando(null);
                            }}
                          >
                            Guardar
                          </button>
                          <button type="button" className="btn btn--ghost" onClick={() => setEditando(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      m.body && <div className="msg__text">{conMenciones(m.body, nombres)}</div>
                    )}

                    {adjuntos.length > 0 && (
                      <ul className="files">
                        {adjuntos.map((a) => (
                          <li key={a.id}>
                            <button type="button" className="file" onClick={() => void abrir(a)}>
                              <span className="file__icon">{a.mime.startsWith("image/") ? "▣" : "▤"}</span>
                              <span className="file__body">
                                <span className="file__name">{a.name}</span>
                                <span className="file__meta">
                                  {formatSize(a.size_bytes)} · original, sin recomprimir
                                </span>
                              </span>
                              <span className="file__down">Descargar</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pendingIds.has(m.id) && uploading && (
                      <div className="file__progress">{uploading}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="composer">
        {files.length > 0 && (
          <ul className="composer__files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <span>
                  {f.name} <b>{formatSize(f.size)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {menciones && (
          <ul className="mentions">
            {menciones.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => elegirMencion(p)}>
                  <Stamp label={p.initials} color={p.color} />
                  <span>{p.full_name}</span>
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
              setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
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
          <textarea
            ref={inputRef}
            className="composer__input"
            rows={1}
            value={draft}
            placeholder="Escribe un mensaje al equipo… (@ para mencionar)"
            onChange={(e) => {
              setDraft(e.target.value);
              revisarMenciones(e.target.value, e.target.selectionStart ?? 0);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 90)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenciones(null);
              if (e.key === "Enter" && !e.shiftKey && !menciones) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="button"
            className="composer__send"
            onClick={send}
            disabled={(!draft.trim() && files.length === 0) || uploading !== null}
          >
            {uploading ? "Subiendo…" : "Enviar"}
          </button>
        </div>
        <div className="composer__hint">
          Solo lo ve el equipo. Los archivos se guardan tal cual —vídeo 4K, Excel, PDF— y se
          descargan igual que se subieron.
        </div>
      </div>
    </section>
  );
}
