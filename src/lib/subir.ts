import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Subida de archivos grandes al almacén, por partes y sin tocar el fichero.
 * ---------------------------------------------------------------------------
 * Una petición única aguanta bien los archivos pequeños, pero con un vídeo se
 * rompe en cuanto la red parpadea: se pierde todo y hay que empezar de cero.
 * Aquí el archivo va en trozos de 6 MB (el tamaño que pide Supabase), cada
 * trozo se reintenta solo y se sabe en todo momento por dónde va.
 *
 * El fichero se sube byte a byte tal cual está: nada de recomprimir ni de
 * recortar resolución. Un 4K se descarga idéntico a como se subió.
 */

/** Tamaño de trozo que exige el almacén: ni más ni menos. */
const TROZO = 6 * 1024 * 1024;

/** Por debajo de esto no compensa trocear: una sola petición es más rápida. */
const UMBRAL_TROZOS = 6 * 1024 * 1024;

/**
 * Tope por archivo del proyecto de Supabase. En el plan gratuito son 50 MB y
 * no se puede subir de ahí; en el plan Pro se sube hasta 500 GB desde el panel
 * (Storage → Settings → Global file size limit) y entonces basta con cambiar
 * NEXT_PUBLIC_MAX_UPLOAD_MB para que la app deje de frenar.
 */
export const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? "50") || 50;
export const MAX_BYTES = MAX_MB * 1024 * 1024;

export type Avance = {
  subido: number;
  total: number;
  /** De 0 a 1. */
  parte: number;
};

export class ErrorDeSubida extends Error {
  constructor(
    message: string,
    /** true si el archivo no cabe por el tope del proyecto. */
    readonly porTamaño = false,
  ) {
    super(message);
    this.name = "ErrorDeSubida";
  }
}

/** ¿La respuesta del almacén se queja del tamaño? */
function esPorTamaño(texto: string): boolean {
  return /413|exceeded the maximum allowed size|payload too large|entity too large/i.test(texto);
}

function pesa(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Sube un archivo al bucket `adjuntos` y va contando por dónde va.
 * Lanza `ErrorDeSubida` con un motivo en castellano si algo falla.
 */
export async function subirArchivo(
  bucket: string,
  path: string,
  file: File,
  onAvance?: (a: Avance) => void,
): Promise<void> {
  if (file.size === 0) {
    throw new ErrorDeSubida("El archivo está vacío (0 bytes).");
  }
  if (file.size > MAX_BYTES) {
    throw new ErrorDeSubida(
      `pesa ${pesa(file.size)} y el tope por archivo son ${MAX_MB} MB`,
      true,
    );
  }

  const supabase = createClient();
  const tipo = file.type || "application/octet-stream";

  // Archivo pequeño: una sola petición y listo.
  if (file.size <= UMBRAL_TROZOS) {
    onAvance?.({ subido: 0, total: file.size, parte: 0 });
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: tipo,
      upsert: false,
    });
    if (error) {
      throw new ErrorDeSubida(error.message, esPorTamaño(error.message));
    }
    onAvance?.({ subido: file.size, total: file.size, parte: 1 });
    return;
  }

  // El cliente de subida por partes solo se descarga cuando hace falta.
  const tus = await import("tus-js-client");

  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) {
    throw new ErrorDeSubida("Se ha cerrado la sesión. Vuelve a entrar y reinténtalo.");
  }

  await new Promise<void>((listo, falla) => {
    const subida = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 6000, 12000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      // Sin esto, dos archivos con el mismo nombre se pisarían al reanudar.
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: tipo,
        cacheControl: "3600",
      },
      chunkSize: TROZO,
      onError(error) {
        const detalle =
          error instanceof tus.DetailedError
            ? `${error.originalResponse?.getStatus() ?? ""} ${error.originalResponse?.getBody() ?? ""}`
            : error.message;
        if (esPorTamaño(detalle)) {
          falla(
            new ErrorDeSubida(
              `pesa ${pesa(file.size)} y el proyecto no admite archivos tan grandes`,
              true,
            ),
          );
          return;
        }
        falla(new ErrorDeSubida(detalle.trim() || "se ha cortado la subida"));
      },
      onProgress(subido, total) {
        onAvance?.({ subido, total, parte: total > 0 ? subido / total : 0 });
      },
      onSuccess() {
        listo();
      },
    });

    // Si quedó una subida a medias del mismo archivo, se retoma por donde iba.
    void subida.findPreviousUploads().then((previas) => {
      if (previas.length > 0) subida.resumeFromPreviousUpload(previas[0]);
      subida.start();
    });
  });
}

export { pesa };
