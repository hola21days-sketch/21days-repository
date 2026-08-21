"use client";

import { useEffect, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, formatSize, formatTime } from "@/lib/format";
import type { Attachment, Message, Profile } from "@/lib/types";

type Props = {
  messages: Message[];
  attachmentsByMessage: Record<string, Attachment[]>;
  profileById: Record<string, Profile>;
  loading: boolean;
  pendingIds: Set<string>;
  uploading: string | null;
  onSend: (body: string, files: File[]) => void;
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

function esImagen(att: Attachment) {
  return att.mime.startsWith("image/");
}

export default function Chat({
  messages,
  attachmentsByMessage,
  profileById,
  loading,
  pendingIds,
  uploading,
  onSend,
}: Props) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, loading]);

  function send() {
    const text = draft.trim();
    if (!text && files.length === 0) return;
    onSend(text, files);
    setDraft("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    const input = inputRef.current;
    if (input) input.style.height = "auto";
  }

  let lastDay = "";

  return (
    <section className="chat">
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
                    </div>
                    {m.body && <div className="msg__text">{m.body}</div>}
                    {adjuntos.length > 0 && (
                      <ul className="files">
                        {adjuntos.map((a) => (
                          <li key={a.id}>
                            <button type="button" className="file" onClick={() => void abrir(a)}>
                              <span className="file__icon">{esImagen(a) ? "▣" : "▤"}</span>
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
            placeholder="Escribe un mensaje al equipo…"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 90)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
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
          Este chat es solo para el equipo interno de este cliente — no lo ve el cliente. Los
          archivos se guardan tal cual: vídeo 4K, Excel, PDF… se descargan igual que se subieron.
        </div>
      </div>
    </section>
  );
}
