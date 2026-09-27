"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import SalidaDelDia from "./SalidaDelDia";
import type { Profile, Punch, PunchKind } from "@/lib/types";

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

type Props = {
  me: Profile;
  profiles: Profile[];
  /** Para poder repartir la jornada entre clientes al salir. */
  clients: { id: string; name: string }[];
};

export default function Fichaje({ me, profiles, clients }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const profileId = me.id;
  const [punches, setPunches] = useState<Punch[]>([]);
  const [exportando, setExportando] = useState(false);
  const [despidiendo, setDespidiendo] = useState(false);
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

  /**
   * Vuelca los fichajes a un libro de Excel con sus medias y su detalle.
   * Trae lo que deje ver la base de datos: los tuyos, o los de todo el equipo
   * si eres administrador. El generador se carga solo al pulsar.
   */
  async function exportar() {
    setExportando(true);
    setError(null);
    const { data } = await supabase.from("time_punches").select("*").order("at");
    if (!data) {
      setExportando(false);
      setError("No se han podido leer los fichajes.");
      return;
    }
    try {
      const { exportarFichajes } = await import("@/lib/excel/fichajes");
      await exportarFichajes(data as Punch[], profiles, me.full_name);
    } finally {
      setExportando(false);
    }
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
      {despidiendo && (
        <SalidaDelDia
          me={me}
          clients={clients}
          minutosFichados={minutos}
          onCancelar={() => setDespidiendo(false)}
          onConfirmar={async () => {
            setDespidiendo(false);
            await fichar("salida");
          }}
        />
      )}

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
            onClick={() => {
              // La salida pasa antes por el reparto del día; el resto ficha directo.
              if (b.kind === "salida") setDespidiendo(true);
              else void fichar(b.kind);
            }}
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

      <button
        type="button"
        className="btn btn--ghost punch__export"
        onClick={() => void exportar()}
        disabled={exportando}
        title="Descarga el informe de fichajes en Excel"
      >
        {exportando ? "Preparando…" : "Descargar en Excel"}
      </button>
    </section>
  );
}
