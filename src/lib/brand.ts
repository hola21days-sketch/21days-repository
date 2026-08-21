/**
 * Identidad de DecaSight.
 * ---------------------------------------------------------------------------
 * Todo lo visual de la marca se cambia desde aquí y desde el bloque
 * "Identidad DecaSight" de src/app/globals.css. No hay colores ni nombres de
 * marca escritos a mano en ningún componente.
 */
export const BRAND = {
  /** Empresa propietaria de la herramienta. */
  company: "DecaSight",
  /** Nombre del producto. */
  product: "Bitácora",
  /** Bajada que aparece bajo el logo en el rail. */
  tagline: "Control de clientes",
  /** Fichero del logo en /public. Sustitúyelo por el logo real de DecaSight. */
  logo: "/logo-decasight.svg",
  /** Texto alternativo del logo. */
  logoAlt: "DecaSight",
} as const;
