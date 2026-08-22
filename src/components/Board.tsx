"use client";

import { useState } from "react";
import Stamp from "./Stamp";
import { formatDue, isOverdue } from "@/lib/format";
import { LABEL_TEXT, type BoardColumn, type Card, type Profile } from "@/lib/types";

type Props = {
  columns: BoardColumn[];
  cards: Card[];
  profileById: Record<string, Profile>;
  onOpenCard: (cardId: string) => void;
  onMoveCard: (cardId: string, columnId: string) => void;
  onAddCard: (columnId: string, title: string) => void;
  /** Quién tiene el cronómetro en marcha en cada tarjeta. */
  workingByCard: Record<string, Profile[]>;
};

export default function Board({
  columns,
  cards,
  profileById,
  onOpenCard,
  onMoveCard,
  onAddCard,
  workingByCard,
}: Props) {
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [composerCol, setComposerCol] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function submitDraft(columnId: string) {
    const title = draft.trim();
    if (title) onAddCard(columnId, title);
    setDraft("");
    setComposerCol(null);
  }

  return (
    <section className="board">
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.column_id === col.id);
        return (
          <div
            key={col.id}
            className={dragOverCol === col.id ? "column is-dragover" : "column"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.id);
            }}
            onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCol(null);
              if (dragCardId) onMoveCard(dragCardId, col.id);
              setDragCardId(null);
            }}
          >
            <div className="column__head">
              <span className="column__title">{col.label}</span>
              <span className="column__count">{colCards.length}</span>
            </div>

            <ul className="column__list">
              {colCards.map((cd) => (
                <li
                  key={cd.id}
                  className={dragCardId === cd.id ? "card is-dragging" : "card"}
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={() => setDragCardId(cd.id)}
                  onDragEnd={() => setDragCardId(null)}
                  onClick={() => onOpenCard(cd.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenCard(cd.id);
                    }
                  }}
                >
                  <div className="card__ref">
                    #{cd.ref}
                    {(workingByCard[cd.id]?.length ?? 0) > 0 && (
                      <span
                        className="card__live"
                        title={`En proceso: ${workingByCard[cd.id].map((p) => p.full_name).join(", ")}`}
                      >
                        ▶ en proceso
                      </span>
                    )}
                  </div>
                  <p className="card__title">{cd.title}</p>
                  {cd.labels.length > 0 && (
                    <div className="chip-row">
                      {cd.labels.map((l) => (
                        <span key={l} className={`chip chip--${l}`}>
                          {LABEL_TEXT[l] ?? l}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="card__foot">
                    <span className={isOverdue(cd.due_date) ? "card__due is-overdue" : "card__due"}>
                      {formatDue(cd.due_date)}
                    </span>
                    <div className="card__assignees">
                      {cd.assignees.map((id) => {
                        const p = profileById[id];
                        if (!p) return null;
                        return <Stamp key={id} label={p.initials} color={p.color} title={p.full_name} />;
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {composerCol === col.id ? (
              <div className="column__composer">
                <textarea
                  autoFocus
                  rows={2}
                  value={draft}
                  placeholder="¿Qué hay que hacer?"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitDraft(col.id);
                    }
                    if (e.key === "Escape") {
                      setDraft("");
                      setComposerCol(null);
                    }
                  }}
                />
                <div className="column__composer-actions">
                  <button type="button" className="btn btn--primary" onClick={() => submitDraft(col.id)}>
                    Añadir
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setDraft("");
                      setComposerCol(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="column__add"
                onClick={() => {
                  setComposerCol(col.id);
                  setDraft("");
                }}
              >
                + Añadir tarjeta
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
