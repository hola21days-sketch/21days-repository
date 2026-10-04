"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { initialsOf, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, destaca } from "@/lib/prioridad";
import type { ClientTask, PersonalNote, Profile } from "@/lib/types";
import { leerAsignados } from "@/lib/asignados";

type Props = {
  me: Profile;
  clientNames: Record<string, string>;
  onAbrirCliente: (clientId: string) => void;
};

/** El valor del desplegable de cliente para lo que es solo tuyo. */
const SOLO_MIO = "__solo_mio__";

/**
 * Una tarjeta del planificador: o una tarea de un cliente, o una cosa de
 * trabajo tuya sin cliente (que vive en tu agenda privada y no la ve nadie).
 */
type Item =
  | { tipo: "cliente"; id: string; text: string; due_date: string | null; tarea: ClientTask }
  | { tipo: "mia"; id: string; text: string; due_date: string | null; nota: PersonalNote };

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
  const cols = casillas();
  const [tareas, setTareas] = useState<ClientTask[]>([]);
  const [mias, setMias] = useState<PersonalNote[]>([]);
  const [cargando, setCargando] = useState(true);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  // Alta rápida: texto, de qué cliente y para qué día.
  const [texto, setTexto] = useState("");
  const [cliente, setCliente] = useState("");
  const [cuando, setCuando] = useState<string>(dia(0));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Lo mío sin cliente: privado, solo lo leo yo.
    const propias = await supabase
      .from("personal_notes")
      .select("*")
      .eq("profile_id", me.id)
      .eq("trabajo", true)
      .eq("done", false);
    setMias((propias.data ?? []) as PersonalNote[]);
    // Las que llevo yo, que ahora pueden llevarlas varios: primero mis
    // asignaciones y después esas tareas.
    const asignados = await leerAsignados(supabase);
    const mias = Object.entries(asignados)
      .filter(([, gente]) => gente.includes(me.id))
      .map(([id]) => id);
    if (mias.length === 0) {
      setTareas([]);
      setCargando(false);
      return;
    }
    const { data } = await supabase
      .from("client_tasks")
      .select("*")
      .in("id", mias)
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_task_assignees" },
        () => {
          void cargar();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, me.id, cargar]);

  /**
   * Añade una tarea desde aquí. Va al canal del cliente como cualquier otra
   * —no es una lista aparte— y se asigna a quien la escribe, que es el sentido
   * de crearla desde tu propia agenda.
   */
  async function añadir() {
    const t = texto.trim();
    if (guardando) return;
    if (!t) {
      setAviso("Escribe qué hay que hacer.");
      return;
    }
    if (!cliente) {
      setAviso("Elige de qué cliente es, o «Solo para mí» si no es de ninguno.");
      return;
    }
    setGuardando(true);
    setAviso(null);
    const due = cuando === "" ? null : cuando === "resto" ? dia(7) : cuando;
    if (cliente === SOLO_MIO) {
      // Sin cliente: va a mi agenda privada, marcada como trabajo.
      const { data: nota, error: fallo } = await supabase
        .from("personal_notes")
        .insert({ profile_id: me.id, text: t, due_date: due, trabajo: true })
        .select("*")
        .single();
      setGuardando(false);
      if (fallo || !nota) {
        setAviso(`No se ha podido guardar. ${fallo?.message ?? ""}`.trim());
        return;
      }
      setMias((prev) => (prev.some((x) => x.id === nota.id) ? prev : [...prev, nota as PersonalNote]));
      setTexto("");
      return;
    }
    const { data, error } = await supabase
      .from("client_tasks")
      .insert({ client_id: cliente, text: t, due_date: due })
      .select("*")
      .single();
    if (error || !data) {
      setGuardando(false);
      setAviso(`No se ha podido guardar. ${error?.message ?? ""}`.trim());
      return;
    }
    // Creada desde mi agenda: me la quedo yo. Luego se puede repartir.
    await supabase
      .from("client_task_assignees")
      .insert({ task_id: (data as ClientTask).id, profile_id: me.id });
    setGuardando(false);
    setTareas((prev) => [...prev, data as ClientTask]);
    setTexto("");
  }

  /** Mover de columna es ponerle otra fecha de entrega. */
  async function mover(t: Item, columna: string) {
    const due = columna === "" ? null : columna === "resto" ? dia(7) : columna;
    if (due === t.due_date) return;
    if (t.tipo === "mia") {
      setMias((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_date: due } : x)));
      await supabase.from("personal_notes").update({ due_date: due }).eq("id", t.id);
      return;
    }
    setTareas((prev) => prev.map((x) => (x.id === t.id ? { ...x, due_date: due } : x)));
    await supabase.from("client_tasks").update({ due_date: due }).eq("id", t.id);
  }

  async function terminar(t: Item) {
    const cambio = { done: true, done_at: new Date().toISOString() };
    if (t.tipo === "mia") {
      setMias((prev) => prev.filter((x) => x.id !== t.id));
      await supabase.from("personal_notes").update(cambio).eq("id", t.id);
      return;
    }
    setTareas((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("client_tasks").update(cambio).eq("id", t.id);
  }

  const items = useMemo<Item[]>(
    () => [
      ...tareas.map((t) => ({ tipo: "cliente" as const, id: t.id, text: t.text, due_date: t.due_date, tarea: t })),
      ...mias.map((n) => ({ tipo: "mia" as const, id: n.id, text: n.text, due_date: n.due_date, nota: n })),
    ],
    [tareas, mias],
  );

  const pasado = cols[2].clave;

  function enQue(t: Item): string {
    if (!t.due_date) return "";
    // Lo vencido se enseña en Hoy: es lo que hay que resolver ya.
    if (t.due_date <= cols[0].clave) return cols[0].clave;
    if (t.due_date === cols[1].clave) return cols[1].clave;
    if (t.due_date === pasado) return pasado;
    return "resto";
  }

  const porColumna = useMemo(() => {
    const mapa: Record<string, Item[]> = {};
    for (const c of cols) mapa[c.clave] = [];
    for (const t of items) mapa[enQue(t)].push(t);
    // Lo mío sin cliente no tiene prioridad: cuenta como normal.
    const peso = (t: Item) => pesoPrioridad(t.tipo === "cliente" ? t.tarea.priority : "normal");
    for (const k of Object.keys(mapa)) {
      mapa[k].sort(
        (a, b) => peso(a) - peso(b) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      );
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <div className="agenda__col">
      <div className="tasks__head">
        <h2 className="tasks__title">Mi trabajo</h2>
        <span className="count-chip">{items.length}</span>
      </div>

      <p className="claves__aviso">
        Tus tareas de los clientes, para repartirlas por días. Arrástralas de una columna a otra o
        usa los botones: <b>lo que muevas aquí cambia su fecha de entrega</b> también en el canal
        del cliente y en el panel del equipo. Lo que añadas como <b>«Solo para mí»</b> no es de
        ningún cliente y no lo ve nadie más.
      </p>

      {/* Alta rápida. Hace falta el cliente porque la tarea vive en su canal:
          aquí no hay una lista aparte, es la misma de siempre vista por días. */}
      <div className="plan__alta">
        <input
          className="input-inline plan__alta-texto"
          placeholder="Qué hay que hacer…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void añadir();
            }
          }}
        />
        <select
          className="input-inline"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          aria-label="De qué cliente"
        >
          <option value="">Cliente…</option>
          <option value={SOLO_MIO}>Solo para mí (sin cliente)</option>
          {Object.entries(clientNames)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
        </select>
        <select
          className="input-inline"
          value={cuando}
          onChange={(e) => setCuando(e.target.value)}
          aria-label="Para cuándo"
        >
          {cols.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.titulo}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void añadir()}
          disabled={guardando}
        >
          {guardando ? "Añadiendo…" : "Añadir"}
        </button>
      </div>

      {aviso && <div className="notice notice--error">{aviso}</div>}

      {cargando && <p className="panel__vacio">Cargando…</p>}
      {!cargando && items.length === 0 && (
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
              const t = items.find((x) => x.id === arrastrando);
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
                    {t.tipo === "cliente" && destaca(t.tarea.priority) && (
                      <span className={`prio prio--${t.tarea.priority}`}>
                        {etiqueta(t.tarea.priority)}
                      </span>
                    )}
                  </div>

                  <p className="plan__texto">{t.text}</p>

                  {t.tipo === "cliente" ? (
                    <button
                      type="button"
                      className="plan__cliente"
                      onClick={() => onAbrirCliente(t.tarea.client_id)}
                    >
                      <Stamp
                        label={initialsOf(clientNames[t.tarea.client_id] ?? "?")}
                        color={stampColor(t.tarea.client_id)}
                      />
                      {clientNames[t.tarea.client_id] ?? "Cliente"}
                    </button>
                  ) : (
                    <span className="plan__cliente plan__cliente--mio" title="Sin cliente: solo lo ves tú">
                      🔒 Solo tú
                    </span>
                  )}

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
