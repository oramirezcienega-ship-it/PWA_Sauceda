"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CerrarSesion } from "./CerrarSesion";
import { VERSION } from "@/lib/version";
import { rolUsuarioActual } from "@/app/actions/usuarios";
import { cerrarSesion } from "@/app/actions/auth";

/**
 * Estructura (chrome) del panel del admin: menú de navegación en una columna
 * lateral en escritorio y un cajón desplegable (☰) en móvil. Envuelve el
 * contenido de todas las páginas internas.
 *
 * En las rutas públicas (login y portal del cliente) no se muestra nada de
 * esto: solo se renderiza el contenido.
 */

const ENLACES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Expedientes" },
  { href: "/prospectos", label: "Prospectos" },
  { href: "/formularios", label: "Formularios" },
  { href: "/mensajes", label: "Mensajes" },
  { href: "/conversaciones", label: "Conversaciones" },
  { href: "/automatizaciones", label: "Automatizaciones" },
  { href: "/whatsapp", label: "WhatsApp" },
];

function esRutaPublica(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/seguimiento") ||
    path.startsWith("/privacidad")
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [esAdmin, setEsAdmin] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    rolUsuarioActual()
      .then((rol) => setEsAdmin(rol === "admin"))
      .catch(() => setEsAdmin(false));
  }, []);

  // Cierra el cajón al cambiar de ruta.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Monitorear inactividad del usuario (30 minutos)
  useEffect(() => {
    if (esRutaPublica(pathname)) return;

    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await cerrarSesion();
          window.location.href = "/login";
        } catch (error) {
          console.error("Error al cerrar sesión por inactividad:", error);
        }
      }, 30 * 60 * 1000); // 30 minutos de inactividad
    };

    const eventos = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];

    resetTimer();

    eventos.forEach((evento) => {
      window.addEventListener(evento, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timer);
      eventos.forEach((evento) => {
        window.removeEventListener(evento, resetTimer);
      });
    };
  }, [pathname]);

  if (esRutaPublica(pathname)) return <>{children}</>;

  const enlaces = esAdmin
    ? [...ENLACES, { href: "/usuarios", label: "Usuarios" }]
    : ENLACES;

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const marca = (
    <Link href="/" className="flex items-center gap-2 px-4 py-4 leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="SAUCEDA" className="h-9 w-9" />
      <span className="flex flex-col">
        <span className="font-display text-xl font-semibold tracking-tight text-crema">
          SAUCEDA
        </span>
        <span className="font-cuerpo text-[10px] uppercase tracking-[0.2em] text-dorado">
          Bienes Raíces
        </span>
      </span>
    </Link>
  );

  const navegacion = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {enlaces.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-md px-3 py-2 text-sm transition ${
            activo(l.href)
              ? "bg-crema/15 font-medium text-crema"
              : "text-crema/80 hover:bg-crema/10"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );

  const pie = (
    <div className="flex items-center justify-between gap-2 border-t border-crema/10 px-4 py-3">
      <span className="font-mono text-[11px] text-crema/50" title="Versión">
        v{VERSION}
      </span>
      <CerrarSesion />
    </div>
  );

  return (
    <div>
      {/* Columna lateral (escritorio) */}
      <aside className="hidden border-r border-dorado/30 bg-verde-profundo text-crema md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col">
        {marca}
        {navegacion}
        {pie}
      </aside>

      {/* Barra superior (móvil) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-dorado/30 bg-verde-profundo px-4 py-3 text-crema md:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 transition hover:bg-crema/10"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-2 leading-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SAUCEDA" className="h-7 w-7" />
          <span className="font-display text-lg font-semibold">SAUCEDA</span>
        </Link>
        <CerrarSesion />
      </header>

      {/* Cajón desplegable (móvil) */}
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-carbon/50"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col bg-verde-profundo text-crema shadow-xl">
            <div className="flex items-center justify-between">
              {marca}
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="mr-3 rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10"
              >
                ✕
              </button>
            </div>
            {navegacion}
            {pie}
          </aside>
        </div>
      )}

      {/* Contenido (con espacio a la izquierda para la columna en escritorio) */}
      <div className="md:pl-60">{children}</div>
    </div>
  );
}
