"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { BoardColumn, ClientTask, Prioridad, Profile } from "@/lib/types";
import { leerAsignados, type Asignados } from "@/lib/asignados";
import { claveDeFase, FASES_CONOCIDAS } from "@/lib/fases";

type ClienteDePanel = { id: string; name: string; kind: string; priority: Prioridad };

type Avance = {
  client_id: string;
  month: string;
  phase_key: string;
  done: boolean;
  done_by: string | null;
  /** Empezado pero sin terminar: lo típico de grabar en dos días. */
  partial: boolean;
  /** Qué falta, cuando está a medias. */
  note: string;
};

/** Los tres estados de una casilla, en el orden en que se van pulsando. */
type Estado = "no" | "medias" | "hecha";

type Props = {
  clients: ClienteDePanel[];
  columns: BoardColumn[];
  profileById: Record<string, Profile>;
  me: Profile;
  onAbrirCliente: (clientId: string) => void;
  onPrioridadCliente: (clientId: string, priority: Prioridad) => void;
  onNuevoCliente: () => void;
  /** Lo saca del tablero y nada más: su canal, su chat y sus tareas siguen. */
  onQuitarDelPanel: (clientId: string) => void;
  /** Para releer las columnas cuando se cambia qué lleva un cliente. */
  onFasesCambiadas: () => void;
  onBorrarCliente: (clientId: string) => void;
};

/** El día 1 de un mes, que es como se guarda el avance. */
function primeroDeMes(anyo: number, mes: number): string {
  return `${anyo}-${String(mes + 1).padStart(2, "0")}-01`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombreDeMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function finDeSemanaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function finDeMesISO(): string {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
}

/**
 * Panel de clientes: el estado de todas las cuentas en una pantalla.
 * ---------------------------------------------------------------------------
 * Arriba, la rejilla del mes: una fila por cliente y una casilla por fase
 * (Idear, Grabar, Editar, Programar, Report). Marcarla deja constancia de
 * quién la dio por hecha. Debajo, los pendientes de todos los clientes
 * agrupados por prioridad, con su responsable y su fecha de entrega.
 */
export default function Panel({
  clients,
  columns,
  profileById,
  me,
  onAbrirCliente,
  onPrioridadCliente,
  onNuevoCliente,
  onQuitarDelPanel,
  onFasesCambiadas,
  onBorrarCliente,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [avance, setAvance] = useState<Avance[]>([]);
  const [asignados, setAsignados] = useState<Asignados>({});
  const [cargando, setCargando] = useState(true);
  const [anyo, setAnyo] = useState(() => new Date().getFullYear());
  const [mesElegido, setMesElegido] = useState(() => new Date().getMonth());
  const [ventana, setVentana] = useState<"hoy" | "semana" | "mes" | "todo">("semana");
  /** La casilla abierta para decir qué falta, y dónde pintar su cuadro. */
  const [casillaAbierta, setCasillaAbierta] = useState<
    { clientId: string; phase: string; x: number; y: number } | null
  >(null);
  /** El menú del botón derecho sobre el nombre de un cliente. */
  const [menuCliente, setMenuCliente] = useState<{ id: string; x: number; y: number } | null>(null);
  /**
   * Lo que falta en una casilla a medias, para leerlo al pasar por encima.
   * Se pinta suelto y no dentro de la tabla porque la tabla se desplaza de
   * lado y le cortaría los bordes.
   */
  const [pista, setPista] = useState<{
    texto: string;
    x: number;
    y: number;
    abajo: boolean;
  } | null>(null);
  /** El cuadro de qué fases lleva un cliente. */
  const [fasesAbierta, setFasesAbierta] = useState<{ id: string; x: number; y: number } | null>(null);

  const mes = primeroDeMes(anyo, mesElegido);
  const esteMes = new Date().getFullYear() === anyo && new Date().getMonth() === mesElegido;

  /**
   * Las columnas del tablero son todas las fases que lleva alguien. No todos
   * los clientes llevan lo mismo —ads o influencers solo algunos—, así que la
   * columna aparece en cuanto hay un cliente con esa fase, y los demás salen
   * con un guion en vez de con una casilla vacía.
   */
  const fases = useMemo(() => {
    const vistas = new Map<string, { label: string; position: number }>();
    for (const c of columns) {
      const antes = vistas.get(c.key);
      if (!antes || c.position < antes.position) vistas.set(c.key, { label: c.label, position: c.position });
    }
    return [...vistas.entries()]
      .map(([key, v]) => ({ key, label: v.label, position: v.position }))
      .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
  }, [columns]);

  /** Qué lleva cada cliente. */
  const fasesDe = useMemo(() => {
    const mapa: Record<string, Set<string>> = {};
    for (const c of columns) {
      (mapa[c.client_id] ??= new Set()).add(c.key);
    }
    return mapa;
  }, [columns]);

  const cargar = useCallback(async () => {
    const [t, a] = await Promise.all([
      supabase.from("client_tasks").select("*").eq("done", false),
      supabase.from("client_month_progress").select("*").eq("month", mes),
    ]);
    setTasks((t.data ?? []) as ClientTask[]);
    setAvance((a.data ?? []) as Avance[]);
    setAsignados(await leerAsignados(supabase));
    setCargando(false);
  }, [supabase, mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los cuadros flotantes se cierran al pulsar fuera o con Escape, como todo
  // lo demás de la aplicación.
  useEffect(() => {
    if (!casillaAbierta && !menuCliente && !fasesAbierta) return;
    const fuera = () => {
      setCasillaAbierta(null);
      setMenuCliente(null);
      setFasesAbierta(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fuera();
    };
    window.addEventListener("click", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("click", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [casillaAbierta, menuCliente, fasesAbierta]);

  const hecho = useCallback(
    (clientId: string, phase: string) =>
      avance.find((a) => a.client_id === clientId && a.phase_key === phase),
    [avance],
  );

  /** En qué estado está una casilla. */
  const estadoDe = useCallback(
    (clientId: string, phase: string): Estado => {
      const a = hecho(clientId, phase);
      if (a?.done) return "hecha";
      if (a?.partial) return "medias";
      return "no";
    },
    [hecho],
  );

  /**
   * Guarda una casilla.
   * -------------------------------------------------------------------------
   * Hay cosas que no se terminan de una sentada —grabar en dos días es lo
   * normal—, así que una casilla no es sí o no: está sin empezar, a medias o
   * hecha. Y cuando está a medias se puede escribir qué falta, que es lo que
   * de verdad hace falta saber al día siguiente.
   */
  async function guardar(clientId: string, phase: string, estado: Estado, nota?: string) {
    const previa = hecho(clientId, phase);
    const fila: Avance = {
      client_id: clientId,
      month: mes,
      phase_key: phase,
      done: estado === "hecha",
      done_by: estado === "no" ? null : me.id,
      partial: estado === "medias",
      // La nota solo tiene sentido mientras está a medias: al darla por hecha
      // se va sola, para que no quede un «falta la mitad» en algo terminado.
      note: estado === "medias" ? (nota ?? previa?.note ?? "") : "",
    };
    setAvance((prev) => [
      ...prev.filter((a) => !(a.client_id === clientId && a.phase_key === phase)),
      fila,
    ]);
    await supabase.from("client_month_progress").upsert(
      { ...fila, done_at: estado === "hecha" ? new Date().toISOString() : null },
      { onConflict: "client_id,month,phase_key" },
    );
  }

  /**
   * Pone o quita una fase a un cliente.
   * -------------------------------------------------------------------------
   * Lo marcado no se borra al quitar una fase: se deja de ver y deja de
   * contar, y si la fase vuelve, vuelve con lo suyo. Quitar una fase por
   * error no cuesta nada.
   */
  async function alternarFase(clientId: string, key: string, label: string, lleva: boolean) {
    if (lleva) {
      await supabase.from("board_columns").delete().eq("client_id", clientId).eq("key", key);
    } else {
      const conocida = FASES_CONOCIDAS.find((f) => f.key === key);
      const position = conocida?.position ?? Math.max(8, ...columns.map((c) => c.position)) + 1;
      await supabase
        .from("board_columns")
        .insert({ client_id: clientId, key, label: conocida?.label ?? label, position });
    }
    onFasesCambiadas();
  }

  /**
   * Enseña lo que falta en una casilla. Sale encima, salvo que la casilla esté
   * arriba del todo: ahí taparía la cabecera de la tabla y sale por debajo.
   */
  function mostrarPista(nota: string | undefined, el: HTMLElement) {
    if (!nota) return;
    const r = el.getBoundingClientRect();
    setPista({ texto: nota, x: r.left + r.width / 2, y: r.top, abajo: r.top < 150 });
  }

  /** Pulsar una casilla la va pasando por los tres estados. */
  function siguienteEstado(estado: Estado): Estado {
    return estado === "no" ? "medias" : estado === "medias" ? "hecha" : "no";
  }

  const hoy = hoyISO();
  const topes = { hoy, semana: finDeSemanaISO(), mes: finDeMesISO(), todo: "9999-12-31" };

  const nombreDeCliente = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  /** Los pendientes de todos los clientes, ya ordenados. */
  const pendientes = useMemo(
    () =>
      tasks
        .filter((t) => !t.due_date || t.due_date <= topes[ventana] || t.due_date < hoy)
        .sort(
          (a, b) =>
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
            (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"),
        ),
    [tasks, ventana, topes, hoy],
  );

  const porPrioridad = useMemo(
    () =>
      PRIORIDADES.map((p) => ({
        ...p,
        items: pendientes.filter((t) => t.priority === p.key),
      })).filter((g) => g.items.length > 0),
    [pendientes],
  );

  const clientesOrdenados = useMemo(
    () =>
      [...clients].sort(
        (a, b) => pesoPrioridad(a.priority) - pesoPrioridad(b.priority) || a.name.localeCompare(b.name),
      ),
    [clients],
  );

  const atrasadas = tasks.filter((t) => t.due_date && t.due_date < hoy).length;
  const urgentes = tasks.filter((t) => t.priority === "urgente").length;
  const clavesDeFase = useMemo(() => new Set(fases.map((f) => f.key)), [fases]);
  const marcadas = avance.filter((a) => a.done && clavesDeFase.has(a.phase_key)).length;
  const aMedias = avance.filter(
    (a) => a.partial && !a.done && clavesDeFase.has(a.phase_key),
  ).length;
  // Cada cliente tiene las suyas, así que el total es la suma de lo de cada
  // uno y no clientes por columnas.
  const totalCasillas = clients.reduce(
    (n, c) => n + [...(fasesDe[c.id] ?? [])].filter((k) => clavesDeFase.has(k)).length,
    0,
  );

  function filaDeTarea(t: ClientTask) {
    const quienes = (asignados[t.id] ?? [])
      .map((id: string) => profileById[id])
      .filter(Boolean);
    return (
      <li key={t.id}>
        <button type="button" className="panel__objetivo" onClick={() => onAbrirCliente(t.client_id)}>
          <Stamp label={initialsOf(nombreDeCliente[t.client_id] ?? "?")} color={stampColor(t.client_id)} />
          <span className="panel__objetivo-cuerpo">
            <span className="panel__objetivo-texto">{t.text}</span>
            <span className="panel__objetivo-meta">{nombreDeCliente[t.client_id] ?? "Cliente"}</span>
          </span>
          {quienes.length > 0 ? (
            <span className="panel__quien">
              {quienes.map((q) => (
                <Stamp key={q.id} label={q.initials} color={q.color} foto={q.avatar_url} title={q.full_name} />
              ))}
              {quienes.length === 1 && quienes[0].full_name.split(" ")[0]}
            </span>
          ) : (
            <span className="panel__quien is-libre">Sin asignar</span>
          )}
          {t.due_date ? (
            <span className={isOverdue(t.due_date) ? "panel__due is-overdue" : "panel__due"}>
              {formatDue(t.due_date)}
            </span>
          ) : (
            <span className="panel__due is-vacio">Sin fecha</span>
          )}
        </button>
      </li>
    );
  }

  return (
    <section className="panel">
      <div className="panel__cifras">
        <div className="panel__cifra">
          <span className="stat__num">
            {marcadas}
            <small>/{totalCasillas}</small>
          </span>
          <span className="stat__label">
            fases hechas este mes
            {aMedias > 0 && ` · ${aMedias} a medias`}
          </span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{tasks.length}</span>
          <span className="stat__label">tareas abiertas</span>
        </div>
        <div className={atrasadas > 0 ? "panel__cifra is-alerta" : "panel__cifra"}>
          <span className="stat__num">{atrasadas}</span>
          <span className="stat__label">con la entrega pasada</span>
        </div>
        <div className="panel__cifra">
          <span className="stat__num">{urgentes}</span>
          <span className="stat__label">urgentes</span>
        </div>
      </div>

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Avance del mes</h2>
          <div className="report__nav">
            <select
              className="input-inline"
              value={mesElegido}
              onChange={(e) => setMesElegido(Number(e.target.value))}
              aria-label="Mes"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i}>
                  {m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="input-inline"
              value={anyo}
              onChange={(e) => setAnyo(Number(e.target.value))}
              aria-label="Año"
            >
              {[anyo - 1, anyo, anyo + 1]
                .filter((a, i, xs) => xs.indexOf(a) === i)
                .sort()
                .map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
            </select>
            {!esteMes && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const hoy = new Date();
                  setAnyo(hoy.getFullYear());
                  setMesElegido(hoy.getMonth());
                }}
              >
                Ir a este mes
              </button>
            )}
          </div>
        </div>

        {cargando && <p className="panel__vacio">Cargando…</p>}

        {!cargando && (
          <div className="panel__rejillawrap">
            <table className="rejilla rejilla--fases">
              {/* Los anchos se fijan aquí. Sin esto, el navegador reparte lo
                  que sobra en la última columna y Programar salía el triple de
                  ancha que las demás. */}
              <colgroup>
                <col className="col--cliente" />
                <col className="col--prio" />
                {fases.map((f) => (
                  <col key={f.key} className="col--fase" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Prioridad</th>
                  {fases.map((f) => (
                    <th key={f.key} className="rejilla__casilla">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesOrdenados.map((c) => (
                  <tr key={c.id}>
                    <th
                      scope="row"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCasillaAbierta(null);
                        setMenuCliente({ id: c.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <div className="rejilla__fila">
                        <button
                          type="button"
                          className="rejilla__cliente"
                          onClick={() => onAbrirCliente(c.id)}
                        >
                          <Stamp label={initialsOf(c.name)} color={stampColor(c.id)} />
                          <span>
                            <span className="rejilla__nombre">{c.name}</span>
                            <span className="rejilla__tipo">{c.kind}</span>
                          </span>
                        </button>
                        {/* El botón derecho no se le ocurre a nadie, así que
                            el menú tiene también su botón a la vista. */}
                        <button
                          type="button"
                          className="rejilla__mas"
                          title={`Qué lleva ${c.name}, quitarlo del tablero…`}
                          aria-label={`Opciones de ${c.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCasillaAbierta(null);
                            setFasesAbierta(null);
                            setMenuCliente({ id: c.id, x: e.clientX, y: e.clientY });
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </th>
                    <td>
                      <select
                        className={`input-inline rejilla__prio prio--${c.priority}`}
                        value={c.priority}
                        onChange={(e) => onPrioridadCliente(c.id, e.target.value as Prioridad)}
                        aria-label={`Prioridad de ${c.name}`}
                      >
                        {PRIORIDADES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.texto}
                          </option>
                        ))}
                      </select>
                    </td>
                    {fases.map((f) => {
                      // Lo que este cliente no lleva no es una casilla sin
                      // marcar: es que no va. Un guion lo dice y una casilla
                      // vacía no.
                      if (!(fasesDe[c.id] ?? new Set()).has(f.key)) {
                        return (
                          <td key={f.key} className="rejilla__casilla is-nova">
                            <span className="casilla__nova" title={`${c.name} no lleva ${f.label}`}>
                              —
                            </span>
                          </td>
                        );
                      }
                      const a = hecho(c.id, f.key);
                      const estado = estadoDe(c.id, f.key);
                      // A propósito no se dice quién la marcó: da igual quién lo
                      // hizo, lo que importa es por dónde va.
                      return (
                        <td
                          key={f.key}
                          className={
                            estado === "hecha"
                              ? "rejilla__casilla is-hecha"
                              : estado === "medias"
                                ? "rejilla__casilla is-medias"
                                : "rejilla__casilla"
                          }
                        >
                          <button
                            type="button"
                            className={`casilla casilla--${estado}`}
                            aria-label={`${f.label} de ${c.name}: ${
                              estado === "hecha" ? "hecho" : estado === "medias" ? "a medias" : "sin empezar"
                            }${a?.note ? `. Falta: ${a.note}` : ""}`}
                            title={
                              a?.note
                                ? undefined
                                : "Pulsa para cambiarlo · botón derecho para decir qué falta"
                            }
                            onMouseEnter={(e) => mostrarPista(a?.note, e.currentTarget)}
                            onFocus={(e) => mostrarPista(a?.note, e.currentTarget)}
                            onMouseLeave={() => setPista(null)}
                            onBlur={() => setPista(null)}
                            onClick={(e) => {
                              // Sin esto, el mismo clic llegaría a la ventana y
                              // cerraría el cuadro que acaba de abrir.
                              e.stopPropagation();
                              const siguiente = siguienteEstado(estado);
                              void guardar(c.id, f.key, siguiente);
                              setMenuCliente(null);
                              // Al dejarlo a medias se abre solo el cuadro de
                              // «qué falta»: es justo cuando hay algo que decir.
                              setCasillaAbierta(
                                siguiente === "medias"
                                  ? { clientId: c.id, phase: f.key, x: e.clientX, y: e.clientY }
                                  : null,
                              );
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setMenuCliente(null);
                              setCasillaAbierta({
                                clientId: c.id,
                                phase: f.key,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                          >
                            <span className="casilla__caja">
                              {estado === "hecha" ? "✓" : estado === "medias" ? "◧" : ""}
                            </span>
                          </button>
                          {a?.note && <span className="casilla__pista" title={a.note} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* El alta vive al final de la tabla, que es donde se mira
                    cuando se ve que falta alguien. Lo que se dé de alta queda
                    para siempre: los meses siguientes lo traen solo. */}
                <tr className="rejilla__alta">
                  <th scope="row">
                    <button type="button" className="rejilla__nuevo" onClick={onNuevoCliente}>
                      + Añadir cliente
                    </button>
                  </th>
                  <td colSpan={fases.length + 1} className="rejilla__alta-nota">
                    Se queda guardado y sale también los meses siguientes.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!cargando && (
          <p className="rejilla__leyenda">
            <span className="casilla casilla--no" aria-hidden>
              <span className="casilla__caja" />
            </span>
            sin empezar
            <span className="casilla casilla--medias" aria-hidden>
              <span className="casilla__caja">◧</span>
            </span>
            a medias
            <span className="casilla casilla--hecha" aria-hidden>
              <span className="casilla__caja">✓</span>
            </span>
            hecho · <strong>—</strong> no lo lleva. Pulsa una casilla para pasar de un estado a otro;
            con el botón derecho escribes qué falta, y pasando el ratón por encima lo lees. El botón{" "}
            <strong>⋯</strong> de cada cliente elige <strong>qué lleva</strong> —ads, influencers,
            web— y es lo que hace aparecer esas columnas.
          </p>
        )}
      </div>

      <div className="panel__bloque">
        <div className="panel__cabecera">
          <h2 className="panel__titulo">Pendientes por prioridad</h2>
          <div className="report__switch">
            {(["hoy", "semana", "mes", "todo"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={ventana === v ? "tab is-active" : "tab"}
                onClick={() => setVentana(v)}
              >
                {v === "hoy" ? "Hoy" : v === "semana" ? "Esta semana" : v === "mes" ? "Este mes" : "Todo"}
              </button>
            ))}
          </div>
        </div>

        {!cargando && porPrioridad.length === 0 && (
          <p className="panel__vacio">No hay nada pendiente en este plazo.</p>
        )}

        {porPrioridad.map((g) => (
          <div key={g.key} className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className={`prio prio--${g.key}`}>{etiqueta(g.key)}</span>
              <span className="count-chip">{g.items.length}</span>
            </div>
            <ul className="panel__objetivos">{g.items.map(filaDeTarea)}</ul>
          </div>
        ))}
      </div>

      {pista && (
        <div
          className={pista.abajo ? "casilla__globo is-abajo" : "casilla__globo"}
          role="tooltip"
          style={{ left: pista.x, top: pista.y }}
        >
          <span className="casilla__globo-tit">A medias · falta</span>
          {pista.texto}
        </div>
      )}

      {fasesAbierta && (
        <CuadroFases
          x={fasesAbierta.x}
          y={fasesAbierta.y}
          cliente={nombreDeCliente[fasesAbierta.id] ?? ""}
          lleva={fasesDe[fasesAbierta.id] ?? new Set()}
          enUso={fases}
          onAlternar={(key, label, tiene) => void alternarFase(fasesAbierta.id, key, label, tiene)}
        />
      )}

      {casillaAbierta && (
        <CuadroCasilla
          x={casillaAbierta.x}
          y={casillaAbierta.y}
          estado={estadoDe(casillaAbierta.clientId, casillaAbierta.phase)}
          nota={hecho(casillaAbierta.clientId, casillaAbierta.phase)?.note ?? ""}
          fase={fases.find((f) => f.key === casillaAbierta.phase)?.label ?? ""}
          cliente={nombreDeCliente[casillaAbierta.clientId] ?? ""}
          onGuardar={(estado, nota) => {
            void guardar(casillaAbierta.clientId, casillaAbierta.phase, estado, nota);
            setCasillaAbierta(null);
          }}
        />
      )}

      {menuCliente && (
        <div
          className="menu-canal"
          style={{
            top: menuCliente.y,
            left: Math.min(menuCliente.x, typeof window === "undefined" ? menuCliente.x : window.innerWidth - 170),
          }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="menu-canal__normal"
            onClick={() => {
              const id = menuCliente.id;
              setMenuCliente(null);
              onAbrirCliente(id);
            }}
          >
            Abrir el canal
          </button>
          <button
            type="button"
            className="menu-canal__normal"
            onClick={() => {
              const m = menuCliente;
              setMenuCliente(null);
              setFasesAbierta({ id: m.id, x: m.x, y: m.y });
            }}
          >
            Qué lleva este cliente
          </button>
          <button
            type="button"
            className="menu-canal__normal"
            onClick={() => {
              const id = menuCliente.id;
              setMenuCliente(null);
              onQuitarDelPanel(id);
            }}
          >
            Quitar del tablero
          </button>
          <button
            type="button"
            onClick={() => {
              const id = menuCliente.id;
              setMenuCliente(null);
              onBorrarCliente(id);
            }}
          >
            Eliminar el cliente del todo
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * El cuadro de una casilla: en qué punto está y qué falta.
 * ---------------------------------------------------------------------------
 * «Grabado a medias» no dice gran cosa por sí solo: lo que hace falta saber al
 * día siguiente es qué queda. Por eso, además de los tres estados, hay un
 * hueco para escribirlo, y lo escrito sale al pasar por encima de la casilla.
 */
function CuadroCasilla({
  x,
  y,
  estado,
  nota,
  fase,
  cliente,
  onGuardar,
}: {
  x: number;
  y: number;
  estado: Estado;
  nota: string;
  fase: string;
  cliente: string;
  onGuardar: (estado: Estado, nota: string) => void;
}) {
  const [texto, setTexto] = useState(nota);
  const [elegido, setElegido] = useState<Estado>(estado);

  return (
    <div
      className="menu-canal casilla__cuadro"
      style={{ top: y, left: Math.min(x, typeof window === "undefined" ? x : window.innerWidth - 256) }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="casilla__cuadro-tit">
        {fase} · {cliente}
      </p>
      <div className="casilla__estados">
        {(["no", "medias", "hecha"] as const).map((e) => (
          <button
            key={e}
            type="button"
            className={elegido === e ? "casilla__estado is-on" : "casilla__estado"}
            onClick={() => {
              setElegido(e);
              // Dar algo por hecho o por no empezado no necesita explicación:
              // se guarda y se cierra. A medias es lo único que pide decir qué
              // falta, así que ahí se queda el cuadro abierto.
              if (e !== "medias") onGuardar(e, "");
            }}
          >
            {e === "no" ? "Sin empezar" : e === "medias" ? "◧ A medias" : "✓ Hecho"}
          </button>
        ))}
      </div>
      {elegido === "medias" && (
        <>
          <label className="casilla__cuadro-lab" htmlFor="casilla-nota">
            ¿Qué falta?
          </label>
          <input
            id="casilla-nota"
            autoFocus
            className="input-inline"
            value={texto}
            placeholder="Falta grabar la parte de la consulta"
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") onGuardar("medias", texto.trim());
            }}
          />
          <button type="button" className="btn btn--primary" onClick={() => onGuardar("medias", texto.trim())}>
            Guardar
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Qué lleva un cliente.
 * ---------------------------------------------------------------------------
 * Casi todos llevan las cinco de contenido; ads, influencers o la web solo
 * algunos. Aquí se marca lo que lleva cada uno, y el tablero enseña una
 * columna por cada fase que lleve alguien. Si hace falta una que no está, se
 * escribe y ya existe: no hay que pedir nada a nadie.
 */
function CuadroFases({
  x,
  y,
  cliente,
  lleva,
  enUso,
  onAlternar,
}: {
  x: number;
  y: number;
  cliente: string;
  lleva: Set<string>;
  enUso: { key: string; label: string }[];
  onAlternar: (key: string, label: string, tiene: boolean) => void;
}) {
  const [nueva, setNueva] = useState("");

  // Las de serie, más cualquiera que ya se haya inventado para otro cliente.
  const opciones = [...FASES_CONOCIDAS.map((f) => ({ key: f.key, label: f.label }))];
  for (const f of enUso) {
    if (!opciones.some((o) => o.key === f.key)) opciones.push({ key: f.key, label: f.label });
  }

  function anadir() {
    const texto = nueva.trim();
    if (!texto) return;
    const key = claveDeFase(texto);
    if (!key || lleva.has(key)) return;
    onAlternar(key, texto, false);
    setNueva("");
  }

  return (
    <div
      className="menu-canal casilla__cuadro"
      style={{ top: y, left: Math.min(x, typeof window === "undefined" ? x : window.innerWidth - 256) }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="casilla__cuadro-tit">Qué lleva {cliente}</p>
      <div className="casilla__estados">
        {opciones.map((o) => {
          const tiene = lleva.has(o.key);
          return (
            <button
              key={o.key}
              type="button"
              className={tiene ? "casilla__estado is-on" : "casilla__estado"}
              onClick={() => onAlternar(o.key, o.label, tiene)}
            >
              {tiene ? "✓ " : ""}
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="casilla__cuadro-lab" htmlFor="fase-nueva">
        ¿Falta alguna?
      </label>
      <input
        id="fase-nueva"
        className="input-inline"
        value={nueva}
        placeholder="Email marketing"
        onChange={(e) => setNueva(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            anadir();
          }
        }}
      />
      <button type="button" className="btn btn--primary" onClick={anadir} disabled={!nueva.trim()}>
        Añadir fase
      </button>
    </div>
  );
}
