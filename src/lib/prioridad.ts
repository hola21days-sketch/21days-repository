/**
 * Prioridad de encargos, tareas y clientes.
 * ---------------------------------------------------------------------------
 * Cuatro niveles y un orden fijo: lo urgente manda sobre lo importante, y lo
 * normal sobre lo que puede esperar. Se define aquí una sola vez para que la
 * misma etiqueta y el mismo color salgan en el tablero, en las tareas y en el
 * panel de clientes.
 */
export type Prioridad = "urgente" | "importante" | "normal" | "baja";

export const PRIORIDADES: { key: Prioridad; texto: string; corto: string }[] = [
  { key: "urgente", texto: "Urgente", corto: "URG" },
  { key: "importante", texto: "Importante", corto: "IMP" },
  { key: "normal", texto: "Normal", corto: "NOR" },
  { key: "baja", texto: "Puede esperar", corto: "BAJ" },
];

const ORDEN: Record<Prioridad, number> = {
  urgente: 0,
  importante: 1,
  normal: 2,
  baja: 3,
};

export const TEXTO_PRIORIDAD: Record<Prioridad, string> = Object.fromEntries(
  PRIORIDADES.map((p) => [p.key, p.texto]),
) as Record<Prioridad, string>;

/** Para ordenar listas: lo más urgente primero. */
export function pesoPrioridad(p: Prioridad | null | undefined): number {
  return ORDEN[p ?? "normal"] ?? 2;
}

/**
 * Todas las prioridades llevan etiqueta, no solo las altas: si solo se pinta
 * lo urgente, no se distingue lo normal de lo que puede esperar.
 */
export function destaca(p: Prioridad): boolean {
  return p !== null && p !== undefined;
}

/** El texto corto que va dentro de la etiqueta. */
export function etiqueta(p: Prioridad): string {
  return TEXTO_PRIORIDAD[p] ?? "Normal";
}
