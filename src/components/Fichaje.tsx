"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import type { Punch, PunchKind } from "@/lib/types";

/** Estado en el que está la jornada de hoy, según el último fichaje. */
type Estado = "fuera" | "dentro" | "pausa";

function estadoDe(punches: Punch[]): Estado {
  const last = punches.at(-1);
  if (!last) return "fuera";
  if (last.kind === "entrada" || last.kind === "regreso") return "dentro";
  if (last.kind === "pausa") return "pausa";
  return "fuera";
}

/** Minutos trabajados hoy: suma de los tramos entrada/regreso → pausa/salida. */
function minutosDe(punches: Punch[], ahora: number): number {
  let total = 0;
  let desde: number | null = null;
  for (const p of punches) {
    const t = new Date(p.at).getTime();
    if (p.kind === "entrada" || p.kind === "regreso") {
      if (desde === null) desde = t;
    } else if (desde !== null) {
      total += t - desde;
      desde = null;
    }
  }
  if (desde !== null) total += ahora - desde;
  return Math.max(0, Math.round(total / 60000));
}

function comoReloj(minutos: number): string {
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

const ETIQUETA: Record<Estado, string> = {
  fuera: "Sin fichar",
  dentro: "Trabajando",
  pausa: "En pausa",
};

export default function Fichaje({ profileId }: { profileId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [busy, setBusy] = useState<PunchKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const desdeHoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("time_punches")
      .select("*")
      .eq("profile_id", profileId)
      .gte("at", desdeHoy)
      .order("at");
    if (data) setPunches(data as Punch[]);
  }, [supabase, profileId, desdeHoy]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const estado = estadoDe(punches);

  // El contador solo tiene que correr mientras la jornada está abierta.
  useEffect(() => {
    if (estado !== "dentro") return;
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, [estado]);

  async function fichar(kind: PunchKind) {
    setBusy(kind);
    setError(null);
    const { data, error } = await supabase
      .from("time_punches")
      .insert({ profile_id: profileId, kind })
      .select("*")
      .single();
    setBusy(null);
    if (error || !data) {
      setError("No se ha podido fichar. Vuelve a intentarlo.");
      return;
    }
    setAhora(Date.now());
    setPunches((prev) => [...prev, data as Punch]);
  }

  const minutos = minutosDe(punches, ahora);
  const ultimo = punches.at(-1);

  const botones: { kind: PunchKind; texto: string; activo: boolean }[] = [
    { kind: "entrada", texto: "Entrada", activo: estado === "fuera" },
    { kind: "pausa", texto: "Pausa", activo: estado === "dentro" },
    { kind: "regreso", texto: "Regreso", activo: estado === "pausa" },
    { kind: "salida", texto: "Salida", activo: estado !== "fuera" },
  ];

  return (
    <section className="punch" aria-label="Fichaje">
      <div className="rail__section-label" style={{ padding: "0 0 0.35rem" }}>
        <span>Fichar</span>
        <span className={`punch__state punch__state--${estado}`}>{ETIQUETA[estado]}</span>
      </div>

      {error && <div className="notice notice--error punch__error">{error}</div>}

      <div className="punch__grid">
        {botones.map((b) => (
          <button
            key={b.kind}
            type="button"
            className={b.kind === "salida" ? "btn punch__btn punch__btn--out" : "btn punch__btn"}
            disabled={!b.activo || busy !== null}
            onClick={() => void fichar(b.kind)}
          >
            {busy === b.kind ? "…" : b.texto}
          </button>
        ))}
      </div>

      <div className="punch__foot">
        <span>
          Hoy <b>{comoReloj(minutos)}</b>
        </span>
        {ultimo && (
          <span>
            {ultimo.kind} · {formatTime(ultimo.at)}
          </span>
        )}
      </div>
    </section>
  );
}
