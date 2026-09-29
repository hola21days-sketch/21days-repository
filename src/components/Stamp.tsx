type Props = {
  label: string;
  color: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Foto de la persona. Si no hay, o si falla, se queda el sello de siempre. */
  foto?: string | null;
};

/**
 * El "sello" circular que usa el diseño para personas y clientes.
 * ---------------------------------------------------------------------------
 * Con foto enseña la foto; sin ella, las iniciales sobre su color. Los clientes
 * no tienen foto, así que ahí sigue siendo el sello de toda la vida.
 *
 * Si la foto no carga —se cayó el servidor de Slack, no hay red— el navegador
 * deja el hueco vacío, y por eso las iniciales van debajo en lugar de
 * sustituirse: lo que se ve entonces es el sello normal, no un cuadro roto.
 */
export default function Stamp({ label, color, title, className, style, foto }: Props) {
  return (
    <div
      className={className ? `stamp ${className}` : "stamp"}
      style={{ background: color, ...style }}
      title={title}
    >
      {label}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="stamp__foto" loading="lazy" aria-hidden />
      )}
    </div>
  );
}
