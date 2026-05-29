"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CerrarSesion } from "./CerrarSesion";
import { VERSION } from "@/lib/version";
import { rolUsuarioActual } from "@/app/actions/usuarios";

/**
 * Encabezado de marca SAUCEDA (panel del admin).
 * Logo + navegación + versión + cerrar sesión.
 * El enlace "Usuarios" solo se muestra a administradores.
 */
export function Encabezado() {
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    rolUsuarioActual()
      .then((rol) => setEsAdmin(rol === "admin"))
      .catch(() => setEsAdmin(false));
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-dorado/30 bg-verde-profundo text-crema">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="SAUCEDA" className="h-9 w-9" />
            <span className="flex flex-col">
              <span className="font-display text-2xl font-semibold tracking-tight">
                SAUCEDA
              </span>
              <span className="font-cuerpo text-[11px] uppercase tracking-[0.2em] text-dorado">
                Bienes Raíces
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Enlace href="/">Expedientes</Enlace>
            <Enlace href="/prospectos">Prospectos</Enlace>
            <Enlace href="/formularios">Formularios</Enlace>
            <Enlace href="/mensajes">Mensajes</Enlace>
            {esAdmin && <Enlace href="/usuarios">Usuarios</Enlace>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] text-crema/50"
            title="Versión de la app"
          >
            v{VERSION}
          </span>
          <CerrarSesion />
        </div>
      </div>
    </header>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm text-crema/90 transition hover:bg-crema/10"
    >
      {children}
    </Link>
  );
}
