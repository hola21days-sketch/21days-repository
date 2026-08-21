"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import { initialsOf } from "@/lib/format";

const ALLOWED_DOMAINS = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function domainAllowed(email: string) {
  if (ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return ALLOWED_DOMAINS.includes(domain);
}

type Mode = "password" | "link" | "signup";

const TITLES: Record<Mode, string> = {
  password: "Entrar",
  link: "Entrar",
  signup: "Crear cuenta",
};

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [name, setName] = useState("");
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

    // ---------------------------------------------------------------- alta
    if (mode === "signup") {
      const fullName = name.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, initials: initialsOf(fullName) },
          emailRedirectTo: `${window.location.origin}/auth/callback?volver=${encodeURIComponent(
            volverA(),
          )}`,
        },
      });

      if (error) {
        setBusy(false);
        setError(traducir(error.message));
        return;
      }

      // Supabase no dice "ese correo ya existe" para no delatar quién tiene
      // cuenta: devuelve un usuario sin identidades. Lo traducimos nosotros.
      if (data.user && data.user.identities?.length === 0) {
        setBusy(false);
        setError("Ese correo ya tiene cuenta. Entra con tu contraseña o pide un enlace por correo.");
        return;
      }

      // Lo normal: el alta ya trae sesión y entramos directos.
      if (data.session) {
        router.push(volverA());
        router.refresh();
        return;
      }

      // Si el proyecto tiene activada la confirmación por correo, signUp no
      // devuelve sesión. Aun así entramos: el trigger auto_confirm_new_user de
      // la base de datos deja el correo por confirmado al crear el usuario.
      const entrada = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (!entrada.error) {
        router.push(volverA());
        router.refresh();
        return;
      }

      setNotice(
        `Cuenta creada para ${email}. Ya puedes entrar con tu contraseña desde «Entrar».`,
      );
      return;
    }

    // ------------------------------------------------- entrar con un enlace
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
      <p className="gate__sub">
        {mode === "signup"
          ? `Date de alta con tu correo de trabajo para entrar en la bitácora de ${BRAND.company}.`
          : `Acceso reservado al equipo de ${BRAND.company}.`}
      </p>

      {error && <div className="notice notice--error">{error}</div>}
      {notice && <div className="notice notice--ok">{notice}</div>}

      {mode === "signup" && (
        <div className="field">
          <label htmlFor="name">Nombre y apellido</label>
          <input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Marc Valero"
          />
        </div>
      )}

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
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && (
            <span style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
              Mínimo 8 caracteres.
            </span>
          )}
        </div>
      )}

      <button className="btn btn--primary gate__full" type="submit" disabled={busy}>
        {busy
          ? "Un momento…"
          : mode === "password"
            ? "Entrar"
            : mode === "link"
              ? "Enviarme un enlace"
              : "Crear cuenta"}
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
        {mode === "signup" && (
          <>
            <span>¿Ya tienes cuenta?</span>
            <button type="button" onClick={() => go("password")}>
              Entrar
            </button>
          </>
        )}
      </div>

      {mode !== "signup" && (
        <div className="gate__switch">
          <span>¿Aún no tienes cuenta?</span>
          <button type="button" onClick={() => go("signup")}>
            Crear una
          </button>
        </div>
      )}

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
