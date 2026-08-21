"use client";

import { useState } from "react";

type Props = {
  onCancel: () => void;
  onCreate: (name: string, kind: string, prefix: string) => Promise<string | null>;
};

export default function NewClientDialog({ onCancel, onCreate }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const problem = await onCreate(name.trim(), kind.trim(), prefix.trim().toUpperCase());
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

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
            {busy ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
