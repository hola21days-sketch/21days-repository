import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Transcribe un adjunto de vídeo o audio del chat y lo traduce al castellano.
 * ---------------------------------------------------------------------------
 * Se llama con { attachment_id }. Descarga el fichero del bucket privado, lo
 * pasa por el reconocimiento de voz de OpenAI (detecta el idioma solo, sea el
 * que sea), traduce el resultado y lo guarda en la tabla `transcripts`.
 *
 * Hace falta la clave OPENAI_API_KEY en los secretos del proyecto:
 *   Supabase → Edge Functions → Secrets → OPENAI_API_KEY
 * Sin ella la función responde con un aviso claro en vez de fallar en seco.
 */

const LIMITE_BYTES = 25 * 1024 * 1024; // lo que acepta la API de audio

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let attachmentId = "";
  // De dónde sale el archivo: del chat de un cliente o de un mensaje directo.
  // Son tablas distintas y el mensaje directo no tiene cliente.
  let fuente = "canal";
  try {
    const body = await req.json();
    attachmentId = String(body.attachment_id ?? "");
    if (body.source === "dm") fuente = "dm";
  } catch {
    return new Response(JSON.stringify({ error: "Falta attachment_id." }), {
      status: 400,
      headers: cors,
    });
  }

  const { data: adjunto } = await supabase
    .from(fuente === "dm" ? "dm_attachments" : "message_attachments")
    .select("*")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!adjunto) {
    return new Response(JSON.stringify({ error: "Ese archivo ya no existe." }), {
      status: 404,
      headers: cors,
    });
  }

  /** Deja constancia del intento, para que la app pueda enseñar el estado. */
  async function guardar(campos: Record<string, unknown>) {
    await supabase.from("transcripts").upsert(
      {
        attachment_id: adjunto.id,
        client_id: adjunto.client_id ?? null,
        source: fuente,
        ...campos,
      },
      { onConflict: "attachment_id" },
    );
  }

  const clave = Deno.env.get("OPENAI_API_KEY");
  if (!clave) {
    await guardar({
      status: "error",
      error:
        "Falta la clave de transcripción. Un administrador tiene que añadir OPENAI_API_KEY en Supabase → Edge Functions → Secrets.",
    });
    return new Response(JSON.stringify({ error: "Falta OPENAI_API_KEY." }), {
      status: 400,
      headers: cors,
    });
  }

  if (adjunto.size_bytes > LIMITE_BYTES) {
    await guardar({
      status: "error",
      error: `El archivo pesa ${(adjunto.size_bytes / 1048576).toFixed(0)} MB y el servicio de transcripción admite hasta 25 MB. Sube una versión ligera o solo el audio.`,
    });
    return new Response(JSON.stringify({ error: "Archivo demasiado grande." }), {
      status: 400,
      headers: cors,
    });
  }

  await guardar({ status: "pendiente", error: "" });

  const { data: fichero, error: bajada } = await supabase.storage
    .from("adjuntos")
    .download(adjunto.path);

  if (bajada || !fichero) {
    await guardar({ status: "error", error: "No se ha podido leer el archivo del almacén." });
    return new Response(JSON.stringify({ error: "No se ha podido leer el archivo." }), {
      status: 500,
      headers: cors,
    });
  }

  // ------------------------------------------------------------ transcribir
  const formulario = new FormData();
  formulario.append("file", fichero, adjunto.name);
  formulario.append("model", "whisper-1");
  formulario.append("response_format", "verbose_json");

  const respuesta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}` },
    body: formulario,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    await guardar({ status: "error", error: `El servicio de transcripción ha fallado: ${detalle.slice(0, 300)}` });
    return new Response(JSON.stringify({ error: "Fallo al transcribir." }), {
      status: 502,
      headers: cors,
    });
  }

  const resultado = await respuesta.json();
  const texto: string = resultado.text ?? "";
  const idioma: string = resultado.language ?? "";

  // -------------------------------------------------------------- traducir
  let traduccion = "";
  if (texto.trim() && !/^(spanish|es|castellano)$/i.test(idioma)) {
    const trad = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Traduce al castellano lo que te manden. Devuelve solo la traducción, sin comentarios ni comillas, respetando los saltos de línea.",
          },
          { role: "user", content: texto },
        ],
      }),
    });
    if (trad.ok) {
      const datos = await trad.json();
      traduccion = datos.choices?.[0]?.message?.content ?? "";
    }
  }

  await guardar({
    status: "listo",
    language: idioma,
    text: texto,
    translation: traduccion,
    error: "",
  });

  return new Response(JSON.stringify({ ok: true, language: idioma, text: texto, translation: traduccion }), {
    headers: cors,
  });
});
