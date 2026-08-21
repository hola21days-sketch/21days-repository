type Props = {
  label: string;
  color: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

/** El "sello" circular con iniciales que usa el diseño para personas y clientes. */
export default function Stamp({ label, color, title, className, style }: Props) {
  return (
    <div
      className={className ? `stamp ${className}` : "stamp"}
      style={{ background: color, ...style }}
      title={title}
    >
      {label}
    </div>
  );
}
