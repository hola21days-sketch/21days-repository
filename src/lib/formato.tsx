import React from "react";

/**
 * Negrita, cursiva y tachado en los mensajes, como en Slack.
 * ---------------------------------------------------------------------------
 * Se escriben igual que allí: *negrita*, _cursiva_ y ~tachado~. Así lo que se
 * trajo de Slack, que ya venía con esas marcas, se lee bien sin tocar nada, y
 * quien viene de Slack no tiene que aprender nada nuevo.
 *
 * Para no estropear textos normales, la marca tiene que ir pegada a la
 * palabra (`*hola*` sí, `* hola *` no) y no puede estar en medio de una
 * palabra (`nombre_de_archivo` se queda como está).
 */

/** Lo que hay que escribir alrededor del texto para cada formato. */
export const MARCAS = { negrita: "*", cursiva: "_", tachado: "~" } as const;
export type Formato = keyof typeof MARCAS;

const PATRON =
  /(?<![\p{L}\p{N}*_~])(\*(?!\s)[^*\n]+?(?<!\s)\*|_(?!\s)[^_\n]+?(?<!\s)_|~(?!\s)[^~\n]+?(?<!\s)~)(?![\p{L}\p{N}*_~])/gu;

/** Pinta un trozo de texto con su negrita, cursiva y tachado. */
export function conFormato(texto: string, clave = ""): React.ReactNode[] {
  const trozos = texto.split(PATRON);
  return trozos.map((t, i) => {
    const k = `${clave}-f${i}`;
    if (i % 2 === 0) return <React.Fragment key={k}>{t}</React.Fragment>;
    const dentro = conFormato(t.slice(1, -1), k);
    if (t[0] === "*") return <strong key={k}>{dentro}</strong>;
    if (t[0] === "_") return <em key={k}>{dentro}</em>;
    return <s key={k}>{dentro}</s>;
  });
}

/**
 * Pone o quita la marca alrededor de lo seleccionado en un cuadro de texto.
 * Sin nada seleccionado, deja las dos marcas con el cursor en medio para
 * escribir ya en negrita o en cursiva.
 */
export function aplicarFormato(
  campo: HTMLTextAreaElement,
  formato: Formato,
  cambiar: (valor: string) => void,
) {
  const marca = MARCAS[formato];
  const { value, selectionStart: ini, selectionEnd: fin } = campo;
  const antes = value.slice(0, ini);
  const elegido = value.slice(ini, fin);
  const despues = value.slice(fin);

  let nuevo: string;
  let selIni: number;
  let selFin: number;
  if (antes.endsWith(marca) && despues.startsWith(marca)) {
    // Ya estaba marcado: se quita.
    nuevo = antes.slice(0, -1) + elegido + despues.slice(1);
    selIni = ini - 1;
    selFin = fin - 1;
  } else {
    // Los espacios de los bordes se quedan fuera, que si no la marca no vale.
    const izq = elegido.length - elegido.trimStart().length;
    const der = elegido.length - elegido.trimEnd().length;
    const nucleo = elegido.trim();
    nuevo =
      antes + elegido.slice(0, izq) + marca + nucleo + marca + elegido.slice(elegido.length - der) + despues;
    selIni = ini + izq + 1;
    selFin = selIni + nucleo.length;
  }
  cambiar(nuevo);
  // Después de que React pinte el valor nuevo, se recoloca la selección.
  requestAnimationFrame(() => {
    campo.focus();
    campo.setSelectionRange(selIni, selFin);
  });
}

/**
 * Cmd/Ctrl+B para negrita y Cmd/Ctrl+I para cursiva. Devuelve true si la
 * tecla era un atajo, para no hacer nada más con ella.
 */
export function atajoDeFormato(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  cambiar: (valor: string) => void,
): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  const tecla = e.key.toLowerCase();
  const formato: Formato | null =
    tecla === "b" ? "negrita" : tecla === "i" ? "cursiva" : e.shiftKey && tecla === "x" ? "tachado" : null;
  if (!formato) return false;
  e.preventDefault();
  aplicarFormato(e.currentTarget, formato, cambiar);
  return true;
}

type BotonesProps = {
  campo: React.RefObject<HTMLTextAreaElement | null>;
  cambiar: (valor: string) => void;
};

/** Los botones B e I del cuadro de escribir. */
export function BotonesFormato({ campo, cambiar }: BotonesProps) {
  const boton = (formato: Formato, texto: React.ReactNode, titulo: string) => (
    <button
      type="button"
      className="composer__formato"
      title={titulo}
      aria-label={titulo}
      // Sin esto el clic quita el foco del cuadro y se pierde la selección.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (campo.current) aplicarFormato(campo.current, formato, cambiar);
      }}
    >
      {texto}
    </button>
  );
  return (
    <span className="composer__formatos">
      {boton("negrita", <b>B</b>, "Negrita (Cmd/Ctrl+B)")}
      {boton("cursiva", <i>I</i>, "Cursiva (Cmd/Ctrl+I)")}
    </span>
  );
}
