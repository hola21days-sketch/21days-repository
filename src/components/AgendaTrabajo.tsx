"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { initialsOf, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, destaca } from "@/lib/prioridad";
import type { ClientTask, Profile } from "@/lib/types";

type Props = {
  me: Profile;
  clientNames: Record<string, string>;
  onAbrirCliente: (clientId: string) => void;
};

/** Una fecha en ISO, sumando días a hoy. */
function dia(suma: number): string {
  const d = new Date();
  d.setDate(d.getDate() + suma);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Las cuatro casillas fijas del planificador, más el cajón de lo que no tiene día. */
function casillas() {
  const hoy = dia(0);
  const mañana = dia(1);
  const pasado = dia(2);
  const d = new Date(`${pasado}T12:00:00`);
  return [
    { clave: hoy, titulo: "Hoy", sub: null as string | null },
    { clave: mañana, titulo: "Mañana", sub: null },
    { clave: pasado, titulo: "Pasado", sub: `${DIAS[d.getDay()]} ${d.getDate()}` },
    { clave: "resto", titulo: "Más adelante", sub: null },
    { clave: "", titulo: "Sin día", sub: "Por repartir" },
  ];
}

/**
 * Mi agenda de trabajo.
 * ---------------------------------------------------------------------------
 * Las mismas tareas que ya tienes asignadas en los canales de los clientes,
 * puestas aquí en columnas por día para poder repartirlas: hoy, mañana,
 * pasado, más adelante, y un cajón con las que todavía no tienen día.
 *
 * Cambiar una de sitio es cambiarle la fecha de entrega, no una copia: lo que
 * se mueva aquí se ve en el canal del cliente y en el panel del equipo. No hay
 * dos verdades.
 */
export default function AgendaTrabajo({ me, clientNames, onAbrirCliente }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tareas, setTareas] = useState<ClientTask[]>([]);
  const [cargando, setCargando] = useState(true);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("assignee_id", me.id)
      .eq("done", false);
    setTareas((data ?? []) as ClientTask[]);
    setCargando(false);
  }, [supabase, me.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const canal = supabase
      .channel(`agenda-trabajo-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_tasks" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, me.id, cargar]);

  /** Mover de columna es ponerle otra fecha de entrega. */
  async function mover(t: ClientTask, columna: string) {
    const due = columna === "" ? null : columna === "resto" ? dia(7) : columna;
    if (due === t.due_date) return;
    setTareas((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_date: due } : x)));
    await supabase.from("client_tasks").update({ due_date: due }).eq("id", t.id);
  }

  async function terminar(t: ClientTask) {
    setTareas((prev) => prev.filter((x) => x.id !== t.id));
    await supabase
      .from("client_tasks")
      .update({ done: true, done_at: new Date().toISOString() })
      .eq("id", t.id);
  }

  const cols = casillas();
  const pasado = cols[2].clave;

  function enQue(t: ClientTask): string {
    if (!t.due_date) return "";
    // Lo vencido se enseña en Hoy: es lo que hay que resolver ya.
    if (t.due_date <= cols[0].clave) return cols[0].clave;
    if (t.due_date === cols[1].clave) return cols[1].clave;
    if (t.due_date === pasado) return pasado;
    return "resto";
  }

  const porColumna = useMemo(() => {
    const mapa: Record<string, ClientTask[]> = {};
    for (const c of cols) mapa[c.clave] = [];
    for (const t of tareas) mapa[enQue(t)].push(t);
    for (const k of Object.keys(mapa)) {
      mapa[k].sort(
        (a, b) =>
          pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      );
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareas]);

  return (
    <div className="agenda__col">
      <div className="tasks__head">
        <h2 className="tasks__title">Mi trabajo</h2>
        <span className="count-chip">{tareas.length}</span>
      </div>

      <p className="claves__aviso">
        Tus tareas de los clientes, para repartirlas por días. Arrástralas de una columna a otra o
        usa los botones: <b>lo que muevas aquí cambia su fecha de entrega</b> también en el canal
        del cliente y en el panel del equipo.
      </p>

      {cargando && <p className="panel__vacio">Cargando…</p>}
      {!cargando && tareas.length === 0 && (
        <p className="panel__vacio">
          No tienes ninguna tarea asignada. Se asignan desde el canal de cada cliente, en{" "}
          <b>Tareas</b>.
        </p>
      )}

      <div className="plan">
        {cols.map((c) => (
          <section
            key={c.clave}
            className={encima === c.clave ? "plan__col is-encima" : "plan__col"}
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(c.clave);
            }}
            onDragLeave={() => setEncima((x) => (x === c.clave ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(null);
              const t = tareas.find((x) => x.id === arrastrando);
              if (t) void mover(t, c.clave);
              setArrastrando(null);
            }}
          >
            <header className="plan__cab">
              <span className="plan__tit">{c.titulo}</span>
              <span className="count-chip">{porColumna[c.clave].length}</span>
              {c.sub && <span className="plan__sub">{c.sub}</span>}
            </header>

            <ul className="plan__lista">
              {porColumna[c.clave].map((t) => (
                <li
                  key={t.id}
                  className="plan__tarea"
                  draggable
                  onDragStart={() => setArrastrando(t.id)}
                  onDragEnd={() => setArrastrando(null)}
                >
                  <div className="plan__tarea-cab">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => void terminar(t)}
                      title="Dar por hecha"
                      aria-label={`Dar por hecha: ${t.text}`}
                    />
                    {destaca(t.priority) && (
                      <span className={`prio prio--${t.priority}`}>{etiqueta(t.priority)}</span>
                    )}
                  </div>

                  <p className="plan__texto">{t.text}</p>

                  <button
                    type="button"
                    className="plan__cliente"
                    onClick={() => onAbrirCliente(t.client_id)}
                  >
                    <Stamp
                      label={initialsOf(clientNames[t.client_id] ?? "?")}
                      color={stampColor(t.client_id)}
                    />
                    {clientNames[t.client_id] ?? "Cliente"}
                  </button>

                  {/* Los mismos movimientos sin arrastrar: en el móvil no se
                      puede, y con el ratón a veces es más rápido pulsar. */}
                  <div className="plan__mover">
                    {cols
                      .filter((x) => x.clave !== c.clave)
                      .map((x) => (
                        <button
                          key={x.clave}
                          type="button"
                          className="plan__mover-op"
                          onClick={() => void mover(t, x.clave)}
                          title={`Mover a ${x.titulo}`}
                        >
                          {x.titulo}
                        </button>
                      ))}
                  </div>
                </li>
              ))}

              {porColumna[c.clave].length === 0 && <li className="plan__vacio">—</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
