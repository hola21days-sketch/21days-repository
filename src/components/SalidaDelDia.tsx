"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, WorkSession } from "@/lib/types";

type ClienteBreve = { id: string; name: string };

type Props = {
  me: Profile;
  clients: ClienteBreve[];
  /** Minutos que dice el fichaje de hoy, para contrastar con lo apuntado. */
  minutosFichados: number;
  onConfirmar: () => void;
  onCancelar: () => void;
};

type Linea = {
  clientId: string;
  minutos: number;
  /** Medido por el cronómetro (no se toca) o añadido a mano al salir. */
  medido: boolean;
  fases: string[];
};

function reloj(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Lo que sale al fichar la salida: con qué clientes se ha estado hoy.
 * ---------------------------------------------------------------------------
 * No hay que escribir nada si los cronómetros estaban puestos: el reparto sale
 * solo de los tramos del día. Solo se rellena a mano lo que falte, que es lo
 * que de verdad cuesta acordarse al final de la jornada.
 */
export default function SalidaDelDia({
  me,
  clients,
  minutosFichados,
  onConfirmar,
  onCancelar,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState("");
  const [nuevosMinutos, setNuevosMinutos] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const nombreDe = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  useEffect(() => {
    void (async () => {
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("work_sessions")
        .select("*")
        .eq("profile_id", me.id)
        .gte("started_at", desde.toISOString())
        .order("started_at");

      const ahora = Date.now();
      const porCliente = new Map<string, { minutos: number; fases: Set<string> }>();
      for (const s of (data ?? []) as WorkSession[]) {
        const ini = new Date(s.started_at).getTime();
        const fin = s.ended_at ? new Date(s.ended_at).getTime() : ahora;
        const min = Math.max(0, (fin - ini) / 60000);
        const fila = porCliente.get(s.client_id) ?? { minutos: 0, fases: new Set<string>() };
        fila.minutos += min;
        if (s.column_label) fila.fases.add(s.column_label);
        porCliente.set(s.client_id, fila);
      }

      setLineas(
        [...porCliente.entries()]
          .sort((a, b) => b[1].minutos - a[1].minutos)
          .map(([clientId, f]) => ({
            clientId,
            minutos: Math.round(f.minutos),
            medido: true,
            fases: [...f.fases],
          })),
      );
      setCargando(false);
    })();
  }, [supabase, me.id]);

  const apuntado = lineas.reduce((a, l) => a + l.minutos, 0);
  const sinRepartir = Math.max(0, Math.round(minutosFichados) - apuntado);

  function añadir() {
    if (!nuevoCliente || nuevosMinutos <= 0) return;
    setLineas((prev) => {
      const yaEsta = prev.find((l) => l.clientId === nuevoCliente && !l.medido);
      if (yaEsta) {
        return prev.map((l) =>
          l === yaEsta ? { ...l, minutos: l.minutos + nuevosMinutos } : l,
        );
      }
      return [...prev, { clientId: nuevoCliente, minutos: nuevosMinutos, medido: false, fases: [] }];
    });
    setNuevoCliente("");
    setNuevosMinutos(30);
  }

  /**
   * Lo añadido a mano se guarda como un tramo cerrado más, para que los
   * informes de tiempo salgan de un único sitio y no haya dos verdades.
   */
  async function confirmar() {
    setGuardando(true);
    setError(null);
    const aMano = lineas.filter((l) => !l.medido && l.minutos > 0);
    if (aMano.length > 0) {
      const fin = new Date();
      const filas = aMano.map((l) => {
        const inicio = new Date(fin.getTime() - l.minutos * 60000);
        return {
          card_id: null,
          client_id: l.clientId,
          column_key: "",
          column_label: "Apuntado al salir",
          profile_id: me.id,
          started_at: inicio.toISOString(),
          ended_at: fin.toISOString(),
        };
      });
      const { error: fallo } = await supabase.from("work_sessions").insert(filas);
      if (fallo) {
        setGuardando(false);
        setError("No se ha podido guardar el reparto. Puedes salir igualmente.");
        return;
      }
    }
    setGuardando(false);
    onConfirmar();
  }

  const disponibles = clients.filter(
    (c) => !lineas.some((l) => l.clientId === c.id && !l.medido),
  );

  return (
    <div className="salida" role="dialog" aria-label="Antes de salir">
      <div className="salida__caja">
        <header className="salida__cab">
          <div>
            <h2 className="salida__titulo">Antes de salir</h2>
            <p className="salida__sub">
              Con qué clientes has estado hoy. Lo que tenías cronometrado ya está puesto.
            </p>
          </div>
          <button type="button" className="ficha__cerrar" onClick={onCancelar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {cargando && <p className="panel__vacio">Mirando tus cronómetros…</p>}

        {!cargando && (
          <>
            {lineas.length === 0 && (
              <p className="salida__vacio">
                Hoy no has puesto ningún cronómetro. Apunta aquí abajo con quién has estado y
                cuánto, aunque sea aproximado.
              </p>
            )}

            {lineas.length > 0 && (
              <ul className="salida__lista">
                {lineas.map((l, i) => (
                  <li key={`${l.clientId}-${l.medido}-${i}`}>
                    <span className="salida__cliente">
                      {nombreDe[l.clientId] ?? "Cliente"}
                      {l.fases.length > 0 && (
                        <span className="salida__fases">{l.fases.join(" · ")}</span>
                      )}
                    </span>
                    {l.medido ? (
                      <span className="salida__tiempo" title="Medido con el cronómetro">
                        {reloj(l.minutos)}
                      </span>
                    ) : (
                      <span className="salida__ajuste">
                        <input
                          className="input-inline"
                          type="number"
                          min={5}
                          step={5}
                          value={l.minutos}
                          onChange={(e) =>
                            setLineas((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, minutos: Number(e.target.value) || 0 } : x,
                              ),
                            )
                          }
                        />
                        <span>min</span>
                        <button
                          type="button"
                          className="checklist__remove"
                          onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Quitar"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="salida__total">
              <span>
                Apuntado <b>{reloj(apuntado)}</b> de <b>{reloj(minutosFichados)}</b> fichados
              </span>
              {sinRepartir > 10 && (
                <span className="salida__resto">{reloj(sinRepartir)} sin repartir</span>
              )}
            </div>

            {disponibles.length > 0 && (
              <div className="salida__añadir">
                <select
                  className="input-inline"
                  value={nuevoCliente}
                  onChange={(e) => setNuevoCliente(e.target.value)}
                >
                  <option value="">Añadir un cliente…</option>
                  {disponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input-inline salida__min"
                  type="number"
                  min={5}
                  step={5}
                  value={nuevosMinutos}
                  onChange={(e) => setNuevosMinutos(Number(e.target.value) || 0)}
                  aria-label="Minutos"
                />
                <button
                  type="button"
                  className="btn"
                  onClick={añadir}
                  disabled={!nuevoCliente || nuevosMinutos <= 0}
                >
                  Añadir
                </button>
              </div>
            )}

            {error && <div className="notice notice--error">{error}</div>}

            <div className="salida__botones">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void confirmar()}
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Confirmar y fichar la salida"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onCancelar}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
