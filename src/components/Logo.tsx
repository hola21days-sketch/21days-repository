import { BRAND } from "@/lib/brand";

/**
 * Logotipo de DecaSight.
 * ---------------------------------------------------------------------------
 * PROVISIONAL: marca denominativa dibujada con los tokens de color, para que
 * funcione en claro y en oscuro sin depender de dos ficheros.
 *
 * Cuando tengas el logo oficial:
 *   1. Deja el SVG en  public/logo-decasight.svg
 *   2. Sustituye todo el <svg> de abajo por:
 *        <img src={BRAND.logo} alt={BRAND.logoAlt} className="rail__logo" />
 *      (o pega aquí el contenido del SVG, cambiando sus colores por
 *       var(--ink) y var(--accent) para que siga el tema claro/oscuro).
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 236 32"
      role="img"
      aria-label={BRAND.logoAlt}
      height="22"
      width="162"
    >
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="4" fill="var(--accent)" />
      <text
        x="38"
        y="22"
        fill="var(--ink)"
        fontFamily="var(--font-body)"
        fontSize="19"
        fontWeight="600"
        letterSpacing="1.6"
      >
        DECA
      </text>
      <text
        x="103"
        y="22"
        fill="var(--ink-muted)"
        fontFamily="var(--font-body)"
        fontSize="19"
        fontWeight="300"
        letterSpacing="1.6"
      >
        SIGHT
      </text>
    </svg>
  );
}
