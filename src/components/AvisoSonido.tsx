"use client";

import { useEffect, useState } from "react";
import { avisoActivo, ponerAviso, probarAviso } from "@/lib/aviso";

/**
 * El interruptor del sonido de mensaje nuevo.
 * ---------------------------------------------------------------------------
 * Se lee del navegador, así que cada uno lo tiene como quiera en cada aparato:
 * encendido en el ordenador y apagado en el móvil, por ejemplo. Al encenderlo
 * suena una vez, para saber qué se está activando y para que el navegador dé
 * permiso: hasta que no se toca la página, no deja sonar nada.
 */
export default function AvisoSonido() {
  const [activo, setActivo] = useState(true);
  // El estado real se lee después de pintar: en el servidor no hay navegador.
  useEffect(() => setActivo(avisoActivo()), []);

  return (
    <button
      type="button"
      className="btn btn--icon"
      aria-pressed={activo}
      title={activo ? "Sonido de mensaje nuevo: encendido" : "Sonido de mensaje nuevo: apagado"}
      onClick={() => {
        const siguiente = !activo;
        setActivo(siguiente);
        ponerAviso(siguiente);
        if (siguiente) probarAviso();
      }}
    >
      {activo ? "🔔" : "🔕"}
    </button>
  );
}
