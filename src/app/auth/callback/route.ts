import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Cierra el acceso por enlace de correo: cambia el código por una sesión. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const volverParam = searchParams.get("volver") ?? "/bitacora";
  const volver = volverParam.startsWith("/") ? volverParam : "/bitacora";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${volver}`);
  }

  return NextResponse.redirect(`${origin}/entrar?error=enlace-caducado`);
}
