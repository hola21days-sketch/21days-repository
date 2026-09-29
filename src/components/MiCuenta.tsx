"use client";

import { useMemo, useState } from "react";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { initialsOf } from "@/lib/format";
import type { Profile } from "@/lib/types";

type Props = { me: Profile; onCerrar: () => void };

/** Lo mínimo para que una contraseña no sea un regalo. */
const MINIMO = 10;

/**
 * Mi cuenta: cambiar la propia contraseña.
 * ---------------------------------------------------------------------------
 * Hasta ahora las contraseñas las ponía quien montó las cuentas, que es como
 * empezar pero no como seguir: con las claves de los clientes dentro de la
 * aplicación, cada uno tiene que poder tener la suya y cambiarla cuando le dé
 * la gana, sin pedir permiso a nadie.
 *
 * Va contra Supabase directamente, así que la nueva contraseña no pasa por
 * ninguna tabla nuestra: se guarda cifrada de ida sin vuelta, como debe ser.
 */
export default function MiCuenta({ me, onCerrar }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [aLaVista, setALaVista] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const corta = nueva.length > 0 && nueva.length < MINIMO;
  const distintas = repetida.length > 0 && nueva !== repetida;
  const puede = nueva.length >= MINIMO && nueva === repetida && !guardando;

  async function guardar() {
    if (!puede) return;
    setGuardando(true);
    setError(null);
    const { error: fallo } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (fallo) {
      setError(
        fallo.message.includes("same")
          ? "Esa es la contraseña que ya tenías. Pon otra distinta."
          : `No se ha podido cambiar. ${fallo.message}`,
      );
      return;
    }
    setHecho(true);
    setNueva("");
    setRepetida("");
  }

  return (
    <div className="modal" role="dialog" aria-label="Mi cuenta">
      <div className="modal__panel cuenta">
        <div className="cuenta__cab">
          <Stamp label={me.initials || initialsOf(me.full_name)} color={me.color} foto={me.avatar_url} />
          <div>
            <h2 className="modal__title">{me.full_name}</h2>
            <p className="cuenta__correo">
              {me.email} · {me.role === "admin" ? "Administrador" : "Equipo"}
            </p>
          </div>
        </div>

        {hecho ? (
          <>
            <div className="notice">
              Contraseña cambiada. La próxima vez que entres, usa la nueva. Si tienes la sesión
              abierta en el móvil, ahí seguirá abierta hasta que salgas.
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--primary" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cuenta__aviso">
              Pon una contraseña que uses solo aquí. Nadie más la ve, tampoco un administrador:
              se guarda cifrada y no hay forma de recuperarla, solo de cambiarla.
            </p>

            {error && <div className="notice notice--error">{error}</div>}

            <label className="field">
              <span>Contraseña nueva</span>
              <input
                className="input-inline clave__campo-secreto"
                type={aLaVista ? "text" : "password"}
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder={`Al menos ${MINIMO} caracteres`}
              />
            </label>

            <label className="field">
              <span>Repítela</span>
              <input
                className="input-inline clave__campo-secreto"
                type={aLaVista ? "text" : "password"}
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void guardar();
                  }
                }}
              />
            </label>

            <label className="cuenta__ver">
              <input
                type="checkbox"
                checked={aLaVista}
                onChange={(e) => setALaVista(e.target.checked)}
              />
              <span>Verlas mientras escribo</span>
            </label>

            {corta && (
              <p className="cuenta__pega">
                Le faltan {MINIMO - nueva.length} caracteres.
              </p>
            )}
            {!corta && distintas && <p className="cuenta__pega">Las dos no coinciden.</p>}

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={onCerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void guardar()}
                disabled={!puede}
              >
                {guardando ? "Cambiando…" : "Cambiar la contraseña"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
