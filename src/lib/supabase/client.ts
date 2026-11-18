"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Cliente de Supabase para el navegador.
 * ---------------------------------------------------------------------------
 * Uno solo para toda la pestaña, a propósito. Cada componente llama a
 * createClient() por su cuenta y antes eso abría un cliente nuevo cada vez, o
 * sea una conexión de tiempo real por componente: más sockets, más sitios
 * donde algo puede quedarse sin autenticar y más formas de que un mensaje no
 * llegue. Compartiendo uno, la sesión se aplica una vez y vale para todos.
 */
let cliente: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!cliente) {
    cliente = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // El tiempo real va por un socket aparte que necesita el testigo de la
    // sesión: sin él, las políticas de la base de datos no ven quién escucha y
    // no mandan nada. Se pone al arrancar y en cada cambio de sesión.
    void cliente.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) cliente?.realtime.setAuth(data.session.access_token);
    });
    cliente.auth.onAuthStateChange((evento, sesion) => {
      if (sesion?.access_token) cliente?.realtime.setAuth(sesion.access_token);
      // Si la sesión se pierde (se pulsó Salir en otro aparato, que cierra
      // todas, o caducó y ya no se puede renovar), a la pantalla de entrar.
      // Antes la página se quedaba abierta pero vacía: todo lo que pedía le
      // llegaba rechazado y parecía que la aplicación no iba.
      if (evento === "SIGNED_OUT" && typeof window !== "undefined") {
        const ruta = window.location.pathname;
        if (!ruta.startsWith("/entrar") && !ruta.startsWith("/auth")) {
          window.location.assign("/entrar?motivo=sesion");
        }
      }
    });
  }
  return cliente;
}
