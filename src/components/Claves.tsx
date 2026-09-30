"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { commentStamp } from "@/lib/format";
import { conEnlaces } from "@/lib/enlaces";
import type { Credencial, Profile } from "@/lib/types";

type Props = {
  clientId: string;
  clientName: string;
  me: Profile;
  profileById: Record<string, Profile>;
};

/**
 * Los servicios que se repiten, para no escribirlos a mano cada vez. No es una
 * lista cerrada: eligiendo «Otro» se escribe el nombre que sea.
 */
const SERVICIOS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "WordPress",
  "Google",
  "Google Ads",
  "Meta Ads",
  "Metricool",
  "ManyChat",
  "Klaviyo",
  "Linktree",
  "Canva",
  "Correo",
  "CRM",
  "Web",
];

const VACIA = { service: "", username: "", secret: "", url: "", notes: "" };

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
  /**
   * Lo que se está escribiendo en el editor, aparte de la clave guardada. Nada
   * se toca hasta pulsar Guardar: así se puede cambiar el usuario y la
   * contraseña de una vez, y arrepentirse sin haber roto nada.
   */
  const [borrador, setBorrador] = useState({ ...VACIA });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<string | null>(null);
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
    if (añadiendo) return;
    if (!nueva.service.trim()) {
      setError("Ponle nombre al servicio antes de guardarlo.");
      return;
    }
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

  /** Abre el editor de una clave con lo que hay ahora mismo dentro. */
  function abrirEditor(c: Credencial) {
    setEditando(c.id);
    setBorrador({
      service: c.service,
      username: c.username,
      secret: c.secret,
      url: c.url,
      notes: c.notes,
    });
    setError(null);
  }

  function cerrarEditor() {
    setEditando(null);
    setBorrador({ ...VACIA });
  }

  /** Guarda de golpe todo lo que se haya cambiado en el editor. */
  async function guardarBorrador(c: Credencial) {
    if (guardando) return;
    if (!borrador.service.trim()) {
      setError("El servicio no puede quedarse sin nombre.");
      return;
    }
    setGuardando(true);
    const ok = await guardar(c, {
      service: borrador.service.trim(),
      username: borrador.username.trim(),
      secret: borrador.secret,
      url: borrador.url.trim(),
      notes: borrador.notes.trim(),
    });
    setGuardando(false);
    if (!ok) return;
    cerrarEditor();
    setGuardado(c.id);
    setTimeout(() => setGuardado((g) => (g === c.id ? null : g)), 2500);
  }

  async function guardar(c: Credencial, patch: Partial<Credencial>): Promise<boolean> {
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
      return false;
    }
    setError(null);
    return true;
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

        {/* Sugerencias compartidas por el formulario de alta y por el editor de
            cada fila. Son eso, sugerencias: se puede escribir cualquier cosa. */}
        <datalist id="claves-servicios">
          {SERVICIOS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

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
                      onClick={() => (abierta ? cerrarEditor() : abrirEditor(c))}
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

                  {/* Enlace y botones juntos en su propio grupo: en el móvil
                      la fila se apila y así estos caen en una línea suya en vez
                      de una debajo de otra. */}
                  <span className="clave__acciones-fila">
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
                          onClick={() => (abierta ? cerrarEditor() : abrirEditor(c))}
                        >
                          {abierta ? "Cerrar" : "Editar"}
                        </button>
                        {guardado === c.id && <span className="clave__ok">guardado</span>}
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
                  </span>
                </div>

                {(c.notes || quien) && !abierta && (
                  <div className="clave__pie">
                    {c.notes && <span>{conEnlaces(c.notes, c.id)}</span>}
                    {quien && (
                      <span className="clave__firma">
                        {quien.full_name.split(" ")[0]} · {commentStamp(c.updated_at)}
                      </span>
                    )}
                  </div>
                )}

                {abierta && puedeEditar && (
                  <form
                    className="clave__editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void guardarBorrador(c);
                    }}
                  >
                    <p className="clave__ayuda">
                      Cambia lo que haga falta y pulsa <b>Guardar</b>. Hasta entonces no se toca
                      nada, así que puedes cancelar sin miedo.
                    </p>
                    <label>
                      <span>Servicio</span>
                      <input
                        className="input-inline"
                        list="claves-servicios"
                        value={borrador.service}
                        onChange={(e) => setBorrador({ ...borrador, service: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Usuario</span>
                      <input
                        className="input-inline"
                        value={borrador.username}
                        onChange={(e) => setBorrador({ ...borrador, username: e.target.value })}
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
                        value={borrador.secret}
                        onChange={(e) => setBorrador({ ...borrador, secret: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Enlace</span>
                      <input
                        className="input-inline"
                        value={borrador.url}
                        placeholder="https://…"
                        onChange={(e) => setBorrador({ ...borrador, url: e.target.value })}
                      />
                    </label>
                    <label className="clave__ancho">
                      <span>Notas</span>
                      <input
                        className="input-inline"
                        value={borrador.notes}
                        placeholder="Doble factor, quién la tiene, cuándo caduca…"
                        onChange={(e) => setBorrador({ ...borrador, notes: e.target.value })}
                      />
                    </label>
                    <div className="clave__acciones">
                      <button type="submit" className="btn btn--primary" disabled={guardando}>
                        {guardando ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={cerrarEditor}
                        disabled={guardando}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
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
              {/* Escribir a mano y a la vez tener la lista: no hay «Otro» que
                  elegir, cualquier nombre vale y las sugerencias salen solas al
                  pulsar la flechita o al empezar a escribir. */}
              <input
                className="input-inline"
                list="claves-servicios"
                placeholder="Instagram, Netflix, Wati…"
                value={nueva.service}
                onChange={(e) => setNueva({ ...nueva, service: e.target.value })}
              />
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
