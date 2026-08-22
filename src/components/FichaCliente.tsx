"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientDetails } from "@/lib/types";

type Props = {
  client: ClientDetails;
  /** Cifras que salen del tablero, para no tener que mantenerlas a mano. */
  enCurso: number;
  enReport: number;
  onSaved: (cambios: Partial<ClientDetails>) => void;
  onClose: () => void;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2024-03-01" -> "marzo de 2024", y cuánto tiempo lleva con nosotros. */
function desdeCuando(fecha: string | null): string {
  if (!fecha) return "";
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return "";
  const meses =
    (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - m);
  const cuanto =
    meses < 1
      ? "este mes"
      : meses < 12
        ? `${meses} ${meses === 1 ? "mes" : "meses"}`
        : `${Math.floor(meses / 12)} ${Math.floor(meses / 12) === 1 ? "año" : "años"}`;
  return `${MESES[m - 1]} de ${y} · ${cuanto} con nosotros`;
}

/**
 * La ficha del cliente: quién es, desde cuándo, qué temporada y cuántos vídeos
 * al mes lleva. Se abre pulsando su nombre en la cabecera y se guarda al vuelo,
 * para tener el contexto a mano sin salir del tablero.
 */
export default function FichaCliente({ client, enCurso, enReport, onSaved, onClose }: Props) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({
    description: client.description,
    started_on: client.started_on ?? "",
    season: client.season,
    videos_per_month: client.videos_per_month,
    contact: client.contact,
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    function fuera(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", fuera);
    return () => window.removeEventListener("keydown", fuera);
  }, [onClose]);

  async function guardar() {
    setGuardando(true);
    const cambios = {
      description: borrador.description.trim(),
      started_on: borrador.started_on || null,
      season: borrador.season.trim(),
      videos_per_month: Number(borrador.videos_per_month) || 0,
      contact: borrador.contact.trim(),
    };
    const supabase = createClient();
    await supabase.from("clients").update(cambios).eq("id", client.id);
    onSaved(cambios);
    setGuardando(false);
    setEditando(false);
  }

  return (
    <div className="ficha">
      <div className="ficha__cabecera">
        <div>
          <div className="ficha__nombre">{client.name}</div>
          <div className="ficha__tipo">{client.kind}</div>
        </div>
        <div className="ficha__acciones">
          {!editando && (
            <button type="button" className="btn btn--ghost" onClick={() => setEditando(true)}>
              Editar ficha
            </button>
          )}
          <button type="button" className="ficha__cerrar" onClick={onClose} aria-label="Cerrar ficha">
            ✕
          </button>
        </div>
      </div>

      {editando ? (
        <div className="ficha__form">
          <label>
            <span>Descripción del cliente</span>
            <textarea
              className="input-inline"
              rows={3}
              autoFocus
              placeholder="Qué hace, qué tono lleva, qué espera de nosotros…"
              value={borrador.description}
              onChange={(e) => setBorrador({ ...borrador, description: e.target.value })}
            />
          </label>

          <div className="ficha__fila">
            <label>
              <span>Cliente desde</span>
              <input
                className="input-inline"
                type="date"
                value={borrador.started_on}
                onChange={(e) => setBorrador({ ...borrador, started_on: e.target.value })}
              />
            </label>
            <label>
              <span>Temporada</span>
              <input
                className="input-inline"
                placeholder="Ej.: campaña de verano"
                value={borrador.season}
                onChange={(e) => setBorrador({ ...borrador, season: e.target.value })}
              />
            </label>
            <label>
              <span>Vídeos al mes</span>
              <input
                className="input-inline"
                type="number"
                min={0}
                value={borrador.videos_per_month}
                onChange={(e) =>
                  setBorrador({ ...borrador, videos_per_month: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <label>
            <span>Contacto</span>
            <input
              className="input-inline"
              placeholder="Nombre, teléfono o correo de quien lleva la cuenta"
              value={borrador.contact}
              onChange={(e) => setBorrador({ ...borrador, contact: e.target.value })}
            />
          </label>

          <div className="ficha__botones">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void guardar()}
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          {client.description ? (
            <p className="ficha__descripcion">{client.description}</p>
          ) : (
            <p className="ficha__vacio">
              Todavía no hay ficha. Pulsa <b>Editar ficha</b> y cuenta de qué va el cliente.
            </p>
          )}

          <dl className="ficha__datos">
            {client.started_on && (
              <div>
                <dt>Cliente desde</dt>
                <dd>{desdeCuando(client.started_on)}</dd>
              </div>
            )}
            {client.season && (
              <div>
                <dt>Temporada</dt>
                <dd>{client.season}</dd>
              </div>
            )}
            {client.videos_per_month > 0 && (
              <div>
                <dt>Vídeos al mes</dt>
                <dd>{client.videos_per_month}</dd>
              </div>
            )}
            <div>
              <dt>Ahora mismo</dt>
              <dd>
                {enCurso} en producción · {enReport} en report
              </dd>
            </div>
            {client.contact && (
              <div>
                <dt>Contacto</dt>
                <dd>{client.contact}</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </div>
  );
}
