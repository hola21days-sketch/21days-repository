"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import QuienLaHace from "./QuienLaHace";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, destaca, PRIORIDADES } from "@/lib/prioridad";
import { conEnlaces } from "@/lib/enlaces";
import type { ClientTask, PersonalNote, Prioridad, Profile } from "@/lib/types";
import { alternarAsignado, leerAsignados, type Asignados } from "@/lib/asignados";

type Props = {
  me: Profile;
  profiles: Profile[];
  clientNames: Record<string, string>;
  onAbrirCliente: (clientId: string) => void;
};

/** El valor del desplegable de cliente para lo que es solo tuyo. */
const SOLO_MIO = "__solo_mio__";
/** Dónde se recuerda el último cliente elegido al añadir, en este aparato. */
const CLAVE_ULTIMO = "agenda-trabajo:ultimo-cliente";

/**
 * Una tarjeta del tablero: o una tarea de un cliente, o una cosa de trabajo
 * tuya sin cliente (que vive en tu agenda privada y no la ve nadie).
 */
type Item =
  | { tipo: "cliente"; id: string; text: string; notes: string; due_date: string | null; tarea: ClientTask }
  | { tipo: "mia"; id: string; text: string; notes: string; due_date: string | null; nota: PersonalNote };

/** Una fecha en ISO, sumando días a hoy. */
function dia(suma: number): string {
  const d = new Date();
  d.setDate(d.getDate() + suma);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Las cuatro listas fijas del tablero, más la de lo que no tiene día. */
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

/** La fecha que corresponde a una lista. */
function fechaDe(columna: string): string | null {
  return columna === "" ? null : columna === "resto" ? dia(7) : columna;
}

function leerUltimo(): string {
  try {
    return localStorage.getItem(CLAVE_ULTIMO) ?? SOLO_MIO;
  } catch {
    return SOLO_MIO;
  }
}

/**
 * Mi trabajo, como un tablero de Trello.
 * ---------------------------------------------------------------------------
 * Una lista por día —hoy, mañana, pasado, más adelante y sin día— con las
 * tareas que llevas en los clientes y lo de trabajo que es solo tuyo. Se
 * arrastran de una lista a otra, cada lista tiene su «+ Añadir una tarjeta» y
 * al pulsar una tarjeta se abre entera para leerla y cambiarla.
 *
 * Una tarea de cliente no es una copia: lo que cambies aquí (la fecha, el
 * texto, quién la lleva) se ve en el canal del cliente y en el panel.
 */
export default function AgendaTrabajo({ me, profiles, clientNames, onAbrirCliente }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const cols = casillas();
  const [tareas, setTareas] = useState<ClientTask[]>([]);
  const [mias, setMias] = useState<PersonalNote[]>([]);
  const [asignados, setAsignados] = useState<Asignados>({});
  const [cargando, setCargando] = useState(true);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // El «+ Añadir una tarjeta» abierto, en qué lista, y lo que se va escribiendo.
  const [componiendo, setComponiendo] = useState<string | null>(null);
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [nuevoCliente, setNuevoCliente] = useState<string>(SOLO_MIO);
  const [guardando, setGuardando] = useState(false);
  const campoNuevo = useRef<HTMLTextAreaElement>(null);

  // La tarjeta abierta.
  const [abierta, setAbierta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState({ text: "", notes: "" });

  useEffect(() => setNuevoCliente(leerUltimo()), []);

  const cargar = useCallback(async () => {
    // Lo mío sin cliente: privado, solo lo leo yo.
    const [propias, todos] = await Promise.all([
      supabase
        .from("personal_notes")
        .select("*")
        .eq("profile_id", me.id)
        .eq("trabajo", true)
        .eq("done", false),
      leerAsignados(supabase),
    ]);
    setMias((propias.data ?? []) as PersonalNote[]);
    setAsignados(todos);
    // Las que llevo yo, que pueden llevarlas varios.
    const ids = Object.entries(todos)
      .filter(([, gente]) => gente.includes(me.id))
      .map(([id]) => id);
    if (ids.length === 0) {
      setTareas([]);
    } else {
      const { data } = await supabase
        .from("client_tasks")
        .select("*")
        .in("id", ids)
        .eq("done", false);
      setTareas((data ?? []) as ClientTask[]);
    }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "client_task_assignees" }, () => {
        void cargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, me.id, cargar]);

  const items = useMemo<Item[]>(
    () => [
      ...tareas.map((t) => ({
        tipo: "cliente" as const,
        id: t.id,
        text: t.text,
        notes: t.notes ?? "",
        due_date: t.due_date,
        tarea: t,
      })),
      ...mias.map((n) => ({
        tipo: "mia" as const,
        id: n.id,
        text: n.text,
        notes: n.notes ?? "",
        due_date: n.due_date,
        nota: n,
      })),
    ],
    [tareas, mias],
  );

  // ------------------------------------------------------------- añadir

  function abrirComposer(columna: string) {
    setComponiendo(columna);
    setNuevoTexto("");
    setAviso(null);
    setTimeout(() => campoNuevo.current?.focus(), 0);
  }

  /**
   * Añade una tarjeta en la lista donde se ha escrito. Si es de un cliente va
   * a su canal como cualquier otra tarea y te la quedas tú; si es «Solo para
   * mí», a tu agenda privada. El cuadro se queda abierto para seguir
   * escribiendo, como en Trello.
   */
  async function añadir(columna: string) {
    const t = nuevoTexto.trim();
    if (!t || guardando) return;
    setGuardando(true);
    setAviso(null);
    const due = fechaDe(columna);
    try {
      localStorage.setItem(CLAVE_ULTIMO, nuevoCliente);
    } catch {
      /* sin almacenamiento: da igual, se vuelve a elegir */
    }

    if (nuevoCliente === SOLO_MIO) {
      const { data, error } = await supabase
        .from("personal_notes")
        .insert({ profile_id: me.id, text: t, due_date: due, trabajo: true })
        .select("*")
        .single();
      setGuardando(false);
      if (error || !data) {
        setAviso(`No se ha podido guardar. ${error?.message ?? ""}`.trim());
        return;
      }
      setMias((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as PersonalNote]));
    } else {
      const { data, error } = await supabase
        .from("client_tasks")
        .insert({ client_id: nuevoCliente, text: t, due_date: due, author_id: me.id })
        .select("*")
        .single();
      if (error || !data) {
        setGuardando(false);
        setAviso(`No se ha podido guardar. ${error?.message ?? ""}`.trim());
        return;
      }
      const nueva = data as ClientTask;
      await supabase.from("client_task_assignees").insert({ task_id: nueva.id, profile_id: me.id });
      setGuardando(false);
      setAsignados((prev) => ({ ...prev, [nueva.id]: [me.id] }));
      setTareas((prev) => (prev.some((x) => x.id === nueva.id) ? prev : [...prev, nueva]));
    }
    setNuevoTexto("");
    campoNuevo.current?.focus();
  }

  // ------------------------------------------------------------- cambiar

  /** Cambia una tarjeta, sea de cliente o tuya. */
  async function cambiar(t: Item, patch: Partial<ClientTask> & Partial<PersonalNote>) {
    if (t.tipo === "mia") {
      const { text, notes, due_date, done, done_at } = patch;
      const p = Object.fromEntries(
        Object.entries({ text, notes, due_date, done, done_at }).filter(([, v]) => v !== undefined),
      );
      setMias((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...p } : x)));
      await supabase.from("personal_notes").update(p).eq("id", t.id);
      return;
    }
    setTareas((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("client_tasks").update(patch).eq("id", t.id);
  }

  /** Mover de lista es ponerle otra fecha de entrega. */
  async function mover(t: Item, columna: string) {
    const due = fechaDe(columna);
    if (due === t.due_date) return;
    await cambiar(t, { due_date: due });
  }

  async function terminar(t: Item) {
    if (abierta === t.id) setAbierta(null);
    const cambio = { done: true, done_at: new Date().toISOString() };
    if (t.tipo === "mia") {
      setMias((prev) => prev.filter((x) => x.id !== t.id));
      await supabase.from("personal_notes").update(cambio).eq("id", t.id);
      return;
    }
    setTareas((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("client_tasks").update(cambio).eq("id", t.id);
  }

  async function borrar(t: Item) {
    const texto =
      t.tipo === "mia"
        ? `¿Borrar "${t.text}"? No se puede deshacer.`
        : `¿Borrar "${t.text}"? Es una tarea del cliente: desaparece también de su canal y para todo el equipo. No se puede deshacer.`;
    if (!confirm(texto)) return;
    setAbierta(null);
    if (t.tipo === "mia") {
      setMias((prev) => prev.filter((x) => x.id !== t.id));
      await supabase.from("personal_notes").delete().eq("id", t.id);
      return;
    }
    setTareas((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("client_tasks").delete().eq("id", t.id);
  }

  async function alternarPersona(t: ClientTask, profileId: string, estaba: boolean) {
    setAsignados((prev) => {
      const actuales = prev[t.id] ?? [];
      return {
        ...prev,
        [t.id]: estaba ? actuales.filter((x) => x !== profileId) : [...actuales, profileId],
      };
    });
    await alternarAsignado(supabase, t.id, profileId, estaba);
  }

  // ------------------------------------------------------------- abrir

  function abrir(t: Item) {
    setAbierta(t.id);
    setBorrador({ text: t.text, notes: t.notes });
  }

  const tarjeta = items.find((x) => x.id === abierta) ?? null;

  /** Guarda el título y la descripción si han cambiado, y cierra. */
  async function cerrar() {
    const t = tarjeta;
    setAbierta(null);
    if (!t) return;
    const text = borrador.text.trim();
    const patch: { text?: string; notes?: string } = {};
    if (text && text !== t.text) patch.text = text;
    if (borrador.notes !== t.notes) patch.notes = borrador.notes;
    if (Object.keys(patch).length > 0) await cambiar(t, patch);
  }

  // Escape cierra la tarjeta o el cuadro de añadir.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (abierta) void cerrar();
      else if (componiendo !== null) setComponiendo(null);
    }
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  });

  // ------------------------------------------------------------- listas

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
    // Lo tuyo sin cliente no tiene prioridad: cuenta como normal.
    const peso = (t: Item) => pesoPrioridad(t.tipo === "cliente" ? t.tarea.priority : "normal");
    for (const k of Object.keys(mapa)) {
      mapa[k].sort(
        (a, b) => peso(a) - peso(b) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      );
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const clientesOrdenados = useMemo(
    () => Object.entries(clientNames).sort((a, b) => a[1].localeCompare(b[1], "es")),
    [clientNames],
  );

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, Profile>,
    [profiles],
  );

  function etiquetaCliente(t: Item) {
    if (t.tipo === "mia") {
      return <span className="trello__cliente trello__cliente--mio">🔒 Solo tú</span>;
    }
    const nombre = clientNames[t.tarea.client_id] ?? "Cliente";
    return (
      <span className="trello__cliente">
        <Stamp label={initialsOf(nombre)} color={stampColor(t.tarea.client_id)} />
        {nombre}
      </span>
    );
  }

  return (
    <div className="agenda__col">
      <div className="tasks__head">
        <h2 className="tasks__title">Mi trabajo</h2>
        <span className="count-chip">{items.length}</span>
      </div>

      <p className="trello__pista">
        Pulsa una tarjeta para abrirla, arrástrala para cambiarla de día y usa{" "}
        <b>+ Añadir una tarjeta</b> en cada lista. Lo que elijas como <b>Solo para mí</b> no es de
        ningún cliente y no lo ve nadie más.
      </p>

      {aviso && <div className="notice notice--error">{aviso}</div>}
      {cargando && <p className="panel__vacio">Cargando…</p>}

      <div className="trello">
        {cols.map((c) => (
          <section
            key={c.clave}
            className={encima === c.clave ? "trello__lista is-encima" : "trello__lista"}
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
            <header className="trello__cab">
              <span className="trello__tit">{c.titulo}</span>
              {c.sub && <span className="trello__sub">{c.sub}</span>}
              <span className="trello__num">{porColumna[c.clave].length}</span>
            </header>

            <ul className="trello__tarjetas">
              {porColumna[c.clave].map((t) => {
                const gente =
                  t.tipo === "cliente"
                    ? (asignados[t.id] ?? []).map((id) => profileById[id]).filter(Boolean)
                    : [];
                const prio = t.tipo === "cliente" ? t.tarea.priority : null;
                return (
                  <li
                    key={t.id}
                    className={arrastrando === t.id ? "trello__tarjeta is-arrastrando" : "trello__tarjeta"}
                    draggable
                    onDragStart={() => setArrastrando(t.id)}
                    onDragEnd={() => setArrastrando(null)}
                    onClick={() => abrir(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") abrir(t);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir: ${t.text}`}
                  >
                    {prio && destaca(prio) && (
                      <span className={`prio prio--${prio}`}>{etiqueta(prio)}</span>
                    )}
                    <p className="trello__texto">{t.text}</p>
                    <div className="trello__pie">
                      {etiquetaCliente(t)}
                      {t.due_date && (
                        <span className={isOverdue(t.due_date) ? "trello__fecha is-tarde" : "trello__fecha"}>
                          🗓 {formatDue(t.due_date)}
                        </span>
                      )}
                      {t.notes.trim() && (
                        <span className="trello__icono" title="Tiene descripción">
                          ≡
                        </span>
                      )}
                      {gente.length > 0 && (
                        <span className="avatar-stack trello__gente">
                          {gente.map((p) => (
                            <Stamp
                              key={p.id}
                              label={p.initials}
                              color={p.color}
                              foto={p.avatar_url}
                              title={p.full_name}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="trello__hecha"
                      onClick={(e) => {
                        e.stopPropagation();
                        void terminar(t);
                      }}
                      title="Dar por hecha"
                      aria-label={`Dar por hecha: ${t.text}`}
                    >
                      ✓
                    </button>
                  </li>
                );
              })}
            </ul>

            {componiendo === c.clave ? (
              <div className="trello__nueva">
                <textarea
                  ref={campoNuevo}
                  className="trello__nueva-texto"
                  placeholder="Escribe un título para esta tarjeta…"
                  value={nuevoTexto}
                  rows={2}
                  onChange={(e) => setNuevoTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void añadir(c.clave);
                    }
                  }}
                />
                <select
                  className="input-inline trello__nueva-cliente"
                  value={nuevoCliente}
                  onChange={(e) => setNuevoCliente(e.target.value)}
                  aria-label="De qué cliente"
                >
                  <option value={SOLO_MIO}>🔒 Solo para mí (sin cliente)</option>
                  {clientesOrdenados.map(([id, nombre]) => (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  ))}
                </select>
                <div className="trello__nueva-botones">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void añadir(c.clave)}
                    disabled={guardando || !nuevoTexto.trim()}
                  >
                    {guardando ? "Añadiendo…" : "Añadir tarjeta"}
                  </button>
                  <button
                    type="button"
                    className="trello__cerrar"
                    onClick={() => setComponiendo(null)}
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="trello__anadir" onClick={() => abrirComposer(c.clave)}>
                + Añadir una tarjeta
              </button>
            )}
          </section>
        ))}
      </div>

      {tarjeta && (
        <div className="modal" onClick={() => void cerrar()}>
          <div
            className="modal__panel trello__modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={tarjeta.text}
          >
            <div className="trello__modal-cab">
              {etiquetaCliente(tarjeta)}
              <button type="button" className="trello__cerrar" onClick={() => void cerrar()} aria-label="Cerrar">
                ×
              </button>
            </div>

            <textarea
              className="trello__modal-titulo"
              value={borrador.text}
              rows={1}
              onChange={(e) => setBorrador({ ...borrador, text: e.target.value })}
              onBlur={() => {
                const text = borrador.text.trim();
                if (text && text !== tarjeta.text) void cambiar(tarjeta, { text });
              }}
              aria-label="Título"
            />

            <div className="trello__modal-campos">
              <label className="task__field">
                <span>Fecha</span>
                <input
                  className="input-inline"
                  type="date"
                  value={tarjeta.due_date ?? ""}
                  onChange={(e) => void cambiar(tarjeta, { due_date: e.target.value || null })}
                />
              </label>

              {tarjeta.tipo === "cliente" && (
                <>
                  <label className="task__field">
                    <span>Cliente</span>
                    <select
                      className="input-inline"
                      value={tarjeta.tarea.client_id}
                      onChange={(e) => void cambiar(tarjeta, { client_id: e.target.value })}
                    >
                      {!clientNames[tarjeta.tarea.client_id] && (
                        <option value={tarjeta.tarea.client_id}>Cliente</option>
                      )}
                      {clientesOrdenados.map(([id, nombre]) => (
                        <option key={id} value={id}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="task__field">
                    <span>Prioridad</span>
                    <select
                      className={`input-inline prio--${tarjeta.tarea.priority}`}
                      value={tarjeta.tarea.priority}
                      onChange={(e) => void cambiar(tarjeta, { priority: e.target.value as Prioridad })}
                    >
                      {PRIORIDADES.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.texto}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            {tarjeta.tipo === "cliente" && (
              <div className="task__field task__field--ancho">
                <span>Quién la hace</span>
                <QuienLaHace
                  profiles={profiles}
                  elegidos={asignados[tarjeta.id] ?? []}
                  onAlternar={(id, estaba) => void alternarPersona(tarjeta.tarea, id, estaba)}
                />
              </div>
            )}

            <div className="task__field task__field--ancho">
              <span>Descripción</span>
              <textarea
                className="input-inline trello__modal-notas"
                value={borrador.notes}
                placeholder="Añade una descripción más detallada: cómo se hace, enlaces, referencias…"
                onChange={(e) => setBorrador({ ...borrador, notes: e.target.value })}
                onBlur={() => {
                  if (borrador.notes !== tarjeta.notes) void cambiar(tarjeta, { notes: borrador.notes });
                }}
              />
              {borrador.notes.trim() && (
                <div className="explica__texto">{conEnlaces(borrador.notes, tarjeta.id)}</div>
              )}
            </div>

            <div className="trello__modal-botones">
              <button type="button" className="btn btn--primary" onClick={() => void cerrar()}>
                Guardar
              </button>
              <button type="button" className="btn" onClick={() => void terminar(tarjeta)}>
                ✓ Dar por hecha
              </button>
              {tarjeta.tipo === "cliente" && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    void cerrar();
                    onAbrirCliente(tarjeta.tarea.client_id);
                  }}
                >
                  Ir al canal →
                </button>
              )}
              <button type="button" className="btn btn--ghost trello__borrar" onClick={() => void borrar(tarjeta)}>
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
