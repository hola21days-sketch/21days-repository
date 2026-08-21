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
 * De las dos claves públicas del proyecto usamos la moderna
 * (`sb_publishable_…`), que es la que Supabase recomienda porque se puede
 * rotar por su cuenta. La antigua (`anon`, un JWT) sigue valiendo: si está
 * puesta en el entorno y no hay clave publishable, se usa esa.
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
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_dVTJXqQeZ1NOckh7jSvT2g_YMKohENu";
