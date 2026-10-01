"use client";

import Stamp from "./Stamp";
import type { Profile } from "@/lib/types";

type Props = {
  profiles: Profile[];
  /** Quién la lleva ahora mismo. */
  elegidos: string[];
  onAlternar: (profileId: string, estaba: boolean) => void;
};

/**
 * Quién hace una tarea, con sitio para varias personas.
 * ---------------------------------------------------------------------------
 * Un desplegable solo deja elegir a uno, y hay trabajo que se reparte entre
 * dos o tres. Aquí cada persona es un botón que se enciende y se apaga: se ve
 * de un vistazo quién está dentro y quién no, sin abrir nada.
 */
export default function QuienLaHace({ profiles, elegidos, onAlternar }: Props) {
  return (
    <div className="quien">
      {profiles.map((p) => {
        const dentro = elegidos.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            className={dentro ? "quien__op is-on" : "quien__op"}
            aria-pressed={dentro}
            onClick={() => onAlternar(p.id, dentro)}
            title={dentro ? `Quitar a ${p.full_name}` : `Ponérsela a ${p.full_name}`}
          >
            <Stamp label={p.initials} color={p.color} foto={p.avatar_url} />
            {p.full_name.split(" ")[0]}
          </button>
        );
      })}
      {elegidos.length === 0 && <span className="quien__nadie">Sin asignar</span>}
    </div>
  );
}
