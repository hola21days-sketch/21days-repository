import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.company,
  description: `${BRAND.tagline} de ${BRAND.company}: tablero, chat interno y seguimiento de encargos, cliente a cliente.`,
  // Con esto, «Añadir a pantalla de inicio» en el móvil deja un icono como el
  // de cualquier app y se abre a pantalla completa, sin la barra del navegador.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bitácora", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icono-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f1" },
    { media: "(prefers-color-scheme: dark)", color: "#12181a" },
  ],
};

/** Aplica el tema guardado antes del primer pintado, para que no parpadee. */
const THEME_INIT = `try{var t=localStorage.getItem("bitacora-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
