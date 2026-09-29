"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

const ALLOWED_DOMAINS = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function domainAllowed(email: string) {
  if (ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return ALLOWED_DOMAINS.includes(domain);
}

/**
 * No hay alta pública a propósito.
 * ---------------------------------------------------------------------------
 * La aplicación está abierta en internet y dentro hay conversaciones del
 * equipo y las contraseñas de las cuentas de los clientes. Si cualquiera
 * pudiera crearse una cuenta, con eso le bastaría. Las altas las hace un
 * administrador, y la base de datos además deja sin acceso a cualquier ficha
 * que no esté dada de alta por el equipo.
 */
type Mode = "password" | "link";

const TITLES: Record<Mode, string> = {
  password: "Entrar",
  link: "Entrar",
};

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Cambia de pestaña dejando limpios los avisos de la anterior. */
  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function volverA() {
    const volver = new URLSearchParams(window.location.search).get("volver") ?? "/bitacora";
    return volver.startsWith("/") ? volver : "/bitacora";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!domainAllowed(email)) {
      setError(
        `Solo pueden entrar las cuentas de ${ALLOWED_DOMAINS.join(", ")}. Si tu correo es otro, pídeselo a un administrador.`,
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();

    // -------------------------------------------------------------- enlace
    // shouldCreateUser en false: el enlace solo sirve para quien ya está dado
    // de alta; si no, no se crea ninguna cuenta por la puerta de atrás.
    if (mode === "link") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?volver=${encodeURIComponent(
            volverA(),
          )}`,
          shouldCreateUser: false,
        },
      });
      setBusy(false);
      if (error) {
        setError(traducir(error.message));
        return;
      }
      setNotice(
        `Te hemos enviado un enlace de acceso a ${email}. Ábrelo desde este mismo dispositivo.`,
      );
      return;
    }

    // --------------------------------------------- entrar con la contraseña
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(traducir(error.message));
      return;
    }
    router.push(volverA());
    router.refresh();
  }

  return (
    <form className="gate__form" onSubmit={onSubmit}>
      <h1 className="gate__title">{TITLES[mode]}</h1>
      <p className="gate__sub">Acceso reservado al equipo de {BRAND.company}.</p>

      {error && <div className="notice notice--error">{error}</div>}
      {notice && <div className="notice notice--ok">{notice}</div>}


      <div className="field">
        <label htmlFor="email">Correo de trabajo</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={`nombre@${ALLOWED_DOMAINS[0] ?? "empresa.com"}`}
        />
      </div>

      {mode !== "link" && (
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      <button className="btn btn--primary gate__full" type="submit" disabled={busy}>
        {busy ? "Un momento…" : mode === "password" ? "Entrar" : "Enviarme un enlace"}
      </button>

      <div className="gate__switch">
        {mode === "password" && (
          <>
            <span>¿Sin contraseña a mano?</span>
            <button type="button" onClick={() => go("link")}>
              Entrar con un enlace por correo
            </button>
          </>
        )}
        {mode === "link" && (
          <>
            <span>¿Prefieres tu contraseña?</span>
            <button type="button" onClick={() => go("password")}>
              Entrar con contraseña
            </button>
          </>
        )}
      </div>

      <div className="gate__switch gate__switch--nota">
        <span>Las cuentas las da de alta un administrador. Si no tienes, pídesela a Adri o a Aina.</span>
      </div>

      <div className="gate__brandline">
        {BRAND.product} — {BRAND.company}
      </div>
    </form>
  );
}

/** Los mensajes de Supabase llegan en inglés; los más habituales, en castellano. */
function traducir(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed"))
    return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Ese correo ya tiene cuenta. Entra con tu contraseña o pide un enlace por correo.";
  if (m.includes("password should be at least"))
    return "La contraseña es demasiado corta: usa al menos 8 caracteres.";
  if (m.includes("weak password") || m.includes("password is known to be weak"))
    return "Esa contraseña es demasiado fácil de adivinar. Prueba con otra más larga.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "El registro está cerrado. Un administrador tiene que activarlo en Supabase (Authentication → Sign In / Providers → Email) o darte de alta a mano.";
  if (m.includes("should create user"))
    return "Ese correo no tiene cuenta todavía. Créala con «Crear una».";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes"))
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  if (m.includes("user not found")) return "Ese correo no tiene cuenta todavía.";
  if (m.includes("email address") && m.includes("invalid")) return "Ese correo no parece válido.";
  return message;
}
