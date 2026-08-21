import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.product} · ${BRAND.company}`,
  description: `${BRAND.tagline} de ${BRAND.company}: tablero, chat interno y seguimiento de encargos, cliente a cliente.`,
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
