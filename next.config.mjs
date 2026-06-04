/** @type {import('next').NextConfig} */

// En desarrollo, React Refresh necesita 'unsafe-eval'; en producción NO.
const esDev = process.env.NODE_ENV !== "production";

// Política de seguridad de contenido (CSP) base y restrictiva.
// - Solo recursos propios ('self').
// - Supabase permitido en connect-src (auth/datos desde el navegador).
// - 'unsafe-inline' es necesario por los scripts/estilos en línea de Next 14;
//   se puede endurecer más adelante con nonces.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self'",
].join("; ");

// Cabeceras de seguridad aplicadas a TODAS las rutas.
const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Cabeceras de seguridad para todo el sitio.
        source: "/:path*",
        headers: cabecerasSeguridad,
      },
      {
        // El service worker se sirve como archivo estático desde /public.
        // Evitamos que se cachee de más.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
