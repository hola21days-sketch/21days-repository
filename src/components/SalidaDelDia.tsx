"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, WorkSession } from "@/lib/types";

type ClienteBreve = { id: string; name: string };

/** Lo que se puede haber estado haciendo. Son las fases del tablero de siempre. */
const TAREAS = ["Idear", "Grabar", "Editar", "Programar", "Report", "Reunión", "Otros"];

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
  /** Qué se ha hecho: editar, grabar, programar… */
  fase: string;
  minutos: number;
  /** Medido por el cronómetro (no se toca) o apuntado a mano al salir. */
  medido: boolean;
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
  const [nuevaFase, setNuevaFase] = useState("Editar");
  const [nuevosMinutos, setNuevosMinutos] = useState(60);
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
      const agrupado = new Map<string, number>();
      for (const s of (data ?? []) as WorkSession[]) {
        const ini = new Date(s.started_at).getTime();
        const fin = s.ended_at ? new Date(s.ended_at).getTime() : ahora;
        const min = Math.max(0, (fin - ini) / 60000);
        const clave = `${s.client_id}|${s.column_label || "Otros"}`;
        agrupado.set(clave, (agrupado.get(clave) ?? 0) + min);
      }

      setLineas(
        [...agrupado.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([clave, min]) => {
            const [clientId, fase] = clave.split("|");
            return { clientId, fase, minutos: Math.round(min), medido: true };
          }),
      );
      setCargando(false);
    })();
  }, [supabase, me.id]);

  const apuntado = lineas.reduce((a, l) => a + l.minutos, 0);

  function añadir() {
    if (!nuevoCliente || nuevosMinutos <= 0) return;
    setLineas((prev) => {
      const yaEsta = prev.find(
        (l) => l.clientId === nuevoCliente && l.fase === nuevaFase && !l.medido,
      );
      if (yaEsta) {
        return prev.map((l) => (l === yaEsta ? { ...l, minutos: l.minutos + nuevosMinutos } : l));
      }
      return [...prev, { clientId: nuevoCliente, fase: nuevaFase, minutos: nuevosMinutos, medido: false }];
    });
    setNuevoCliente("");
    setNuevosMinutos(60);
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
          column_label: l.fase,
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

  // Se puede repetir cliente con otra tarea, así que siempre salen todos.
  const disponibles = clients;

  return (
    <div className="salida" role="dialog" aria-label="Antes de salir">
      <div className="salida__caja">
        <header className="salida__cab">
          <div>
            <h2 className="salida__titulo">Antes de salir</h2>
            <p className="salida__sub">
              ¿Qué has hecho hoy? Apunta qué has hecho, de qué cliente y cuánto rato. Con eso
              se cierra tu jornada.
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
                Apunta aquí abajo qué has hecho hoy: la tarea, el cliente y el rato. Puedes
                añadir tantas líneas como quieras, y aunque sea aproximado vale.
              </p>
            )}

            {lineas.length > 0 && (
              <ul className="salida__lista">
                {lineas.map((l, i) => (
                  <li key={`${l.clientId}-${l.medido}-${i}`}>
                    <span className="salida__cliente">
                      {nombreDe[l.clientId] ?? "Cliente"}
                      <span className="salida__fases">{l.fase}</span>
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
                Total del día: <b>{reloj(apuntado)}</b>
              </span>
              {apuntado === 0 && <span className="salida__resto">Falta apuntar algo</span>}
            </div>

            {disponibles.length > 0 && (
              <div className="salida__añadir">
                <select
                  className="input-inline"
                  value={nuevaFase}
                  onChange={(e) => setNuevaFase(e.target.value)}
                  aria-label="Qué has hecho"
                >
                  {TAREAS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  className="input-inline"
                  value={nuevoCliente}
                  onChange={(e) => setNuevoCliente(e.target.value)}
                  aria-label="De qué cliente"
                >
                  <option value="">de qué cliente…</option>
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
                {guardando ? "Guardando…" : "Guardar y salir"}
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
