"use client";

import { useEffect, useRef, useState } from "react";
import Stamp from "./Stamp";
import { dayLabel, formatTime } from "@/lib/format";
import type { Message, Profile } from "@/lib/types";

type Props = {
  messages: Message[];
  profileById: Record<string, Profile>;
  loading: boolean;
  pendingIds: Set<string>;
  onSend: (body: string) => void;
};

export default function Chat({ messages, profileById, loading, pendingIds, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, loading]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
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
                    <div className="msg__text">{m.body}</div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="composer">
        <div className="composer__field">
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
          <button type="button" className="composer__send" onClick={send} disabled={!draft.trim()}>
            Enviar
          </button>
        </div>
        <div className="composer__hint">
          Este chat es solo para el equipo interno de este cliente — no lo ve el cliente.
        </div>
      </div>
    </section>
  );
}
