"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatSize } from "@/lib/format";

/**
 * Lo que hace falta para enseñar un archivo, venga del chat de un cliente o de
 * un mensaje directo. Son tablas distintas, pero lo que se pinta es lo mismo.
 */
export type ArchivoVisible = {
  id: string;
  path: string;
  name: string;
  mime: string;
  size_bytes: number;
};

type Props = {
  att: ArchivoVisible;
  /** De dónde sale: del chat de un cliente o de un mensaje directo. */
  fuente?: "canal" | "dm";
};

type Transcripcion = {
  status: "pendiente" | "listo" | "error";
  text: string | null;
  translation: string | null;
  language: string | null;
  error: string | null;
};

/** Las velocidades de siempre. Más de 2x ya no se entiende nada. */
const VELOCIDADES = [1, 1.25, 1.5, 2];

/** Los enlaces firmados caducan; se piden de hora en hora, con margen. */
const VIGENCIA = 3600;

function esImagen(mime: string) {
  return mime.startsWith("image/");
}
function esVideo(mime: string) {
  return mime.startsWith("video/");
}
function esAudio(mime: string) {
  return mime.startsWith("audio/");
}

/**
 * Un archivo del chat, enseñado como se merece.
 * ---------------------------------------------------------------------------
 * Antes todo era una fila gris con el nombre del fichero, hubiese dentro una
 * captura, un montaje o una hoja de cálculo. Para trabajar así no vale: media
 * conversación de la agencia son imágenes y vídeos que hay que mirar, no
 * descargar.
 *
 * Ahora una imagen se ve grande y se abre a tamaño completo al pulsarla, un
 * vídeo se reproduce en el propio chat, y una nota de voz sale con su barra de
 * reproducción. Lo demás sigue siendo una tarjeta con su nombre y su tamaño,
 * que para un Excel es lo único que hace falta.
 *
 * El bucket es privado, así que no hay direcciones fijas: cada archivo pide su
 * enlace firmado al mostrarse.
 */
export default function Adjunto({ att, fuente = "canal" }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [trans, setTrans] = useState<Transcripcion | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);

  const visual = esImagen(att.mime) || esVideo(att.mime) || esAudio(att.mime);

  useEffect(() => {
    if (!visual) return;
    let vigente = true;
    void (async () => {
      const { data, error } = await supabase.storage
        .from("adjuntos")
        .createSignedUrl(att.path, VIGENCIA);
      if (!vigente) return;
      if (error || !data) setFallo(true);
      else setUrl(data.signedUrl);
    })();
    return () => {
      vigente = false;
    };
  }, [supabase, att.path, visual]);

  /** La velocidad se aplica al reproductor en cuanto cambia o se carga. */
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = velocidad;
  }, [velocidad, url]);

  const conVoz = esVideo(att.mime) || esAudio(att.mime);

  /** Si ya se transcribió alguna vez, se enseña sin volver a pedirla. */
  const leerTranscripcion = useCallback(async () => {
    const { data } = await supabase
      .from("transcripts")
      .select("status, text, translation, language, error")
      .eq("attachment_id", att.id)
      .maybeSingle();
    if (data) setTrans(data as Transcripcion);
  }, [supabase, att.id]);

  useEffect(() => {
    if (conVoz) void leerTranscripcion();
  }, [conVoz, leerTranscripcion]);

  async function transcribir() {
    setPidiendo(true);
    setTrans({ status: "pendiente", text: null, translation: null, language: null, error: null });
    await supabase.functions.invoke("transcribir", {
      body: { attachment_id: att.id, source: fuente },
    });
    await leerTranscripcion();
    setPidiendo(false);
  }

  /** Los botones de x1 · x1,5 · x2, que se usan igual en audio y en vídeo. */
  function mandos() {
    return (
      <div className="vel">
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            className={velocidad === v ? "vel__op is-on" : "vel__op"}
            onClick={() => setVelocidad(v)}
            title={`Reproducir a ${String(v).replace(".", ",")} veces la velocidad`}
          >
            ×{String(v).replace(".", ",")}
          </button>
        ))}
      </div>
    );
  }

  /** El bloque de transcribir, debajo de un audio o un vídeo. */
  function transcripcion() {
    return (
      <div className="transcripcion">
        {(!trans || trans.status === "error") && (
          <button
            type="button"
            className="btn btn--ghost transcripcion__pedir"
            onClick={() => void transcribir()}
            disabled={pidiendo}
          >
            {pidiendo ? "Escuchando…" : "Transcribir audio"}
          </button>
        )}
        {trans?.status === "error" && <p className="transcripcion__error">{trans.error}</p>}
        {trans?.status === "pendiente" && <p className="transcripcion__meta">En marcha…</p>}
        {trans?.status === "listo" && (
          <div className="transcripcion__texto">
            <p className="transcripcion__meta">
              Transcripción{trans.language ? ` · ${trans.language}` : ""}
            </p>
            <p>{trans.text}</p>
            {trans.translation && (
              <>
                <p className="transcripcion__meta">Traducción al castellano</p>
                <p>{trans.translation}</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  /** Descargar siempre va aparte: enlace propio, con el nombre bueno. */
  async function descargar() {
    const { data, error } = await supabase.storage
      .from("adjuntos")
      .createSignedUrl(att.path, VIGENCIA, { download: att.name });
    if (error || !data) {
      alert("No se ha podido abrir el archivo. Vuelve a intentarlo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  // --------------------------------------------------------------- imagen
  if (esImagen(att.mime) && !fallo) {
    return (
      <>
        <figure className="adj adj--imagen">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={att.name}
              className="adj__img"
              onClick={() => setAmpliada(true)}
              loading="lazy"
            />
          ) : (
            <div className="adj__cargando">Cargando imagen…</div>
          )}
          <figcaption className="adj__pie">
            <span className="adj__nombre">{att.name}</span>
            <span className="adj__meta">{formatSize(att.size_bytes)}</span>
            <button type="button" className="adj__accion" onClick={() => void descargar()}>
              Descargar
            </button>
          </figcaption>
        </figure>

        {ampliada && url && (
          <div className="lupa" role="dialog" onClick={() => setAmpliada(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={att.name} className="lupa__img" />
            <button type="button" className="lupa__cerrar" aria-label="Cerrar">
              ✕
            </button>
          </div>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- vídeo
  if (esVideo(att.mime) && !fallo) {
    return (
      <figure className="adj adj--video">
        {url ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            className="adj__video"
            src={url}
            controls
            preload="metadata"
          />
        ) : (
          <div className="adj__cargando">Cargando vídeo…</div>
        )}
        <figcaption className="adj__pie">
          <span className="adj__nombre">{att.name}</span>
          <span className="adj__meta">{formatSize(att.size_bytes)} · original, sin recomprimir</span>
          {mandos()}
          <button type="button" className="adj__accion" onClick={() => void descargar()}>
            Descargar
          </button>
        </figcaption>
        {transcripcion()}
      </figure>
    );
  }

  // ----------------------------------------------------------- nota de voz
  if (esAudio(att.mime) && !fallo) {
    const esNota = att.name.startsWith("nota-de-voz");
    return (
      <div className={esNota ? "adj adj--voz is-nota" : "adj adj--voz"}>
        <div className="adj__voz-fila">
          <span className="adj__voz-icono">{esNota ? "🎙" : "♪"}</span>
          {url ? (
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              className="adj__audio"
              src={url}
              controls
              preload="metadata"
            />
          ) : (
            <div className="adj__cargando">Cargando audio…</div>
          )}
          {mandos()}
          <button type="button" className="adj__accion" onClick={() => void descargar()}>
            Descargar
          </button>
        </div>
        {transcripcion()}
      </div>
    );
  }

  // ----------------------------------------------- lo demás: ficha del archivo
  return (
    <button type="button" className="file" onClick={() => void descargar()}>
      <span className="file__icon">▤</span>
      <span className="file__body">
        <span className="file__name">{att.name}</span>
        <span className="file__meta">{formatSize(att.size_bytes)} · original, sin recomprimir</span>
      </span>
      <span className="file__down">Descargar</span>
    </button>
  );
}
