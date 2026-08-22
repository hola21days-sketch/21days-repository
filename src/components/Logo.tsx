import { BRAND } from "@/lib/brand";

/**
 * Logotipo de 21days agency: el monograma "21".
 * ---------------------------------------------------------------------------
 * Va dibujado con `currentColor` y sin fondo, así que sale negro sobre el
 * fondo claro y blanco en modo oscuro — el contraste lo pone el tema, no una
 * caja negra pegada al icono.
 *
 * Es un redibujo del logo a partir de la imagen; si tienes el original en
 * vectorial, sustituye los tres trazos de abajo por los del SVG bueno y todo
 * lo demás sigue igual.
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 320"
      role="img"
      aria-label={BRAND.logoAlt}
      height="34"
      width="34"
      fill="none"
      stroke="currentColor"
      strokeWidth="14"
      strokeLinecap="butt"
      strokeLinejoin="round"
    >
      {/* El bucle del 2 */}
      <path d="M92 170 C 86 116, 110 76, 146 76 C 176 76, 191 100, 188 128 C 184 168, 146 191, 92 197" />
      {/* La base, que arranca del bucle y sube hacia el 1 */}
      <path d="M92 197 L92 212 L168 212 C 203 212, 215 172, 219 120" />
      {/* El 1 */}
      <path d="M222 116 L222 252" />
    </svg>
  );
}
