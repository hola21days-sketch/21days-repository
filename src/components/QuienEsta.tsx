"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Props = {
  profileById: Record<string, Profile>;
};

type Activo = { profile_id: string; hace_min: number };

/** Cuánto vale una actividad: pasado este rato sin tocar nada, se deja de salir. */
const MINUTOS = 15;
/** Cada cuánto se apunta la actividad propia, como mucho. */
const CADA_MS = 60_000;
/** Cada cuánto se vuelve a mirar quién anda por aquí. */
const REFRESCO_MS = 60_000;
/** Lo que se ve de una vez; el resto va en un «+N». */
const MAX_VISIBLES = 6;

const EVENTOS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;

/**
 * Quién anda por aquí.
 * ---------------------------------------------------------------------------
 * Las caras de arriba a la derecha son las de quien ha hecho algo en la
 * aplicación en los últimos 15 minutos: pulsar, escribir, desplazarse, mover el
 * ratón. Tenerla abierta en una pestaña olvidada no cuenta, porque ahí no pasa
 * nada de eso.
 *
 * La actividad propia se apunta como mucho una vez por minuto, y la hora la
 * pone la base de datos, así que un reloj mal puesto no engaña a nadie.
 */
export default function QuienEsta({ profileById }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [activos, setActivos] = useState<Activo[]>([]);
  const ultimaMarca = useRef(0);

  const mirar = useCallback(async () => {
    const { data, error } = await supabase.rpc("activos_recientes", { p_minutos: MINUTOS });
    if (!error && data) setActivos(data as Activo[]);
  }, [supabase]);

  // Apuntar lo propio: al entrar y, después, cuando se hace algo.
  useEffect(() => {
    async function marcar() {
      const ahora = Date.now();
      if (ahora - ultimaMarca.current < CADA_MS) return;
      ultimaMarca.current = ahora;
      await supabase.rpc("marcar_actividad");
      void mirar();
    }

    void marcar();
    const alHacerAlgo = () => void marcar();
    // En captura, para enterarse también de lo que se desplaza por dentro
    // (la lista de mensajes), que no llega a la ventana de otro modo.
    for (const ev of EVENTOS) {
      window.addEventListener(ev, alHacerAlgo, { passive: true, capture: true });
    }
    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, alHacerAlgo, { capture: true });
    };
  }, [supabase, mirar]);

  // Mirar a los demás cada minuto, y al volver a la pestaña.
  useEffect(() => {
    void mirar();
    const intervalo = setInterval(() => void mirar(), REFRESCO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [mirar]);

  const personas = activos
    .map((a) => ({ ...a, perfil: profileById[a.profile_id] }))
    .filter((a) => a.perfil);

  if (personas.length === 0) return null;

  const visibles = personas.slice(0, MAX_VISIBLES);
  const resto = personas.slice(MAX_VISIBLES);

  return (
    <div
      className="avatar-stack quien-esta"
      aria-label={`Activos en los últimos ${MINUTOS} minutos`}
      title={`Activos en los últimos ${MINUTOS} minutos`}
    >
      {visibles.map(({ perfil, hace_min }) => (
        <Stamp
          key={perfil.id}
          label={perfil.initials}
          color={perfil.color}
          foto={perfil.avatar_url}
          title={`${perfil.full_name} — ${hace_min < 1 ? "ahora mismo" : `hace ${hace_min} min`}`}
        />
      ))}
      {resto.length > 0 && (
        <Stamp
          label={`+${resto.length}`}
          color="var(--ink-faint)"
          title={resto.map((r) => r.perfil.full_name).join(", ")}
        />
      )}
    </div>
  );
}
