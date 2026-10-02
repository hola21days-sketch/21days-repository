"use client";

import { useState } from "react";

type Props = {
  /** Desde dónde se ha pedido el alta, para marcar lo que toca. */
  desde: "canal" | "panel";
  onCancel: () => void;
  onCreate: (
    name: string,
    kind: string,
    prefix: string,
    enPanel: boolean,
    enCanales: boolean,
  ) => Promise<string | null>;
};

export default function NewClientDialog({ desde, onCancel, onCreate }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [prefix, setPrefix] = useState("");
  // El tablero del mes y el listado de canales son dos cosas distintas. Se
  // marca de entrada el sitio desde el que se ha pedido el alta, que es el que
  // se quiere casi siempre, y el otro se añade si hace falta.
  const [enPanel, setEnPanel] = useState(desde === "panel");
  const [enCanales, setEnCanales] = useState(desde === "canal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const problem = await onCreate(
      name.trim(),
      kind.trim(),
      prefix.trim().toUpperCase(),
      enPanel,
      enCanales,
    );
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal__panel" onSubmit={submit}>
        <h2 className="modal__title">Nuevo cliente</h2>

        {error && <div className="notice notice--error">{error}</div>}

        <div className="field">
          <label htmlFor="nc-name">Nombre</label>
          <input
            id="nc-name"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ferretería Solà"
          />
        </div>

        <div className="field">
          <label htmlFor="nc-kind">Sector</label>
          <input
            id="nc-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="Comercio · Ferretería"
          />
        </div>

        <div className="field">
          <label htmlFor="nc-prefix">Prefijo de las referencias</label>
          <input
            id="nc-prefix"
            maxLength={3}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="F — las tarjetas serán F001, F002…"
          />
        </div>

        <fieldset className="field alta__donde">
          <legend>¿Dónde sale?</legend>
          <label className="alta__op">
            <input type="checkbox" checked={enPanel} onChange={(e) => setEnPanel(e.target.checked)} />
            <span>
              <strong>En el tablero del mes</strong>
              <small>La fila con sus fases: idear, grabar, editar, planificar, programar.</small>
            </span>
          </label>
          <label className="alta__op">
            <input type="checkbox" checked={enCanales} onChange={(e) => setEnCanales(e.target.checked)} />
            <span>
              <strong>En el listado de canales</strong>
              <small>Con su chat, sus tareas y sus claves.</small>
            </span>
          </label>
        </fieldset>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !name.trim() || (!enPanel && !enCanales)}
          >
            {busy ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
