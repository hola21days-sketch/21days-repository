"use client";

/**
 * Las fases del mes.
 * ---------------------------------------------------------------------------
 * No todos los clientes llevan lo mismo. El contenido lo lleva casi todo el
 * mundo; ads, influencers o la web solo algunos. Por eso las fases son de cada
 * cliente y no de la agencia: cada uno tiene las suyas, y en el tablero sale
 * una columna por cada fase que lleve alguien. Donde un cliente no lleva una
 * fase no hay casilla vacía —que no se sabe si es que falta o es que no va—,
 * sino un guion.
 */

export type FaseConocida = { key: string; label: string; position: number };

/** Las que vienen de serie, en el orden en que salen en el tablero. */
export const FASES_CONOCIDAS: FaseConocida[] = [
  { key: "idear", label: "Idear", position: 1 },
  { key: "grabar", label: "Grabar", position: 2 },
  { key: "editar", label: "Editar", position: 3 },
  { key: "planificar", label: "Planificar", position: 4 },
  { key: "programar", label: "Programar", position: 5 },
  { key: "ads", label: "Ads", position: 6 },
  { key: "influencers", label: "Influencers", position: 7 },
  { key: "web", label: "Web", position: 8 },
];

/** Las cinco que lleva un cliente de contenido, que es el caso normal. */
export const FASES_DE_SERIE = ["idear", "grabar", "editar", "planificar", "programar"];

/**
 * El nombre que se escribe a mano se convierte en una clave estable: sin
 * tildes, sin espacios y en minúscula. Es lo que se guarda, para que cambiar
 * el rótulo luego no pierda lo que ya estaba marcado.
 */
export function claveDeFase(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}
