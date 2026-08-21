"use client";

import { useCallback, useEffect, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { commentStamp, formatDue, isOverdue } from "@/lib/format";
import { LABELS, type Card, type CardComment, type ChecklistItem, type Profile } from "@/lib/types";

type Props = {
  card: Card;
  clientName: string;
  profiles: Profile[];
  profileById: Record<string, Profile>;
  me: Profile;
  onClose: () => void;
  onPatch: (cardId: string, patch: Partial<Card>) => void;
  onToggleAssignee: (cardId: string, profileId: string) => void;
  onDelete: (cardId: string) => void;
};

export default function CardDrawer({
  card,
  clientName,
  profiles,
  profileById,
  me,
  onClose,
  onPatch,
  onToggleAssignee,
  onDelete,
}: Props) {
  const supabase = createClient();

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<CardComment[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
  }, [card.id, card.title, card.description]);

  const load = useCallback(async () => {
    setLoading(true);
    const [items, cms] = await Promise.all([
      supabase.from("checklist_items").select("*").eq("card_id", card.id).order("position"),
      supabase.from("card_comments").select("*").eq("card_id", card.id).order("created_at"),
    ]);
    setChecklist((items.data ?? []) as ChecklistItem[]);
    setComments((cms.data ?? []) as CardComment[]);
    setLoading(false);
  }, [card.id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function addChecklistItem() {
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    const position = (checklist.at(-1)?.position ?? 0) + 1;
    const { data } = await supabase
      .from("checklist_items")
      .insert({ card_id: card.id, text, position })
      .select("*")
      .single();
    if (data) setChecklist((prev) => [...prev, data as ChecklistItem]);
  }

  async function toggleItem(item: ChecklistItem) {
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    await supabase.from("checklist_items").update({ done: !item.done }).eq("id", item.id);
  }

  async function removeItem(item: ChecklistItem) {
    setChecklist((prev) => prev.filter((i) => i.id !== item.id));
    await supabase.from("checklist_items").delete().eq("id", item.id);
  }

  async function addComment() {
    const body = newComment.trim();
    if (!body) return;
    setNewComment("");
    const { data } = await supabase
      .from("card_comments")
      .insert({ card_id: card.id, author_id: me.id, body })
      .select("*")
      .single();
    if (data) setComments((prev) => [...prev, data as CardComment]);
  }

  const doneCount = checklist.filter((i) => i.done).length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Encargo ${card.ref}`}>
        <div className="drawer__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="drawer__ref">
              #{card.ref} · {clientName}
            </div>
            <textarea
              className="drawer__title"
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (next && next !== card.title) onPatch(card.id, { title: next });
                else setTitle(card.title);
              }}
            />
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="drawer__body">
          <div className="drawer__section">
            <div className="drawer__label">Etiquetas</div>
            <div className="drawer__row">
              {LABELS.map((l) => {
                const on = card.labels.includes(l.key);
                return (
                  <button
                    key={l.key}
                    type="button"
                    className={`chip chip--${l.key}`}
                    aria-pressed={on}
                    onClick={() =>
                      onPatch(card.id, {
                        labels: on
                          ? card.labels.filter((x) => x !== l.key)
                          : [...card.labels, l.key],
                      })
                    }
                  >
                    {l.text}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="drawer__section">
            <div className="drawer__label">Responsables</div>
            <div className="drawer__row">
              {profiles.map((p) => {
                const on = card.assignees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onToggleAssignee(card.id, p.id)}
                    title={`${p.full_name}${on ? " — quitar" : " — asignar"}`}
                    aria-pressed={on}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      cursor: "pointer",
                      opacity: on ? 1 : 0.35,
                    }}
                  >
                    <Stamp label={p.initials} color={p.color} />
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)", marginTop: "0.4rem" }}>
              {card.assignees.length === 0
                ? "Sin asignar"
                : card.assignees.map((id) => profileById[id]?.full_name).filter(Boolean).join(", ")}
            </div>
          </div>

          <div className="drawer__section">
            <div className="drawer__label">Entrega</div>
            <div className="drawer__row">
              <input
                className="input-inline"
                type="date"
                value={card.due_date ?? ""}
                onChange={(e) => onPatch(card.id, { due_date: e.target.value || null })}
              />
              {card.due_date && (
                <span
                  style={{
                    fontSize: "0.82rem",
                    color: isOverdue(card.due_date) ? "var(--danger)" : "var(--ink-muted)",
                    fontWeight: isOverdue(card.due_date) ? 600 : 400,
                  }}
                >
                  {formatDue(card.due_date)}
                  {isOverdue(card.due_date) ? " · atrasada" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="drawer__section">
            <div className="drawer__label">Descripción</div>
            <textarea
              className="drawer__desc"
              value={description}
              placeholder="Detalle del encargo, enlaces y notas que el equipo necesite."
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== card.description) onPatch(card.id, { description });
              }}
            />
          </div>

          <div className="drawer__section">
            <div className="drawer__label">
              Checklist {checklist.length > 0 && `· ${doneCount}/${checklist.length}`}
            </div>
            <ul className="checklist">
              {checklist.map((item) => (
                <li key={item.id} className={item.done ? "is-done" : ""}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItem(item)}
                    aria-label={item.text}
                  />
                  <span className="checklist__text">{item.text}</span>
                  <button
                    type="button"
                    className="checklist__remove"
                    onClick={() => removeItem(item)}
                    aria-label={`Quitar "${item.text}"`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <input
              className="input-inline"
              style={{ marginTop: "0.5rem", width: "100%" }}
              placeholder="Añadir paso y pulsar Intro"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addChecklistItem();
                }
              }}
            />
          </div>

          <div className="drawer__section">
            <div className="drawer__label">Comentarios</div>
            {loading && <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}>Cargando…</div>}
            {!loading && comments.length === 0 && (
              <div style={{ fontSize: "0.82rem", color: "var(--ink-faint)", marginBottom: "0.6rem" }}>
                Sin comentarios todavía.
              </div>
            )}
            {comments.map((cm) => {
              const author = profileById[cm.author_id];
              return (
                <div className="comment" key={cm.id}>
                  <Stamp label={author?.initials ?? "··"} color={author?.color ?? "var(--ink-muted)"} />
                  <div>
                    <div className="comment__meta">
                      <strong>{author?.full_name ?? "Equipo"}</strong> · {commentStamp(cm.created_at)}
                    </div>
                    <div className="comment__text">{cm.body}</div>
                  </div>
                </div>
              );
            })}
            <textarea
              className="input-inline"
              style={{ width: "100%", marginTop: "0.4rem", resize: "vertical", minHeight: "56px" }}
              placeholder="Escribe un comentario…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void addComment();
                }
              }}
            />
          </div>
        </div>

        <div className="drawer__foot">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm(`¿Borrar el encargo #${card.ref}? No se puede deshacer.`)) onDelete(card.id);
            }}
          >
            Borrar encargo
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </aside>
    </>
  );
}
