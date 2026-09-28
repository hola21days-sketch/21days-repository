import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // La hora en que se construyó esta versión. Se enseña en el pie del panel
    // izquierdo para poder distinguir «esto no está hecho» de «el navegador
    // todavía tiene la versión de antes».
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
