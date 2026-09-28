"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { commentStamp } from "@/lib/format";
import type { Credencial, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  clientName: string;
  me: Profile;
  profileById: Record<string, Profile>;
};

/** Los servicios que se repiten, para no escribirlos a mano cada vez. */
const SERVICIOS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Metricool",
  "ManyChat",
  "Canva",
  "Google",
  "Correo",
  "Web",
  "Otro",
];

const VACIA = { service: "Instagram", username: "", secret: "", url: "", notes: "" };

/**
 * Las claves de acceso de un cliente.
 * ---------------------------------------------------------------------------
 * Están a la vista del equipo porque hacen falta para trabajar, pero tapadas
 * por defecto: se enseñan de una en una y se copian sin verlas. Cada cambio
 * deja constancia de quién lo hizo y cuándo.
 */
export default function Claves({ clientId, clientName, me, profileById }: Props) {
  // Leerlas es cosa de todo el equipo; tocarlas, solo de los administradores.
  const puedeEditar = me.role === "admin";
  const supabase = useMemo(() => createClient(), []);
  const [claves, setClaves] = useState<Credencial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aLaVista, setALaVista] = useState<Set<string>>(new Set());
  // Cuando hay que trabajar la cuenta de verdad, ir abriendo una a una es un
  // engorro: este interruptor las enseña todas de golpe.
  const [todasALaVista, setTodasALaVista] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ ...VACIA });
  const [añadiendo, setAñadiendo] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("client_credentials")
      .select("*")
      .eq("client_id", clientId)
      .order("position")
      .order("service");
    setClaves((data ?? []) as Credencial[]);
    setCargando(false);
  }, [supabase, clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const canal = supabase
      .channel(`claves-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_credentials",
          filter: `client_id=eq.${clientId}`,
        },
        () => void cargar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, clientId, cargar]);

  function alternarVista(id: string) {
    setALaVista((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Copiar sin tener que enseñar la clave en pantalla. */
  async function copiar(texto: string, marca: string) {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      setTimeout(() => setCopiado((c) => (c === marca ? null : c)), 1800);
    } catch {
      setError("El navegador no ha dejado copiar. Enséñala y cópiala a mano.");
    }
  }

  async function añadir() {
    if (!nueva.service.trim() || añadiendo) return;
    setAñadiendo(true);
    setError(null);
    const { data, error: fallo } = await supabase
      .from("client_credentials")
      .insert({
        client_id: clientId,
        service: nueva.service.trim(),
        username: nueva.username.trim(),
        secret: nueva.secret,
        url: nueva.url.trim(),
        notes: nueva.notes.trim(),
        position: Math.max(0, ...claves.map((c) => c.position)) + 1,
        updated_by: me.id,
      })
      .select("*")
      .single();
    setAñadiendo(false);
    if (fallo || !data) {
      setError(`No se ha podido guardar. ${fallo?.message ?? ""}`.trim());
      return;
    }
    setClaves((prev) => [...prev, data as Credencial]);
    setNueva({ ...VACIA });
  }

  async function guardar(c: Credencial, patch: Partial<Credencial>) {
    const cambios = { ...patch, updated_by: me.id, updated_at: new Date().toISOString() };
    setClaves((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)));
    // Se pide la fila de vuelta a propósito: si no eres administrador, la base
    // de datos no da error, simplemente no cambia nada. Sin esto el cambio
    // parecía guardado en pantalla y al recargar volvía lo de antes.
    const { data, error: fallo } = await supabase
      .from("client_credentials")
      .update(cambios)
      .eq("id", c.id)
      .select("id");
    if (fallo || !data || data.length === 0) {
      setError(
        fallo
          ? `No se ha podido guardar el cambio. ${fallo.message}`
          : "No se ha podido guardar: solo un administrador puede cambiar las claves.",
      );
      void cargar();
      return;
    }
    setError(null);
  }

  async function quitar(c: Credencial) {
    if (!confirm(`¿Borrar la clave de ${c.service}? No se puede deshacer.`)) return;
    setClaves((prev) => prev.filter((x) => x.id !== c.id));
    await supabase.from("client_credentials").delete().eq("id", c.id);
  }

  return (
    <section className="claves">
      <div className="claves__panel">
        <div className="tasks__head">
          <h2 className="tasks__title">Claves de {clientName}</h2>
          <span className="count-chip">{claves.length}</span>
          {claves.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost claves__todas"
              onClick={() => {
                setTodasALaVista((v) => !v);
                setALaVista(new Set());
              }}
            >
              {todasALaVista ? "Ocultar todas" : "Ver todas"}
            </button>
          )}
        </div>

        <p className="claves__aviso">
          Las ve todo el equipo. Salen tapadas: pulsa <b>Ver</b> en una, o <b>Ver todas</b> para
          enseñarlas de golpe. Con <b>copiar</b> las pasas al portapapeles sin verlas. No las
          pegues en el chat ni en Slack.
          {!puedeEditar && " Cambiarlas es cosa de un administrador."}
        </p>

        {error && <div className="notice notice--error">{error}</div>}

        {cargando && <p className="panel__vacio">Cargando…</p>}

        {!cargando && claves.length === 0 && (
          <p className="panel__vacio">
            Todavía no hay ninguna clave de {clientName}.
            {puedeEditar ? " Añade la primera aquí abajo." : " Pídeselas a un administrador."}
          </p>
        )}

        <ul className="claves__lista">
          {claves.map((c) => {
            const quien = c.updated_by ? profileById[c.updated_by] : null;
            const abierta = editando === c.id;
            // Con el editor abierto la clave se destapa también arriba: no
            // tiene sentido taparle a alguien lo que está cambiando.
            const visible = todasALaVista || abierta || aLaVista.has(c.id);
            return (
              <li key={c.id} className="clave">
                <div className="clave__fila">
                  {puedeEditar ? (
                    <button
                      type="button"
                      className="clave__servicio"
                      onClick={() => setEditando(abierta ? null : c.id)}
                      title="Editar"
                    >
                      {c.service}
                    </button>
                  ) : (
                    <span className="clave__servicio is-fijo">{c.service}</span>
                  )}

                  <span className="clave__usuario">
                    {c.username || <em>sin usuario</em>}
                    {c.username && (
                      <button
                        type="button"
                        className="clave__copiar"
                        onClick={() => void copiar(c.username, `u-${c.id}`)}
                      >
                        {copiado === `u-${c.id}` ? "copiado" : "copiar"}
                      </button>
                    )}
                  </span>

                  <span className="clave__secreta">
                    {/* Si no hay contraseña apuntada se dice, en vez de enseñar
                        puntitos que hacen pensar que sí la hay. */}
                    {c.secret ? (
                      <>
                        <code>{visible ? c.secret : "••••••••••"}</code>
                        <button
                          type="button"
                          className="clave__ojo"
                          onClick={() => alternarVista(c.id)}
                          aria-label={visible ? "Ocultar" : "Enseñar"}
                        >
                          {visible ? "Ocultar" : "Ver"}
                        </button>
                        <button
                          type="button"
                          className="clave__copiar"
                          onClick={() => void copiar(c.secret, `s-${c.id}`)}
                        >
                          {copiado === `s-${c.id}` ? "copiado" : "copiar"}
                        </button>
                      </>
                    ) : (
                      <em className="clave__sin">sin contraseña apuntada</em>
                    )}
                  </span>

                  {c.url && (
                    <a className="clave__ir" href={c.url} target="_blank" rel="noopener noreferrer">
                      Abrir
                    </a>
                  )}

                  {/* El botón de editar va a la vista y con su nombre: pulsar
                      el del servicio también abre, pero eso no se adivina. */}
                  {puedeEditar && (
                    <>
                      <button
                        type="button"
                        className="clave__editar"
                        onClick={() => setEditando(abierta ? null : c.id)}
                      >
                        {abierta ? "Cerrar" : "Editar"}
                      </button>
                      <button
                        type="button"
                        className="checklist__remove"
                        onClick={() => void quitar(c)}
                        aria-label={`Borrar ${c.service}`}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>

                {(c.notes || quien) && !abierta && (
                  <div className="clave__pie">
                    {c.notes && <span>{c.notes}</span>}
                    {quien && (
                      <span className="clave__firma">
                        {quien.full_name.split(" ")[0]} · {commentStamp(c.updated_at)}
                      </span>
                    )}
                  </div>
                )}

                {abierta && puedeEditar && (
                  <div className="clave__editor">
                    <p className="clave__ayuda">
                      Cambia lo que haga falta: la contraseña se ve mientras la editas y se guarda
                      sola al salir del campo.
                    </p>
                    <label>
                      <span>Servicio</span>
                      <input
                        className="input-inline"
                        defaultValue={c.service}
                        onBlur={(e) =>
                          e.target.value !== c.service && void guardar(c, { service: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Usuario</span>
                      <input
                        className="input-inline"
                        defaultValue={c.username}
                        onBlur={(e) =>
                          e.target.value !== c.username &&
                          void guardar(c, { username: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Contraseña</span>
                      {/* A la vista y en monoespaciada: se está editando a
                          propósito, y a ciegas no se distingue una l de un 1
                          ni se ve si sobra un espacio al final. */}
                      <input
                        className="input-inline clave__campo-secreto"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        defaultValue={c.secret}
                        onBlur={(e) =>
                          e.target.value !== c.secret && void guardar(c, { secret: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Enlace</span>
                      <input
                        className="input-inline"
                        defaultValue={c.url}
                        placeholder="https://…"
                        onBlur={(e) =>
                          e.target.value !== c.url && void guardar(c, { url: e.target.value })
                        }
                      />
                    </label>
                    <label className="clave__ancho">
                      <span>Notas</span>
                      <input
                        className="input-inline"
                        defaultValue={c.notes}
                        placeholder="Doble factor, quién la tiene, cuándo caduca…"
                        onBlur={(e) =>
                          e.target.value !== c.notes && void guardar(c, { notes: e.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {puedeEditar && (
        <div className="claves__nueva">
          <div className="claves__nueva-fila">
            <label className="claves__campo">
              <span>Servicio</span>
              <select
                className="input-inline"
                value={SERVICIOS.includes(nueva.service) ? nueva.service : "Otro"}
                onChange={(e) => setNueva({ ...nueva, service: e.target.value })}
              >
                {SERVICIOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="claves__campo">
              <span>Usuario</span>
              <input
                className="input-inline"
                value={nueva.username}
                onChange={(e) => setNueva({ ...nueva, username: e.target.value })}
              />
            </label>
            <label className="claves__campo">
              <span>Contraseña</span>
              <input
                className="input-inline clave__campo-secreto"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={nueva.secret}
                onChange={(e) => setNueva({ ...nueva, secret: e.target.value })}
              />
            </label>
          </div>

          <div className="claves__nueva-fila">
            <label className="claves__campo">
              <span>Enlace (opcional)</span>
              <input
                className="input-inline"
                placeholder="https://…"
                value={nueva.url}
                onChange={(e) => setNueva({ ...nueva, url: e.target.value })}
              />
            </label>
            <label className="claves__campo">
              <span>Notas (opcional)</span>
              <input
                className="input-inline"
                placeholder="Doble factor, quién la tiene…"
                value={nueva.notes}
                onChange={(e) => setNueva({ ...nueva, notes: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary claves__add"
              onClick={() => void añadir()}
              disabled={añadiendo}
            >
              {añadiendo ? "Guardando…" : "Añadir clave"}
            </button>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
