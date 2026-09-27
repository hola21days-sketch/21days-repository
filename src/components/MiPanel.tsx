"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { formatDue, initialsOf, isOverdue, stampColor } from "@/lib/format";
import { etiqueta, pesoPrioridad, PRIORIDADES } from "@/lib/prioridad";
import type { ClientTask, Prioridad, Profile } from "@/lib/types";

type Props = {
  me: Profile;
  profiles: Profile[];
  clientNames: Record<string, string>;
  onAbrirCliente: (clientId: string) => void;
};

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lo mío y lo de cada uno.
 * ---------------------------------------------------------------------------
 * Arriba, mis tareas ordenadas por prioridad, con su cliente y su fecha de
 * entrega. Debajo, la misma información de todo el equipo en una tabla: qué
 * lleva cada persona, cuánto de ello es urgente y qué va con retraso. Lo ve
 * todo el mundo a propósito: así nadie tiene que preguntar quién va cargado.
 */
export default function MiPanel({ me, profiles, clientNames, onAbrirCliente }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mirando, setMirando] = useState<string>(me.id);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("client_tasks").select("*").eq("done", false);
    setTasks((data ?? []) as ClientTask[]);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hoy = hoyISO();

  /** Cambia la prioridad o la fecha sin salir de aquí. */
  async function guardar(task: ClientTask, patch: Partial<ClientTask>) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    await supabase.from("client_tasks").update(patch).eq("id", task.id);
  }

  async function terminar(task: ClientTask) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await supabase.from("client_tasks").update({ done: true }).eq("id", task.id);
  }

  const equipo = useMemo(
    () =>
      profiles.map((p) => {
        const suyas = tasks.filter((t) => t.assignee_id === p.id);
        return {
          persona: p,
          total: suyas.length,
          urgentes: suyas.filter((t) => t.priority === "urgente").length,
          importantes: suyas.filter((t) => t.priority === "importante").length,
          atrasadas: suyas.filter((t) => t.due_date && t.due_date < hoy).length,
          proxima: suyas
            .filter((t) => t.due_date)
            .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0]?.due_date ?? null,
        };
      }),
    [profiles, tasks, hoy],
  );

  const sinAsignar = tasks.filter((t) => !t.assignee_id);

  const suyas = useMemo(
    () =>
      tasks
        .filter((t) => (mirando === "" ? !t.assignee_id : t.assignee_id === mirando))
        .sort(
          (a, b) =>
            pesoPrioridad(a.priority) - pesoPrioridad(b.priority) ||
            (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"),
        ),
    [tasks, mirando],
  );

  const porPrioridad = PRIORIDADES.map((p) => ({
    ...p,
    items: suyas.filter((t) => t.priority === p.key),
  })).filter((g) => g.items.length > 0);

  const quienMiro = mirando === "" ? null : profiles.find((p) => p.id === mirando);

  return (
    <section className="panel">
      <div className="panel__bloque">
        <h2 className="panel__titulo">Reparto del equipo</h2>
        <div className="panel__rejillawrap">
          <table className="rejilla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Tareas</th>
                <th>Urgentes</th>
                <th>Importantes</th>
                <th>Atrasadas</th>
                <th>Próxima entrega</th>
              </tr>
            </thead>
            <tbody>
              {equipo.map((f) => (
                <tr
                  key={f.persona.id}
                  className={mirando === f.persona.id ? "is-mirando" : undefined}
                  onClick={() => setMirando(f.persona.id)}
                >
                  <th scope="row">
                    <button type="button" className="rejilla__cliente">
                      <Stamp label={f.persona.initials} color={f.persona.color} />
                      <span>
                        <span className="rejilla__nombre">
                          {f.persona.full_name}
                          {f.persona.id === me.id && <em> · tú</em>}
                        </span>
                        <span className="rejilla__tipo">
                          {f.persona.role === "admin" ? "Administradora" : "Equipo"}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="rejilla__num">{f.total}</td>
                  <td className="rejilla__num">
                    {f.urgentes > 0 ? <span className="prio prio--urgente">{f.urgentes}</span> : "·"}
                  </td>
                  <td className="rejilla__num">
                    {f.importantes > 0 ? (
                      <span className="prio prio--importante">{f.importantes}</span>
                    ) : (
                      "·"
                    )}
                  </td>
                  <td className="rejilla__num">
                    {f.atrasadas > 0 ? <b className="is-rojo">{f.atrasadas}</b> : "·"}
                  </td>
                  <td className="rejilla__num">{f.proxima ? formatDue(f.proxima) : "·"}</td>
                </tr>
              ))}
              {sinAsignar.length > 0 && (
                <tr className={mirando === "" ? "is-mirando" : undefined} onClick={() => setMirando("")}>
                  <th scope="row">
                    <button type="button" className="rejilla__cliente">
                      <Stamp label="··" color="var(--ink-faint)" />
                      <span>
                        <span className="rejilla__nombre">Sin asignar</span>
                        <span className="rejilla__tipo">A repartir</span>
                      </span>
                    </button>
                  </th>
                  <td className="rejilla__num">{sinAsignar.length}</td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.priority === "urgente").length || "·"}
                  </td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.priority === "importante").length || "·"}
                  </td>
                  <td className="rejilla__num">
                    {sinAsignar.filter((t) => t.due_date && t.due_date < hoy).length || "·"}
                  </td>
                  <td className="rejilla__num">·</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel__bloque">
        <h2 className="panel__titulo">
          {quienMiro
            ? quienMiro.id === me.id
              ? "Lo mío"
              : `Lo de ${quienMiro.full_name.split(" ")[0]}`
            : "Sin asignar"}
        </h2>

        {cargando && <p className="panel__vacio">Cargando…</p>}
        {!cargando && suyas.length === 0 && <p className="panel__vacio">Nada pendiente por aquí.</p>}

        {porPrioridad.map((g) => (
          <div key={g.key} className="panel__grupo">
            <div className="panel__grupo-cab">
              <span className={`prio prio--${g.key}`}>{etiqueta(g.key)}</span>
              <span className="count-chip">{g.items.length}</span>
            </div>
            <ul className="panel__objetivos">
              {g.items.map((t) => (
                <li key={t.id}>
                  <div className="panel__objetivo panel__objetivo--fijo">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => void terminar(t)}
                      title="Dar por hecha"
                      aria-label={`Dar por hecha: ${t.text}`}
                    />
                    <button
                      type="button"
                      className="panel__objetivo-cuerpo panel__objetivo-abrir"
                      onClick={() => onAbrirCliente(t.client_id)}
                    >
                      <span className="panel__objetivo-texto">{t.text}</span>
                      <span className="panel__objetivo-meta">
                        <Stamp
                          label={initialsOf(clientNames[t.client_id] ?? "?")}
                          color={stampColor(t.client_id)}
                        />
                        {clientNames[t.client_id] ?? "Cliente"}
                      </span>
                    </button>

                    <select
                      className={`input-inline panel__prio prio--${t.priority}`}
                      value={t.priority}
                      onChange={(e) => void guardar(t, { priority: e.target.value as Prioridad })}
                      aria-label="Prioridad"
                    >
                      {PRIORIDADES.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.texto}
                        </option>
                      ))}
                    </select>

                    <input
                      className={
                        t.due_date && isOverdue(t.due_date)
                          ? "input-inline panel__fecha is-overdue"
                          : "input-inline panel__fecha"
                      }
                      type="date"
                      value={t.due_date ?? ""}
                      onChange={(e) => void guardar(t, { due_date: e.target.value || null })}
                      aria-label="Para cuándo"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
