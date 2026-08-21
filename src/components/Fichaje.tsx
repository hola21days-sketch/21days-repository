"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import { localDay } from "@/lib/format";
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

/** Una fila de la hoja de fichajes: un día de una persona. */
function filasDeInforme(punches: Punch[], nombreDe: (id: string) => Profile | undefined) {
  const porDia = new Map<string, Punch[]>();
  for (const p of punches) {
    const clave = `${p.profile_id}|${localDay(p.at)}`;
    porDia.set(clave, [...(porDia.get(clave) ?? []), p]);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([clave, dia]) => {
      const [profileId, fecha] = clave.split("|");
      const quien = nombreDe(profileId);
      const ordenados = [...dia].sort((a, b) => a.at.localeCompare(b.at));
      const entrada = ordenados.find((p) => p.kind === "entrada");
      const salida = [...ordenados].reverse().find((p) => p.kind === "salida");
      const pausas = ordenados.filter((p) => p.kind === "pausa").length;

      let trabajado = 0;
      let pausado = 0;
      let desde: number | null = null;
      let pausaDesde: number | null = null;
      for (const p of ordenados) {
        const t = new Date(p.at).getTime();
        if (p.kind === "entrada" || p.kind === "regreso") {
          if (desde === null) desde = t;
          if (pausaDesde !== null) {
            pausado += t - pausaDesde;
            pausaDesde = null;
          }
        } else {
          if (desde !== null) {
            trabajado += t - desde;
            desde = null;
          }
          if (p.kind === "pausa") pausaDesde = t;
        }
      }

      const horas = trabajado / 3600000;
      return {
        fecha,
        persona: quien?.full_name ?? "",
        correo: quien?.email ?? "",
        entrada: entrada ? formatTime(entrada.at) : "",
        salida: salida ? formatTime(salida.at) : "",
        pausas,
        minutosPausa: Math.round(pausado / 60000),
        horas: salida ? horas.toFixed(2).replace(".", ",") : "",
        detalle: ordenados.map((p) => `${formatTime(p.at)} ${p.kind}`).join(" · "),
      };
    });
}

export default function Fichaje({ me, profiles }: { me: Profile; profiles: Profile[] }) {
  const supabase = useMemo(() => createClient(), []);
  const profileId = me.id;
  const [punches, setPunches] = useState<Punch[]>([]);
  const [exportando, setExportando] = useState(false);
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
   * Vuelca los fichajes a CSV para la hoja de Google.
   * Trae lo que deje ver la base de datos: los tuyos, o los de todo el equipo
   * si eres administrador.
   */
  async function exportar() {
    setExportando(true);
    const { data } = await supabase.from("time_punches").select("*").order("at");
    setExportando(false);
    if (!data) {
      setError("No se han podido leer los fichajes.");
      return;
    }

    const porId = new Map(profiles.map((p) => [p.id, p]));
    const filas = filasDeInforme(data as Punch[], (id) => porId.get(id));
    const cabecera = [
      "Fecha", "Persona", "Correo", "Entrada", "Salida",
      "Pausas", "Min. de pausa", "Horas trabajadas", "Detalle del día",
    ];
    const escapar = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      cabecera.map(escapar).join(","),
      ...filas.map((f) =>
        [f.fecha, f.persona, f.correo, f.entrada, f.salida, f.pausas, f.minutosPausa, f.horas, f.detalle]
          .map(escapar)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fichajes-${localDay(new Date().toISOString())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      <button
        type="button"
        className="btn btn--ghost punch__export"
        onClick={() => void exportar()}
        disabled={exportando}
        title="Descarga el CSV para la hoja de fichajes"
      >
        {exportando ? "Preparando…" : "Exportar CSV"}
      </button>
    </section>
  );
}
