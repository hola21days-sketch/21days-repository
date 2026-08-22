"use client";

import Stamp from "./Stamp";
import Logo from "./Logo";
import Fichaje from "./Fichaje";
import { BRAND } from "@/lib/brand";
import { initialsOf, stampColor } from "@/lib/format";
import type { Profile } from "@/lib/types";

export type RailClient = {
  id: string;
  name: string;
  kind: string;
  openCount: number;
  unread: boolean;
};

type Props = {
  clients: RailClient[];
  activeId: string | null;
  me: Profile;
  profiles: Profile[];
  open: boolean;
  onSelect: (id: string) => void;
  onNewClient: () => void;
  onClose: () => void;
  vista: "cliente" | "informes";
  onVista: (v: "cliente" | "informes") => void;
};

export default function Rail({
  clients,
  activeId,
  me,
  profiles,
  open,
  onSelect,
  onNewClient,
  onClose,
  vista,
  onVista,
}: Props) {
  return (
    <aside className={open ? "rail rail--open" : "rail"} id="rail">
      <div className="rail__brand">
        <div>
          <Logo className="rail__logo" />
          <div className="rail__brand-mark">
            Bit<span>á</span>cora
          </div>
          <div className="rail__brand-sub">{BRAND.tagline}</div>
        </div>
        <button type="button" className="rail__close" onClick={onClose} aria-label="Cerrar el listado">
          ✕
        </button>
      </div>

      <div className="rail__section-label">
        <span>Clientes activos</span>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ padding: "0.1rem 0.35rem", fontSize: "0.85rem", lineHeight: 1 }}
          onClick={onNewClient}
          title="Añadir cliente"
          aria-label="Añadir cliente"
        >
          +
        </button>
      </div>

      <ul className="rail__list">
        {clients.length === 0 && (
          <li style={{ padding: "0.6rem", fontSize: "0.82rem", color: "var(--ink-faint)" }}>
            Todavía no hay clientes. Añade el primero con el botón +.
          </li>
        )}
        {clients.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={
                c.id === activeId && vista === "cliente" ? "client-item is-active" : "client-item"
              }
              onClick={() => onSelect(c.id)}
            >
              <Stamp label={initialsOf(c.name)} color={stampColor(c.id)} />
              <div className="client-item__body">
                <div className="client-item__name">{c.name}</div>
                <div className="client-item__kind">{c.kind}</div>
              </div>
              <div className="client-item__meta">
                <span className="count-chip">{c.openCount}</span>
                {c.unread && <span className="unread-dot" aria-label="Mensajes sin leer" />}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={vista === "informes" ? "rail__nav is-active" : "rail__nav"}
        onClick={() => onVista(vista === "informes" ? "cliente" : "informes")}
      >
        Informes de tiempo
      </button>

      <div className="rail__punch">
        <Fichaje me={me} profiles={profiles} />
      </div>

      <div className="rail__footer">
        <Stamp label={me.initials || initialsOf(me.full_name)} color={me.color} />
        <span className="rail__footer-name">{me.full_name} · conectado</span>
        <form action="/auth/salir" method="post">
          <button type="submit" className="btn btn--ghost" style={{ fontSize: "0.74rem" }}>
            Salir
          </button>
        </form>
      </div>
    </aside>
  );
}
