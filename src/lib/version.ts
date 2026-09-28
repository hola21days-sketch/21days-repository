/**
 * Qué versión está publicada ahora mismo.
 * ---------------------------------------------------------------------------
 * Sirve para una cosa muy concreta: cuando algo «no aparece», saber si es que
 * el cambio no está hecho o es que Vercel o el navegador siguen sirviendo la
 * versión de antes. Se lee del commit con el que se construyó la app; en local
 * no hay ninguno y pone «local».
 *
 * Next.js sustituye estas variables al construir, así que el valor queda
 * grabado en el propio HTML y mirarlo no cuesta nada.
 */
const SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "";
const FECHA = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/** «a7267b0 · 28/09 09:31», para el pie del panel izquierdo. */
export function versionPublicada(): string {
  const commit = SHA ? SHA.slice(0, 7) : "local";
  if (!FECHA) return commit;
  const sello = new Date(FECHA).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${commit} · ${sello}`;
}
