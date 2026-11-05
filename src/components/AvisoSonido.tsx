"use client";

import { useEffect, useRef, useState } from "react";
import {
  EVENTO_SILENCIO,
  SIEMPRE,
  pedirPermisoAvisos,
  prepararAviso,
  probarAviso,
  reactivar,
  silenciadoHasta,
  silenciar,
} from "@/lib/aviso";

/** Mañana a las 9:00, que es cuando empieza el día. */
function mañanaALas9(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function horaDe(ms: number): string {
  const d = new Date(ms);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return mismoDia ? `hasta las ${hora}` : `hasta mañana a las ${hora}`;
}

/**
 * Silenciar los avisos de toda la aplicación.
 * ---------------------------------------------------------------------------
 * La campana no es de un canal: silencia los sonidos y los avisos del
 * ordenador de todo lo que llega —mensajes de cualquier canal, mensajes
 * directos y tareas— en todas las pestañas abiertas de este aparato. Se puede
 * silenciar un rato, hasta mañana o hasta volver a activarlo, como en Slack.
 *
 * Los avisos que se ven dentro de la aplicación (la negrita, el número rojo)
 * siguen saliendo: silenciar es que no suene ni salte nada, no dejar de
 * enterarse.
 */
export default function AvisoSonido() {
  const [hasta, setHasta] = useState<number | null>(null);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // El estado real se lee del navegador, y se vuelve a leer si cambia en otra
  // pestaña o cuando se acaba el rato de silencio.
  useEffect(() => {
    const leer = () => setHasta(silenciadoHasta());
    leer();
    prepararAviso();
    window.addEventListener(EVENTO_SILENCIO, leer);
    window.addEventListener("storage", leer);
    const reloj = setInterval(leer, 30_000);
    return () => {
      window.removeEventListener(EVENTO_SILENCIO, leer);
      window.removeEventListener("storage", leer);
      clearInterval(reloj);
    };
  }, []);

  // Cerrar el menú al pulsar fuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("mousedown", fuera);
    return () => window.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const silenciado = hasta !== null;
  const texto = !silenciado
    ? "Avisos de toda la aplicación: activados"
    : hasta === SIEMPRE
      ? "Avisos de toda la aplicación: silenciados"
      : `Avisos de toda la aplicación: silenciados ${horaDe(hasta)}`;

  function elegir(fin: number | null) {
    setAbierto(false);
    if (fin === null) {
      reactivar();
      probarAviso();
      // Al encenderlo se pide también el aviso del ordenador: el sonido solo
      // sirve si estás delante de esta ventana.
      pedirPermisoAvisos();
    } else {
      silenciar(fin);
    }
  }

  return (
    <div className="silencio" ref={caja}>
      <button
        type="button"
        className={silenciado ? "btn silencio__boton is-silenciado" : "btn btn--icon silencio__boton"}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={texto}
        onClick={() => setAbierto((x) => !x)}
      >
        {silenciado ? "🔕" : "🔔"}
        {silenciado && <span className="silencio__etiqueta">Silenciado</span>}
      </button>

      {abierto && (
        <div className="silencio__menu" role="menu">
          <p className="silencio__titulo">
            {silenciado ? (
              <>
                Toda la aplicación está en silencio
                {hasta !== SIEMPRE && <> {horaDe(hasta!)}</>}.
              </>
            ) : (
              <>Silenciar los avisos de <b>toda la aplicación</b>: todos los canales, mensajes directos y tareas.</>
            )}
          </p>
          {silenciado ? (
            <button type="button" role="menuitem" onClick={() => elegir(null)}>
              🔔 Volver a activar los avisos
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => elegir(Date.now() + 30 * 60_000)}>
                Silenciar 30 minutos
              </button>
              <button type="button" role="menuitem" onClick={() => elegir(Date.now() + 60 * 60_000)}>
                Silenciar 1 hora
              </button>
              <button type="button" role="menuitem" onClick={() => elegir(mañanaALas9())}>
                Silenciar hasta mañana a las 9:00
              </button>
              <button type="button" role="menuitem" onClick={() => elegir(SIEMPRE)}>
                Silenciar hasta que lo vuelva a activar
              </button>
            </>
          )}
          <p className="silencio__nota">
            Solo deja de sonar y de saltar el aviso del ordenador; la negrita y los números rojos
            siguen saliendo. Vale para este aparato.
          </p>
        </div>
      )}
    </div>
  );
}
