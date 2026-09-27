"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import SalidaDelDia from "./SalidaDelDia";
import type { Profile, Punch, PunchKind } from "@/lib/types";

/** Estado en el que está la jornada de hoy, según el último fichaje. */
type Estado = "fuera" | "dentro" | "pausa";

/**
 * Ya no se ficha la entrada: la jornada está abierta hasta que alguien la
 * cierra. El estado solo dice si hoy ya se ha dado por terminada.
 */
function estadoDe(punches: Punch[]): Estado {
  return punches.some((p) => p.kind === "salida") ? "fuera" : "dentro";
}

function comoReloj(minutos: number): string {
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

const ETIQUETA: Record<Estado, string> = {
  fuera: "Cerrada",
  dentro: "Abierta",
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
  const [minutosDelDia, setMinutosDelDia] = useState(0);
  const [busy, setBusy] = useState<PunchKind | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  /** Lo que llevas apuntado hoy, que es lo que de verdad cuenta la jornada. */
  const cargarHoras = useCallback(async () => {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("work_sessions")
      .select("started_at, ended_at")
      .eq("profile_id", profileId)
      .gte("started_at", desde.toISOString());
    const total = (data ?? []).reduce((a, s) => {
      const ini = new Date(s.started_at as string).getTime();
      const fin = s.ended_at ? new Date(s.ended_at as string).getTime() : Date.now();
      return a + Math.max(0, (fin - ini) / 60000);
    }, 0);
    setMinutosDelDia(Math.round(total));
  }, [supabase, profileId]);

  useEffect(() => {
    void cargarHoras();
  }, [cargarHoras]);

  const estado = estadoDe(punches);

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

  const minutos = minutosDelDia;
  const ultimo = punches.at(-1);

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
            await cargarHoras();
          }}
        />
      )}

      <div className="rail__section-label" style={{ padding: "0 0 0.35rem" }}>
        <span>Jornada</span>
        <span className={`punch__state punch__state--${estado}`}>{ETIQUETA[estado]}</span>
      </div>

      {error && <div className="notice notice--error punch__error">{error}</div>}

      <button
        type="button"
        className="btn btn--primary punch__salir"
        disabled={busy !== null}
        onClick={() => setDespidiendo(true)}
      >
        {busy ? "…" : "Terminar la jornada"}
      </button>

      <div className="punch__foot">
        <span>
          Hoy <b>{comoReloj(minutos)}</b>
        </span>
        {ultimo && <span>salida · {formatTime(ultimo.at)}</span>}
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
