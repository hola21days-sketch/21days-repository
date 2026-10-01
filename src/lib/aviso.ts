"use client";

/**
 * El sonido de mensaje nuevo.
 * ---------------------------------------------------------------------------
 * Tres notas que suben, generadas al vuelo con el propio navegador. No hay
 * fichero de audio a propósito: son unos cuantos kilobytes menos que cargar,
 * nada que pueda dar 404, y así suena igual de bien en cualquier aparato.
 *
 * Suena fuerte y a propósito: el aviso de antes era tan suave que se perdía
 * con la música o con el ruido de la oficina, y un aviso que no se oye no
 * sirve de nada. Va por un compresor, que es lo que usa la radio para sonar
 * alto sin distorsionar, y las notas son agudas porque son las que se abren
 * paso en el altavoz de un portátil o de un móvil.
 *
 * Los navegadores no dejan sonar nada hasta que la persona ha tocado la página
 * al menos una vez. No es un fallo: es para que ninguna web te pegue un susto
 * nada más abrirla. Por eso, en cuanto se toca cualquier cosa se despierta el
 * sonido, para que el primer mensaje del día ya se oiga.
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
let salida: AudioNode | null = null;

function dameContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto) return contexto;
  const Ctor = window.AudioContext ?? (window as Ventana).webkitAudioContext;
  if (!Ctor) return null;
  contexto = new Ctor();

  // Compresor: deja subir mucho el volumen sin que chasquee ni sature.
  const compresor = contexto.createDynamicsCompressor();
  compresor.threshold.value = -18;
  compresor.ratio.value = 12;
  compresor.attack.value = 0.002;
  compresor.release.value = 0.2;
  const maestro = contexto.createGain();
  maestro.gain.value = 1;
  compresor.connect(maestro).connect(contexto.destination);
  salida = compresor;
  return contexto;
}

/**
 * Despierta el sonido en cuanto se toca la página.
 * ---------------------------------------------------------------------------
 * El navegador no deja sonar nada hasta que ha habido un clic o una tecla. Si
 * esperásemos al primer mensaje, ese primero se perdería siempre. Así que a la
 * primera que se toca algo se abre el audio y queda listo.
 */
let preparado = false;

export function prepararAviso() {
  if (typeof window === "undefined" || preparado) return;
  preparado = true;
  const despertar = () => {
    const ctx = dameContexto();
    void ctx?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", despertar, { once: true });
  window.addEventListener("keydown", despertar, { once: true });

  // Volver a la ventana es haberse enterado: se limpia la cuenta del título.
  const alVolver = () => {
    if (document.visibilityState !== "visible") return;
    sinVer = 0;
    marcarTitulo();
  };
  document.addEventListener("visibilitychange", alVolver);
  window.addEventListener("focus", alVolver);
}

/** Una nota, con cuerpo: la fundamental aguda y una octava por debajo. */
function nota(ctx: AudioContext, destino: AudioNode, hz: number, empieza: number, dura: number) {
  for (const [tipo, frec, vol] of [
    ["sine", hz, 0.9],
    ["triangle", hz / 2, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = frec;
    gan.gain.setValueAtTime(0, empieza);
    gan.gain.linearRampToValueAtTime(vol, empieza + 0.008);
    gan.gain.exponentialRampToValueAtTime(0.0001, empieza + dura);
    osc.connect(gan).connect(destino);
    osc.start(empieza);
    osc.stop(empieza + dura + 0.02);
  }
}

/** El toque entero: tres notas que suben, y otra vez, para que no se escape. */
function tocar(ctx: AudioContext, destino: AudioNode, desde: number) {
  for (const retraso of [0, 0.5]) {
    const t = desde + retraso;
    nota(ctx, destino, 987.8, t, 0.13);
    nota(ctx, destino, 1318.5, t + 0.12, 0.13);
    nota(ctx, destino, 1760, t + 0.24, 0.34);
  }
}

async function suena() {
  const ctx = dameContexto();
  if (!ctx || !salida) return;
  // Si el navegador lo tenía dormido (pestaña de fondo, o todavía sin tocar la
  // página), se despierta y se espera: antes se intentaba sonar sin esperar y
  // el aviso se perdía.
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;
  tocar(ctx, salida, ctx.currentTime);
}

/**
 * Suena el aviso de mensaje nuevo. Si está apagado, o el navegador todavía no
 * deja sonar, no hace nada y no se queja.
 */
export function sonarAviso() {
  if (!avisoActivo()) return;
  void suena();
}

/** Para la prueba al encenderlo: que se oiga lo que se está activando. */
export function probarAviso() {
  void suena();
}

/* ========================================================================== */
/* Avisos que se ven                                                          */
/* ========================================================================== */

/**
 * La cuenta en el título de la pestaña.
 * ---------------------------------------------------------------------------
 * Con el volumen bajado, o con la pestaña perdida entre otras quince, el
 * sonido no basta. El título pasa a «(3) Bitácora», que es lo que se ve en la
 * barra del navegador sin tener que abrir nada. Se pone a cero al volver.
 */
let sinVer = 0;
let tituloBase = "";

function marcarTitulo() {
  if (typeof document === "undefined") return;
  if (!tituloBase) tituloBase = document.title.replace(/^\(\d+\)\s*/, "");
  document.title = sinVer > 0 ? `(${sinVer}) ${tituloBase}` : tituloBase;
}

/**
 * El sonido solo sirve si estás delante. Cuando la ventana está detrás de otra
 * cosa —y es lo normal, porque se trabaja en veinte sitios a la vez— hace
 * falta el aviso del propio ordenador, el que sale en la esquina. Se pide
 * permiso al encender la campana, que es cuando la persona lo está pidiendo,
 * y no al entrar: nadie quiere que una web le pregunte nada más abrirla.
 */
export function pedirPermisoAvisos() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => {});
}

/** Saca el aviso del sistema, solo si la ventana no está a la vista. */
export function avisarEnPantalla(titulo: string, cuerpo: string) {
  if (!avisoActivo()) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(titulo, { body: cuerpo, icon: "/icono-192.png", tag: "bitacora" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Algunos navegadores de móvil solo dejan hacer esto desde un service
    // worker. Si no se puede, queda el sonido y el título de la pestaña.
  }
}

/**
 * El aviso entero: suena, cuenta en el título y, si no estás delante, sale en
 * la esquina del ordenador. Es lo que hay que llamar cuando llega algo nuevo;
 * así no se queda nunca a medias, que era lo que pasaba antes.
 */
export function avisar(titulo: string, cuerpo: string) {
  sonarAviso();
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    sinVer += 1;
    marcarTitulo();
  }
  avisarEnPantalla(titulo, cuerpo);
}
