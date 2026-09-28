"use client";

import { useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { initialsOf, stampColor } from "@/lib/format";
import type { Profile, WorkSession } from "@/lib/types";

type ClienteBreve = { id: string; name: string };

/** Lo que se puede haber estado haciendo, con su icono para reconocerlo rápido. */
const TAREAS = [
  { key: "Idear", icono: "💡" },
  { key: "Grabar", icono: "🎥" },
  { key: "Editar", icono: "✂️" },
  { key: "Programar", icono: "📅" },
  { key: "Report", icono: "📊" },
  { key: "Reunión", icono: "💬" },
  { key: "Otros", icono: "•" },
];

/** Los ratos que se apuntan de verdad; el resto, a mano. */
const RATOS = [15, 30, 45, 60, 90, 120, 180, 240];

type Linea = {
  id: string;
  clientId: string;
  fase: string;
  minutos: number;
  /** Medido por el cronómetro (no se toca) o apuntado a mano al salir. */
  medido: boolean;
};

type Props = {
  me: Profile;
  clients: ClienteBreve[];
  onConfirmar: () => void;
  onCancelar: () => void;
};

function reloj(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/**
 * El parte del día, al terminar la jornada.
 * ---------------------------------------------------------------------------
 * Se responde a una sola pregunta —qué has hecho hoy— en tres gestos: eliges
 * la tarea, marcas los clientes y das el rato. Lo que ya estaba cronometrado
 * aparece solo. Cada línea se puede tocar o quitar hasta que se guarda.
 */
export default function SalidaDelDia({ me, clients, onConfirmar, onCancelar }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [fase, setFase] = useState("Editar");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [minutos, setMinutos] = useState(60);

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
        .gte("started_at", desde.toISOString());

      const ahora = Date.now();
      const agrupado = new Map<string, number>();
      for (const s of (data ?? []) as WorkSession[]) {
        const ini = new Date(s.started_at).getTime();
        const fin = s.ended_at ? new Date(s.ended_at).getTime() : ahora;
        const clave = `${s.client_id}|${s.column_label || "Otros"}`;
        agrupado.set(clave, (agrupado.get(clave) ?? 0) + Math.max(0, (fin - ini) / 60000));
      }

      setLineas(
        [...agrupado.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([clave, min], i) => {
            const [clientId, f] = clave.split("|");
            return { id: `medido-${i}`, clientId, fase: f, minutos: Math.round(min), medido: true };
          }),
      );
      setCargando(false);
    })();
  }, [supabase, me.id]);

  const total = lineas.reduce((a, l) => a + l.minutos, 0);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, busca]);

  function alternar(clientId: string) {
    setElegidos((prev) =>
      prev.includes(clientId) ? prev.filter((x) => x !== clientId) : [...prev, clientId],
    );
  }

  function añadir() {
    if (elegidos.length === 0 || minutos <= 0) return;
    setLineas((prev) => {
      let siguiente = [...prev];
      for (const clientId of elegidos) {
        const ya = siguiente.find((l) => l.clientId === clientId && l.fase === fase && !l.medido);
        siguiente = ya
          ? siguiente.map((l) => (l === ya ? { ...l, minutos: l.minutos + minutos } : l))
          : [
              ...siguiente,
              { id: `${clientId}-${fase}-${Date.now()}`, clientId, fase, minutos, medido: false },
            ];
      }
      return siguiente;
    });
    setElegidos([]);
    setBusca("");
  }

  /**
   * Lo apuntado a mano se guarda como un tramo cerrado más, para que los
   * informes de tiempo salgan de un único sitio y no haya dos verdades.
   */
  async function confirmar() {
    setGuardando(true);
    setError(null);
    const aMano = lineas.filter((l) => !l.medido && l.minutos > 0);
    if (aMano.length > 0) {
      const fin = new Date();
      const { error: fallo } = await supabase.from("work_sessions").insert(
        aMano.map((l) => ({
          card_id: null,
          client_id: l.clientId,
          column_key: "",
          column_label: l.fase,
          profile_id: me.id,
          started_at: new Date(fin.getTime() - l.minutos * 60000).toISOString(),
          ended_at: fin.toISOString(),
        })),
      );
      if (fallo) {
        setGuardando(false);
        setError("No se ha podido guardar el parte. Puedes salir igualmente.");
        return;
      }
    }
    setGuardando(false);
    onConfirmar();
  }

  const iconoDe = (f: string) => TAREAS.find((t) => t.key === f)?.icono ?? "•";

  return (
    <div className="parte" role="dialog" aria-label="Parte del día">
      <div className="parte__caja">
        <header className="parte__cab">
          <div>
            <h2 className="parte__titulo">¿Qué has hecho hoy?</h2>
            <p className="parte__sub">
              Apúntalo antes de cerrar la jornada. Si llevabas el cronómetro, ya está puesto.
            </p>
          </div>
          <button type="button" className="parte__cerrar" onClick={onCancelar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="parte__cuerpo">
          {/* ------------------------------------------------- lo ya apuntado */}
          <div className="parte__lista">
            {cargando && <p className="parte__vacio">Mirando lo de hoy…</p>}

            {!cargando && lineas.length === 0 && (
              <p className="parte__vacio">
                Todavía no has apuntado nada. Añade abajo lo que hayas hecho — aunque sea
                aproximado, vale.
              </p>
            )}

            {lineas.map((l) => (
              <div key={l.id} className={l.medido ? "parte__linea is-medida" : "parte__linea"}>
                <span className="parte__icono" aria-hidden>
                  {iconoDe(l.fase)}
                </span>
                <span className="parte__que">
                  <b>{l.fase}</b>
                  <span className="parte__de">
                    <Stamp
                      label={initialsOf(nombreDe[l.clientId] ?? "?")}
                      color={stampColor(l.clientId)}
                    />
                    {nombreDe[l.clientId] ?? "Cliente"}
                  </span>
                </span>

                {l.medido ? (
                  <span className="parte__rato" title="Medido con el cronómetro">
                    {reloj(l.minutos)}
                    <small>cronómetro</small>
                  </span>
                ) : (
                  <span className="parte__ajuste">
                    <button
                      type="button"
                      onClick={() =>
                        setLineas((prev) =>
                          prev.map((x) =>
                            x.id === l.id ? { ...x, minutos: Math.max(15, x.minutos - 15) } : x,
                          ),
                        )
                      }
                      aria-label="Quitar 15 minutos"
                    >
                      −
                    </button>
                    <b>{reloj(l.minutos)}</b>
                    <button
                      type="button"
                      onClick={() =>
                        setLineas((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, minutos: x.minutos + 15 } : x)),
                        )
                      }
                      aria-label="Añadir 15 minutos"
                    >
                      +
                    </button>
                  </span>
                )}

                {!l.medido && (
                  <button
                    type="button"
                    className="parte__quitar"
                    onClick={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))}
                    aria-label="Quitar esta línea"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ------------------------------------------------------ añadir más */}
          <div className="parte__nuevo">
            <div className="parte__paso">
              <span className="parte__num">1</span>
              <div className="parte__tareas">
                {TAREAS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={fase === t.key ? "parte__tarea is-on" : "parte__tarea"}
                    onClick={() => setFase(t.key)}
                  >
                    <span aria-hidden>{t.icono}</span>
                    {t.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="parte__paso">
              <span className="parte__num">2</span>
              <div className="parte__clientes-caja">
                <input
                  className="input-inline parte__busca"
                  placeholder="Busca un cliente…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <div className="parte__clientes">
                  {visibles.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={elegidos.includes(c.id) ? "parte__chip is-on" : "parte__chip"}
                      onClick={() => alternar(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                  {visibles.length === 0 && <span className="parte__vacio">Nada con ese nombre.</span>}
                </div>
              </div>
            </div>

            <div className="parte__paso">
              <span className="parte__num">3</span>
              <div className="parte__ratos">
                {RATOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={minutos === m ? "parte__rato-op is-on" : "parte__rato-op"}
                    onClick={() => setMinutos(m)}
                  >
                    {reloj(m)}
                  </button>
                ))}
                <input
                  className="input-inline parte__otro"
                  type="number"
                  min={5}
                  step={5}
                  value={minutos}
                  onChange={(e) => setMinutos(Number(e.target.value) || 0)}
                  aria-label="Otro rato en minutos"
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary parte__add"
              onClick={añadir}
              disabled={elegidos.length === 0 || minutos <= 0}
            >
              {elegidos.length === 0
                ? "Marca al menos un cliente"
                : `Añadir ${fase.toLowerCase()} · ${reloj(minutos)} · ${
                    elegidos.length === 1
                      ? (nombreDe[elegidos[0]] ?? "1 cliente")
                      : `${elegidos.length} clientes`
                  }`}
            </button>
          </div>

          {error && <div className="notice notice--error">{error}</div>}
        </div>

        <footer className="parte__pie">
          <span className="parte__total">
            Total de hoy <b>{reloj(total)}</b>
          </span>
          <div className="parte__botones">
            <button type="button" className="btn btn--ghost" onClick={onCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void confirmar()}
              disabled={guardando}
            >
              {guardando ? "Guardando…" : "Guardar y cerrar la jornada"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
