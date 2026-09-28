"use client";

import { useEffect, useState } from "react";
import Stamp from "./Stamp";
import Logo from "./Logo";
import Fichaje from "./Fichaje";
import { BRAND } from "@/lib/brand";
import { initialsOf, stampColor } from "@/lib/format";
import type { Profile } from "@/lib/types";

export type Vista = "cliente" | "informes" | "dm" | "panel" | "mias";

export type RailClient = {
  id: string;
  name: string;
  kind: string;
  /** Los canales del equipo van aparte, arriba y destacados. */
  internal: boolean;
  openCount: number;
  /** Hay algo nuevo desde la última vez: un mensaje o una tarea. */
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
  vista: Vista;
  onVista: (v: Vista) => void;
  dmUnread: number;
  puedeBorrar: boolean;
  onBorrarCliente: (id: string) => void;
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
  dmUnread,
  puedeBorrar,
  onBorrarCliente,
}: Props) {
  // Menú del botón derecho sobre un canal.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [menu]);

  const internos = clients.filter((c) => c.internal);
  const externos = clients.filter((c) => !c.internal);

  /** Una entrada del listado, con su menú del botón derecho. */
  function entrada(c: RailClient, destacado = false) {
    const clases = [
      "client-item",
      c.id === activeId && vista === "cliente" ? "is-active" : "",
      destacado ? "client-item--equipo" : "",
      // Si alguien ha escrito o ha puesto una tarea, el canal va en negrita.
      c.unread ? "is-novedad" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <li key={c.id}>
        <button
          type="button"
          className={clases}
          onClick={() => onSelect(c.id)}
          onContextMenu={(e) => {
            if (!puedeBorrar) return;
            e.preventDefault();
            setMenu({ id: c.id, x: e.clientX, y: e.clientY });
          }}
        >
          <Stamp label={initialsOf(c.name)} color={stampColor(c.id)} />
          <div className="client-item__body">
            <div className="client-item__name">{c.name}</div>
            <div className="client-item__kind">
              {destacado ? "Todo el equipo" : c.kind}
            </div>
          </div>
          <div className="client-item__meta">
            {!destacado && <span className="count-chip">{c.openCount}</span>}
            {c.unread && (
              <span className="unread-dot" aria-label="Hay algo nuevo" />
            )}
          </div>
        </button>
      </li>
    );
  }

  return (
    <aside className={open ? "rail rail--open" : "rail"} id="rail">
      <div className="rail__brand">
        <div>
          <Logo className="rail__logo" />
          <div className="rail__brand-mark">
            <span>21</span>days agency
          </div>
          <div className="rail__brand-sub">{BRAND.tagline}</div>
        </div>
        <button
          type="button"
          className="rail__close"
          onClick={onClose}
          aria-label="Cerrar el listado"
        >
          ✕
        </button>
      </div>

      <nav className="rail__atajos">
        <button
          type="button"
          className={vista === "panel" ? "rail__nav is-active" : "rail__nav"}
          onClick={() => onVista(vista === "panel" ? "cliente" : "panel")}
        >
          Panel de clientes
        </button>

        <button
          type="button"
          className={vista === "mias" ? "rail__nav is-active" : "rail__nav"}
          onClick={() => onVista(vista === "mias" ? "cliente" : "mias")}
        >
          Tareas del equipo
        </button>

        <button
          type="button"
          className={vista === "dm" ? "rail__nav is-active" : "rail__nav"}
          onClick={() => onVista(vista === "dm" ? "cliente" : "dm")}
        >
          Mensajes directos
          {dmUnread > 0 && <span className="count-chip">{dmUnread}</span>}
        </button>

        {me.role === "admin" && (
          <button
            type="button"
            className={
              vista === "informes" ? "rail__nav is-active" : "rail__nav"
            }
            onClick={() =>
              onVista(vista === "informes" ? "cliente" : "informes")
            }
          >
            Informes de tiempo
          </button>
        )}
      </nav>

      {internos.length > 0 && (
        <ul className="rail__list rail__list--equipo">
          {internos.map((c) => entrada(c, true))}
        </ul>
      )}

      <div className="rail__section-label">
        <span>Clientes activos</span>
        <button
          type="button"
          className="btn btn--ghost"
          style={{
            padding: "0.1rem 0.35rem",
            fontSize: "0.85rem",
            lineHeight: 1,
          }}
          onClick={onNewClient}
          title="Añadir cliente"
          aria-label="Añadir cliente"
        >
          +
        </button>
      </div>

      <ul className="rail__list">
        {externos.length === 0 && (
          <li
            style={{
              padding: "0.6rem",
              fontSize: "0.82rem",
              color: "var(--ink-faint)",
            }}
          >
            Todavía no hay clientes. Añade el primero con el botón +.
          </li>
        )}
        {externos.map((c) => entrada(c))}
      </ul>

      <div className="rail__punch">
        <Fichaje me={me} profiles={profiles} clients={clients} />
      </div>

      <div className="rail__footer">
        <Stamp
          label={me.initials || initialsOf(me.full_name)}
          color={me.color}
        />
        <span className="rail__footer-name">{me.full_name} · conectado</span>
        <form action="/auth/salir" method="post">
          <button
            type="submit"
            className="btn btn--ghost"
            style={{ fontSize: "0.74rem" }}
          >
            Salir
          </button>
        </form>
      </div>
      {menu && (
        <div
          className="menu-canal"
          style={{ top: menu.y, left: menu.x }}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              onBorrarCliente(id);
            }}
          >
            Borrar canal
          </button>
        </div>
      )}
    </aside>
  );
}
