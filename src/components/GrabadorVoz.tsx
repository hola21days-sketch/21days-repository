"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Se llama con la nota terminada, lista para mandar como adjunto. */
  onGrabado: (nota: File) => void;
  disabled?: boolean;
};

/** "1:07" */
function reloj(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** El primer formato de los de la lista que el navegador sepa grabar. */
function formatoBueno(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const opciones = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // Safari solo sabe este
    "audio/ogg;codecs=opus",
  ];
  return opciones.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Notas de voz.
 * ---------------------------------------------------------------------------
 * Pulsar para empezar, pulsar para parar. Al parar, la nota se va con el
 * mensaje como un adjunto más, así que se guarda, se escucha en el chat y se
 * puede transcribir igual que un vídeo.
 *
 * Hay botón de tirarla antes de mandarla: una nota de voz sale mal a la
 * primera más veces de las que uno querría.
 */
export default function GrabadorVoz({ onGrabado, disabled }: Props) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<BlobPart[]>([]);
  const relojRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tirarRef = useRef(false);

  /** Suelta el micrófono: si no, el navegador deja el punto rojo encendido. */
  function soltar() {
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    if (relojRef.current) clearInterval(relojRef.current);
    relojRef.current = null;
    setGrabando(false);
    setSegundos(0);
  }

  useEffect(() => () => soltar(), []);

  async function empezar() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no deja grabar audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No has dado permiso al micrófono. Se pide en el candado de la barra de dirección.");
      return;
    }

    const mimeType = formatoBueno();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    trozosRef.current = [];
    tirarRef.current = false;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) trozosRef.current.push(e.data);
    };
    rec.onstop = () => {
      const tipo = rec.mimeType || mimeType || "audio/webm";
      const trozos = trozosRef.current;
      trozosRef.current = [];
      if (!tirarRef.current && trozos.length > 0) {
        const blob = new Blob(trozos, { type: tipo });
        const ext = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm";
        const sello = new Date()
          .toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          .replace(/[/:]/g, "-")
          .replace(/,?\s+/g, "_");
        onGrabado(new File([blob], `nota-de-voz_${sello}.${ext}`, { type: tipo }));
      }
      soltar();
    };

    recRef.current = rec;
    rec.start();
    setGrabando(true);
    setSegundos(0);
    relojRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  function parar(tirar: boolean) {
    tirarRef.current = tirar;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    else soltar();
  }

  if (grabando) {
    return (
      <div className="voz voz--grabando">
        <span className="voz__punto" aria-hidden />
        <span className="voz__reloj">{reloj(segundos)}</span>
        <button
          type="button"
          className="voz__btn voz__btn--tirar"
          onClick={() => parar(true)}
          title="Tirar la nota"
          aria-label="Tirar la nota"
        >
          ✕
        </button>
        <button
          type="button"
          className="voz__btn voz__btn--listo"
          onClick={() => parar(false)}
          title="Terminar la nota"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="composer__clip voz__mic"
        onClick={() => void empezar()}
        disabled={disabled}
        title="Grabar una nota de voz"
        aria-label="Grabar una nota de voz"
      >
        🎙
      </button>
      {error && <span className="voz__error">{error}</span>}
    </>
  );
}
