import Link from "next/link";
import { CerrarSesion } from "./CerrarSesion";

/**
 * Encabezado de marca SAUCEDA (panel del admin).
 * Logo en Fraunces (display) + tagline + cerrar sesión.
 * Verde como color dominante del 30%.
 */
export function Encabezado() {
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
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-crema/90 transition hover:bg-crema/10"
            >
              Expedientes
            </Link>
            <Link
              href="/prospectos"
              className="rounded-md px-3 py-1.5 text-sm text-crema/90 transition hover:bg-crema/10"
            >
              Prospectos
            </Link>
            <Link
              href="/formularios"
              className="rounded-md px-3 py-1.5 text-sm text-crema/90 transition hover:bg-crema/10"
            >
              Formularios
            </Link>
          </nav>
        </div>
        <CerrarSesion />
      </div>
    </header>
  );
}
