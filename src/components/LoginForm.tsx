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

type Mode = "password" | "link";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);

    if (!domainAllowed(email)) {
      setError(
        `Solo pueden entrar las cuentas de ${ALLOWED_DOMAINS.join(", ")}. Si tu correo es otro, pídeselo a un administrador.`,
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();

    if (mode === "link") {
      const redirectTo = `${window.location.origin}/auth/callback?volver=${encodeURIComponent(
        new URLSearchParams(window.location.search).get("volver") ?? "/bitacora",
      )}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      setBusy(false);
      if (error) {
        setError(traducir(error.message));
        return;
      }
      setSent(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(traducir(error.message));
      return;
    }
    const volver = new URLSearchParams(window.location.search).get("volver") ?? "/bitacora";
    router.push(volver.startsWith("/") ? volver : "/bitacora");
    router.refresh();
  }

  return (
    <form className="gate__form" onSubmit={onSubmit}>
      <h1 className="gate__title">Entrar</h1>
      <p className="gate__sub">
        Acceso reservado al equipo de {BRAND.company}. Si aún no tienes cuenta, pídesela a un
        administrador.
      </p>

      {error && <div className="notice notice--error">{error}</div>}
      {sent && (
        <div className="notice notice--ok">
          Te hemos enviado un enlace de acceso a <b>{email}</b>. Ábrelo desde este mismo dispositivo.
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

      {mode === "password" && (
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
        {mode === "password" ? (
          <>
            <span>¿Sin contraseña a mano?</span>
            <button type="button" onClick={() => { setMode("link"); setError(null); }}>
              Entrar con un enlace por correo
            </button>
          </>
        ) : (
          <>
            <span>¿Prefieres tu contraseña?</span>
            <button type="button" onClick={() => { setMode("password"); setError(null); setSent(false); }}>
              Entrar con contraseña
            </button>
          </>
        )}
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
  if (m.includes("email not confirmed")) return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.";
  if (m.includes("signups not allowed") || m.includes("should create user"))
    return "Ese correo no tiene cuenta todavía. Pídesela a un administrador.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  if (m.includes("user not found")) return "Ese correo no tiene cuenta todavía.";
  return message;
}
