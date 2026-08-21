/**
 * Dónde vive la base de datos.
 * ---------------------------------------------------------------------------
 * Los valores por defecto son los del proyecto de DecaSight. NO son secretos:
 * en Next.js toda variable NEXT_PUBLIC_* acaba dentro del JavaScript que se
 * envía al navegador, así que cualquiera que visite la web puede leerlos de
 * todas formas. Supabase los publica con ese propósito — quien protege los
 * datos son las políticas RLS, no la clave. El único valor secreto es la clave
 * `service_role`, que esta aplicación no usa en ningún sitio.
 *
 * Las variables de entorno mandan sobre los valores de aquí, así que se pueden
 * rotar desde Vercel (Project Settings > Environment Variables) o apuntar a
 * otro proyecto en local sin tocar el código. Los valores por defecto están
 * para que un despliegue nunca arranque sin saber a dónde conectarse.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://bbxyvhcolypgvxtfsyvy.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJieHl2aGNvbHlwZ3Z4dGZzeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMTE1NDMsImV4cCI6MjEwMjg4NzU0M30.YTQu3u9HSrSzeHDCeniyV23hH00HDoy9KDggPgfp9Xw";
