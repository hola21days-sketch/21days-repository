"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Stamp from "./Stamp";
import type { Profile, WorkSession } from "@/lib/types";

type Props = {
  clientNames: Record<string, string>;
  profileById: Record<string, Profile>;
  me: Profile;
};

type Periodo = "semana" | "mes";

/** Lunes de la semana de esa fecha, a las 00:00. */
function lunesDe(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - dia);
  return x;
}

/** Ventana [desde, hasta) del periodo elegido, con `salto` periodos de retraso. */
function ventana(periodo: Periodo, salto: number): { desde: Date; hasta: Date; texto: string } {
  const hoy = new Date();
  if (periodo === "semana") {
    const desde = lunesDe(hoy);
    desde.setDate(desde.getDate() + salto * 7);
    const hasta = new Date(desde);
    hasta.setDate(hasta.getDate() + 7);
    const fin = new Date(hasta);
    fin.setDate(fin.getDate() - 1);
    return {
      desde,
      hasta,
      texto: `${desde.getDate()}/${desde.getMonth() + 1} – ${fin.getDate()}/${fin.getMonth() + 1}`,
    };
  }
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() + salto, 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + salto + 1, 1);
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return { desde, hasta, texto: `${MESES[desde.getMonth()]} ${desde.getFullYear()}` };
}

/** Minutos de un tramo; si sigue abierto, cuenta hasta ahora. */
function minutosDe(s: WorkSession, ahora: number): number {
  const ini = new Date(s.started_at).getTime();
  const fin = s.ended_at ? new Date(s.ended_at).getTime() : ahora;
  return Math.max(0, (fin - ini) / 60000);
}

export function comoHoras(minutos: number): string {
  const m = Math.round(minutos);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Informes de tiempo: cuánto ha llevado cada fase de cada cliente.
 * ---------------------------------------------------------------------------
 * Sale de los cronómetros de las tarjetas. Los tramos abiertos se cuentan
 * hasta este momento, así que la semana en curso ya se ve mientras avanza.
 */
export default function Informes({ clientNames, profileById, me }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [salto, setSalto] = useState(0);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const { desde, hasta, texto } = useMemo(() => ventana(periodo, salto), [periodo, salto]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("work_sessions")
      .select("*")
      .gte("started_at", desde.toISOString())
      .lt("started_at", hasta.toISOString())
      .order("started_at");
    setSessions((data ?? []) as WorkSession[]);
    setCargando(false);
  }, [supabase, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Con algo en marcha, el total del periodo va subiendo solo.
  useEffect(() => {
    if (!sessions.some((s) => !s.ended_at)) return;
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, [sessions]);

  const fases = useMemo(() => {
    const vistas: string[] = [];
    for (const s of sessions) {
      const f = s.column_label || "Sin fase";
      if (!vistas.includes(f)) vistas.push(f);
    }
    return vistas;
  }, [sessions]);

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { total: number; fases: Record<string, number> }>();
    for (const s of sessions) {
      const fila = mapa.get(s.client_id) ?? { total: 0, fases: {} };
      const f = s.column_label || "Sin fase";
      const min = minutosDe(s, ahora);
      fila.total += min;
      fila.fases[f] = (fila.fases[f] ?? 0) + min;
      mapa.set(s.client_id, fila);
    }
    return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [sessions, ahora]);

  const porPersona = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of sessions) {
      mapa.set(s.profile_id, (mapa.get(s.profile_id) ?? 0) + minutosDe(s, ahora));
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions, ahora]);

  const totalPeriodo = porCliente.reduce((acc, [, f]) => acc + f.total, 0);
  const enMarcha = sessions.filter((s) => !s.ended_at);

  /**
   * Vuelca el periodo a un libro de Excel con sus tablas y sus medias. El
   * generador se carga solo al pulsar: pesa lo suyo y no tiene por qué estar
   * en la primera carga de la app.
   */
  async function exportar() {
    setExportando(true);
    try {
      const { exportarTiempos } = await import("@/lib/excel/tiempos");
      await exportarTiempos({
        sessions,
        clientNames,
        profileById,
        periodo,
        textoPeriodo: texto,
        desde,
        hasta,
        ahora,
        generadoPor: me.full_name,
      });
    } finally {
      setExportando(false);
    }
  }

  return (
    <section className="report">
      <header className="report__head">
        <div className="report__switch">
          <button
            type="button"
            className={periodo === "semana" ? "tab is-active" : "tab"}
            onClick={() => {
              setPeriodo("semana");
              setSalto(0);
            }}
          >
            Semana
          </button>
          <button
            type="button"
            className={periodo === "mes" ? "tab is-active" : "tab"}
            onClick={() => {
              setPeriodo("mes");
              setSalto(0);
            }}
          >
            Mes
          </button>
        </div>

        <div className="report__nav">
          <button type="button" className="btn" onClick={() => setSalto((s) => s - 1)}>
            ←
          </button>
          <span className="report__period">{texto}</span>
          <button
            type="button"
            className="btn"
            onClick={() => setSalto((s) => Math.min(0, s + 1))}
            disabled={salto >= 0}
          >
            →
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void exportar()}
            disabled={sessions.length === 0 || exportando}
            title="Descarga el informe completo en Excel"
          >
            {exportando ? "Preparando…" : "Descargar en Excel"}
          </button>
        </div>
      </header>

      {enMarcha.length > 0 && (
        <div className="report__now">
          <div className="drawer__label">Ahora mismo</div>
          <ul className="report__nowlist">
            {enMarcha.map((s) => {
              const quien = profileById[s.profile_id];
              return (
                <li key={s.id}>
                  <Stamp
                    label={quien?.initials ?? "··"}
                    color={quien?.color ?? "var(--ink-muted)"}
                    title={quien?.full_name}
                  />
                  <span className="report__nowbody">
                    <b>{quien?.full_name ?? "Alguien"}</b> · {clientNames[s.client_id] ?? "Cliente"} ·{" "}
                    {s.column_label || "Sin fase"}
                    <span className="report__nowtask">{s.column_label || ""}</span>
                  </span>
                  <span className="report__nowtime">{comoHoras(minutosDe(s, ahora))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cargando && <p className="report__empty">Cargando…</p>}

      {!cargando && sessions.length === 0 && (
        <p className="report__empty">
          Nadie ha puesto el cronómetro en este periodo. Se arranca desde la tarjeta, con el botón
          <b> Iniciar proceso</b>.
        </p>
      )}

      {!cargando && sessions.length > 0 && (
        <>
          <div className="report__total">
            <span className="stat__num">{comoHoras(totalPeriodo)}</span>
            <span className="stat__label">en total este {periodo === "semana" ? "semana" : "mes"}</span>
          </div>

          <div className="report__tablewrap">
            <table className="report__table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  {fases.map((f) => (
                    <th key={f}>{f}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {porCliente.map(([clientId, fila]) => (
                  <tr key={clientId}>
                    <td>{clientNames[clientId] ?? "Cliente borrado"}</td>
                    {fases.map((f) => (
                      <td key={f}>{fila.fases[f] ? comoHoras(fila.fases[f]) : "·"}</td>
                    ))}
                    <td>
                      <b>{comoHoras(fila.total)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report__tablewrap">
            <table className="report__table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {porPersona.map(([profileId, minutos]) => (
                  <tr key={profileId}>
                    <td>{profileById[profileId]?.full_name ?? "Alguien"}</td>
                    <td>
                      <b>{comoHoras(minutos)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
