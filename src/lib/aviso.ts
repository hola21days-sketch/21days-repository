"use client";

/**
 * El sonido de mensaje nuevo.
 * ---------------------------------------------------------------------------
 * Dos notas cortas, generadas al vuelo con el propio navegador. No hay fichero
 * de audio a propósito: son unos cuantos kilobytes menos que cargar, nada que
 * pueda dar 404, y así suena igual de bien en cualquier aparato.
 *
 * Los navegadores no dejan sonar nada hasta que la persona ha tocado la página
 * al menos una vez. No es un fallo: es para que ninguna web te pegue un susto
 * nada más abrirla. Por eso, si todavía no se ha tocado nada, esto no suena y
 * ya está, sin dar error.
 */

const CLAVE = "bitacora-aviso-sonido";

/** ¿Está puesto el aviso? Por defecto sí. */
export function avisoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "no";
  } catch {
    return true;
  }
}

export function ponerAviso(activo: boolean) {
  try {
    localStorage.setItem(CLAVE, activo ? "si" : "no");
  } catch {
    // Ventana privada o almacenamiento bloqueado: no pasa nada, se queda
    // encendido durante esta visita.
  }
}

type Ventana = Window & { webkitAudioContext?: typeof AudioContext };

let contexto: AudioContext | null = null;

function dameContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto) return contexto;
  const Ctor = window.AudioContext ?? (window as Ventana).webkitAudioContext;
  if (!Ctor) return null;
  contexto = new Ctor();
  return contexto;
}

/** Una nota suave, con entrada y salida para que no chasquee. */
function nota(ctx: AudioContext, hz: number, empieza: number, dura: number, volumen: number) {
  const osc = ctx.createOscillator();
  const gan = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  gan.gain.setValueAtTime(0, empieza);
  gan.gain.linearRampToValueAtTime(volumen, empieza + 0.012);
  gan.gain.exponentialRampToValueAtTime(0.0001, empieza + dura);
  osc.connect(gan).connect(ctx.destination);
  osc.start(empieza);
  osc.stop(empieza + dura + 0.02);
}

/**
 * Suena el aviso de mensaje nuevo. Si está apagado, o el navegador todavía no
 * deja sonar, no hace nada y no se queja.
 */
export function sonarAviso() {
  if (!avisoActivo()) return;
  const ctx = dameContexto();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  if (ctx.state !== "running") return;
  const ahora = ctx.currentTime;
  nota(ctx, 880, ahora, 0.1, 0.08);
  nota(ctx, 1174.7, ahora + 0.1, 0.16, 0.07);
}

/** Para la prueba al encenderlo: que se oiga lo que se está activando. */
export function probarAviso() {
  const ctx = dameContexto();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  const ahora = ctx.currentTime;
  nota(ctx, 880, ahora, 0.1, 0.08);
  nota(ctx, 1174.7, ahora + 0.1, 0.16, 0.07);
}
