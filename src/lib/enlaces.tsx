import React from "react";

/**
 * Convierte en enlaces pulsables las direcciones que aparecen en un texto.
 * ---------------------------------------------------------------------------
 * En el chat se pegan constantemente carpetas de Drive, planificaciones de
 * Canva y referencias de Instagram o TikTok. Escribirlas no sirve de nada si
 * hay que copiarlas a mano, así que se detectan y se pintan como enlaces.
 *
 * Se reconocen las que empiezan por http(s):// y también las que se escriben
 * sin protocolo (drive.google.com/…), que es como las pega todo el mundo.
 */
const PATRON =
  /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|(?:www\.|[a-z0-9-]+\.(?:com|es|cat|net|org|io|ai|app|link|me|tv|co))\/[^\s<>()]*[^\s<>().,;:!?])/gi;

/** Acorta lo que se enseña, sin tocar a dónde apunta. */
function comoSeLee(url: string): string {
  const limpio = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return limpio.length > 48 ? `${limpio.slice(0, 45)}…` : limpio;
}

export function conEnlaces(texto: string, clave = ""): React.ReactNode[] {
  const trozos = texto.split(PATRON);
  return trozos.map((t, i) => {
    if (i % 2 === 1) {
      const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      return (
        <a key={`${clave}-l${i}`} href={href} target="_blank" rel="noopener noreferrer" className="enlace">
          {comoSeLee(t)}
        </a>
      );
    }
    return <React.Fragment key={`${clave}-t${i}`}>{t}</React.Fragment>;
  });
}
