"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, formatSize, formatTime, initialsOf, stampColor } from "@/lib/format";
import { MAX_BYTES, MAX_MB } from "@/lib/subir";
import type { Attachment, Meeting, Message, Profile, Transcript } from "@/lib/types";

type Props = {
  clientId: string;
  clientName: string;
  /** Enlace fijo de Google Meet de este cliente (vacío si aún no hay). */
  meetUrl: string;
  onMeetUrl: (url: string) => void;
  messages: Message[];
  attachmentsByMessage: Record<string, Attachment[]>;
  profiles: Profile[];
  /** Quién sigue a este cliente: son los que reciben el aviso de la reunión. */
  members: Profile[];
  profileById: Record<string, Profile>;
  me: Profile;
  loading: boolean;
  pendingIds: Set<string>;
  uploading: string | null;
  /** De 0 a 1 mientras sube un archivo. */
  progreso: number | null;
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

/** Deja el enlace de Google Meet en su forma canónica, o devuelve "" si no lo es. */
function limpiarMeet(texto: string): string {
  const t = texto.trim();
  const m = t.match(/(?:https?:\/\/)?meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[\w-]+)/i);
  return m ? `https://meet.google.com/${m[1]}` : "";
}

/** Enlace para meter la reunión en Google Calendar con un clic. */
function enlaceCalendario(titulo: string, cuando: Date, url: string): string {
  const sello = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const fin = new Date(cuando.getTime() + 30 * 60000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo,
    dates: `${sello(cuando)}/${sello(fin)}`,
    details: `Videollamada del equipo\n${url}`,
    location: url,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** ¿Es un archivo del que se puede sacar la voz? */
function tieneVoz(mime: string) {
  return mime.startsWith("video/") || mime.startsWith("audio/");
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
  meetUrl,
  onMeetUrl,
  messages,
  attachmentsByMessage,
  profiles,
  members,
  profileById,
  me,
  loading,
  pendingIds,
  uploading,
  progreso,
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
  const [transcripciones, setTranscripciones] = useState<Record<string, Transcript>>({});
  const [transcribiendo, setTranscribiendo] = useState<string | null>(null);
  const [filtroPersona, setFiltroPersona] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nombres = useMemo(() => profiles.map((p) => p.full_name), [profiles]);

  /**
   * Google Meet no deja inventarse el código de una sala: hay que abrirla desde
   * la propia cuenta de Google y pegar aquí el enlace. Eso es lo que hace el
   * botón "Crear en Google Meet" — abre una sala nueva y luego se pega.
   */
  const [pegando, setPegando] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [aviso, setAviso] = useState("");
  const [avisoArchivos, setAvisoArchivos] = useState("");

  async function guardarSala() {
    const url = limpiarMeet(enlace);
    if (!url) {
      setAviso("Eso no parece un enlace de Google Meet. Debe empezar por meet.google.com/");
      return;
    }
    setAviso("");
    await supabase.from("clients").update({ meet_url: url }).eq("id", clientId);
    onMeetUrl(url);
    setEnlace("");
    setPegando(false);
  }

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

  /** Trae las transcripciones que ya existan de este cliente. */
  const cargarTranscripciones = useCallback(async () => {
    const { data } = await supabase.from("transcripts").select("*").eq("client_id", clientId);
    if (data) {
      setTranscripciones(
        Object.fromEntries((data as Transcript[]).map((t) => [t.attachment_id, t])),
      );
    }
  }, [supabase, clientId]);

  useEffect(() => {
    void cargarTranscripciones();
  }, [cargarTranscripciones]);

  /**
   * Manda el archivo al servicio de transcripción. Descifra lo que se dice en
   * el vídeo, sea el idioma que sea, y lo traduce al castellano.
   */
  async function transcribir(att: Attachment) {
    setTranscribiendo(att.id);
    // Si algo falla, la propia función deja el motivo escrito en la fila,
    // así que basta con releerla para enseñarlo.
    await supabase.functions.invoke("transcribir", { body: { attachment_id: att.id } });
    await cargarTranscripciones();
    setTranscribiendo(null);
  }

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

  /**
   * Avisa por mensaje directo a todo el que sigue al cliente. La reunión ya
   * queda anunciada en el chat, pero el chat solo se ve si entras; el mensaje
   * directo lleva su aviso de sin leer y se ve desde cualquier pantalla.
   */
  async function avisarPorMensajeDirecto(titulo: string, cuando: Date, url: string) {
    // Si nadie sigue al cliente todavía, se avisa a todo el equipo.
    const destinatarios = (members.length > 0 ? members : profiles).filter((p) => p.id !== me.id);
    if (destinatarios.length === 0) return;

    const fecha = cuando.toLocaleString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const cuerpo =
      `📹 ${me.full_name} ha programado una videollamada de ${clientName}.\n` +
      `${titulo}\n${fecha}\n${url}\n` +
      `Añadir al calendario: ${enlaceCalendario(titulo, cuando, url)}`;

    await supabase.from("dm_messages").insert(
      destinatarios.map((p) => ({ sender_id: me.id, recipient_id: p.id, body: cuerpo })),
    );
  }

  async function programar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const cuando = String(datos.get("cuando") ?? "");
    const titulo = String(datos.get("titulo") ?? "").trim() || `Videollamada · ${clientName}`;
    if (!cuando) return;

    // El enlace de la reunión: el que se pegue en el formulario o, si no, el
    // enlace fijo del cliente. Sin enlace no se programa nada.
    const url = limpiarMeet(String(datos.get("enlace") ?? "")) || meetUrl;
    if (!url) {
      setAviso("Falta el enlace de Google Meet de la reunión.");
      return;
    }
    setAviso("");

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
      await avisarPorMensajeDirecto(titulo, new Date(cuando), url);
      onSend(
        `📹 ${titulo} — ${new Date(cuando).toLocaleString("es-ES", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}\n${url}\nAñadir al calendario: ${enlaceCalendario(titulo, new Date(cuando), url)}`,
        [],
        [],
      );
    }
    setProgramando(false);
  }

  /** Quién ha escrito en este canal, contando a la gente traída de Slack. */
  const autores = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const m of messages) {
      const nombre = m.author_id
        ? (profileById[m.author_id]?.full_name ?? "")
        : m.external_author;
      if (nombre) cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [messages, profileById]);

  const visibles = useMemo(() => {
    if (!filtroPersona) return messages;
    return messages.filter((m) => {
      const nombre = m.author_id
        ? (profileById[m.author_id]?.full_name ?? "")
        : m.external_author;
      return nombre === filtroPersona;
    });
  }, [messages, filtroPersona, profileById]);

  let lastDay = "";

  return (
    <section className="chat">
      <div className="callbar">
        {meetUrl ? (
          <a className="btn btn--primary callbar__join" href={meetUrl} target="_blank" rel="noopener">
            Entrar a la videollamada
          </a>
        ) : (
          <a
            className="btn btn--primary callbar__join"
            href="https://meet.google.com/new"
            target="_blank"
            rel="noopener"
            onClick={() => setPegando(true)}
          >
            Crear en Google Meet
          </a>
        )}

        <button type="button" className="btn" onClick={() => setProgramando((o) => !o)}>
          {programando ? "Cancelar" : "Programar una"}
        </button>

        <button type="button" className="btn btn--ghost" onClick={() => setPegando((o) => !o)}>
          {meetUrl ? "Cambiar el enlace" : "Pegar el enlace"}
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

      {pegando && (
        <div className="callbar__form">
          <input
            className="input-inline callbar__enlace"
            autoFocus
            placeholder="https://meet.google.com/abc-defg-hij"
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardarSala();
              }
              if (e.key === "Escape") setPegando(false);
            }}
          />
          <button type="button" className="btn btn--primary" onClick={() => void guardarSala()}>
            Guardar la sala
          </button>
          <a className="btn btn--ghost" href="https://meet.google.com/new" target="_blank" rel="noopener">
            Abrir Google Meet
          </a>
          <p className="callbar__pista">
            Google Meet no deja inventarse el código de una sala: ábrela con <b>Abrir Google
            Meet</b>, copia la dirección del navegador y pégala aquí. Queda guardada como la sala
            fija de {clientName}.
          </p>
        </div>
      )}

      {programando && (
        <form className="callbar__form" onSubmit={programar}>
          <input className="input-inline" name="titulo" placeholder="Título (opcional)" />
          <input className="input-inline" name="cuando" type="datetime-local" required />
          <input
            className="input-inline callbar__enlace"
            name="enlace"
            placeholder={
              meetUrl ? "Enlace de Meet (si no, se usa la sala fija)" : "https://meet.google.com/abc-defg-hij"
            }
          />
          <button type="submit" className="btn btn--primary">
            Programar
          </button>
          <a className="btn btn--ghost" href="https://meet.google.com/new" target="_blank" rel="noopener">
            Crear en Google Meet
          </a>
          <p className="callbar__pista">
            Al programarla se avisa por mensaje directo a quien sigue a {clientName}.
          </p>
        </form>
      )}

      {aviso && <p className="callbar__aviso">{aviso}</p>}

      {autores.length > 1 && (
        <div className="chat__gente">
          <button
            type="button"
            className={filtroPersona === "" ? "chat__quien is-on" : "chat__quien"}
            onClick={() => setFiltroPersona("")}
          >
            Todos <span>{messages.length}</span>
          </button>
          {autores.map(([nombre, n]) => (
            <button
              key={nombre}
              type="button"
              className={filtroPersona === nombre ? "chat__quien is-on" : "chat__quien"}
              onClick={() => setFiltroPersona(filtroPersona === nombre ? "" : nombre)}
            >
              <Stamp label={initialsOf(nombre)} color={stampColor(nombre)} />
              {nombre} <span>{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chat__log" ref={logRef}>
        {loading && <div className="empty">Cargando la conversación…</div>}
        {!loading && messages.length > 0 && visibles.length === 0 && (
          <div className="empty">{filtroPersona} no ha escrito nada en este canal.</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="empty">
            Aún no habéis hablado de este cliente. Escribe lo primero — solo lo ve el equipo.
          </div>
        )}
        {!loading &&
          visibles.map((m) => {
            const day = dayLabel(m.created_at);
            const showDivider = day !== lastDay;
            lastDay = day;
            const author = m.author_id ? profileById[m.author_id] : undefined;
            // Lo traído de Slack no tiene cuenta aquí: se enseña el nombre tal cual.
            const nombre = author?.full_name ?? m.external_author ?? "Alguien del equipo";
            const adjuntos = attachmentsByMessage[m.id] ?? [];
            const mio = m.author_id === me.id && m.source === "app";
            return (
              <div key={m.id}>
                {showDivider && <div className="chat__divider">{day}</div>}
                <div className={pendingIds.has(m.id) ? "msg is-pending" : "msg"}>
                  <Stamp
                    label={author?.initials ?? initialsOf(nombre)}
                    color={author?.color ?? stampColor(m.external_author || m.id)}
                    title={nombre}
                  />
                  <div className="msg__body">
                    <div className="msg__head">
                      <span className="msg__author">{nombre}</span>
                      <span className="msg__time">{formatTime(m.created_at)}</span>
                      {m.source === "slack" && (
                        <span className="msg__origen" title="Traído del histórico de Slack">
                          Slack
                        </span>
                      )}
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
                        {adjuntos.map((a) => {
                          const t = transcripciones[a.id];
                          return (
                            <li key={a.id}>
                              <button type="button" className="file" onClick={() => void abrir(a)}>
                                <span className="file__icon">
                                  {a.mime.startsWith("image/") ? "▣" : tieneVoz(a.mime) ? "▶" : "▤"}
                                </span>
                                <span className="file__body">
                                  <span className="file__name">{a.name}</span>
                                  <span className="file__meta">
                                    {formatSize(a.size_bytes)} · original, sin recomprimir
                                  </span>
                                </span>
                                <span className="file__down">Descargar</span>
                              </button>

                              {tieneVoz(a.mime) && (
                                <div className="transcripcion">
                                  {(!t || t.status === "error") && (
                                    <button
                                      type="button"
                                      className="btn btn--ghost transcripcion__pedir"
                                      onClick={() => void transcribir(a)}
                                      disabled={transcribiendo === a.id}
                                    >
                                      {transcribiendo === a.id
                                        ? "Escuchando el vídeo…"
                                        : "Transcribir y traducir"}
                                    </button>
                                  )}
                                  {t?.status === "error" && (
                                    <p className="transcripcion__error">{t.error}</p>
                                  )}
                                  {t?.status === "pendiente" && (
                                    <p className="transcripcion__meta">En marcha…</p>
                                  )}
                                  {t?.status === "listo" && (
                                    <div className="transcripcion__texto">
                                      <p className="transcripcion__meta">
                                        Transcripción{t.language ? ` · ${t.language}` : ""}
                                      </p>
                                      <p>{t.text}</p>
                                      {t.translation && (
                                        <>
                                          <p className="transcripcion__meta">Traducción al castellano</p>
                                          <p>{t.translation}</p>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {pendingIds.has(m.id) && uploading && (
                      <div className="file__progress">
                        <span>{uploading}</span>
                        <span className="file__bar" aria-hidden>
                          <span style={{ width: `${Math.round((progreso ?? 0) * 100)}%` }} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="composer">
        {avisoArchivos && (
          <p className="composer__aviso">
            {avisoArchivos}
            <button type="button" onClick={() => setAvisoArchivos("")} aria-label="Cerrar aviso">
              ✕
            </button>
          </p>
        )}

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
              const elegidos = Array.from(e.target.files ?? []);
              const caben = elegidos.filter((f) => f.size <= MAX_BYTES);
              const grandes = elegidos.filter((f) => f.size > MAX_BYTES);
              setFiles((prev) => [...prev, ...caben]);
              setAvisoArchivos(
                grandes.length > 0
                  ? `${grandes.map((f) => `${f.name} (${formatSize(f.size)})`).join(", ")}: ` +
                    `el proyecto admite ${MAX_MB} MB por archivo. Sube el vídeo a Drive y pega aquí el enlace, ` +
                    `o pide que suban el límite en Supabase.`
                  : "",
              );
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
          descargan igual que se subieron, sin recomprimir. Hasta {MAX_MB} MB por archivo; los
          grandes van por partes, así que un corte de red no tira la subida.
        </div>
      </div>
    </section>
  );
}
