"use client";

import { useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";

/**
 * Acceso del equipo de SAUCEDA al panel de operación.
 * Login con correo y contraseña (Supabase Auth). Los usuarios se crean
 * desde el panel de Supabase (no hay registro público).
 */
export default function PaginaLogin() {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    const sb = supabaseNavegador();
    const { error } = await sb.auth.signInWithPassword({
      email: correo.trim(),
      password,
    });
    if (error) {
      setError("Correo o contraseña incorrectos.");
      setEntrando(false);
      return;
    }
    // Recarga completa para que el panel cargue ya con la sesión activa
    // (evita tener que dar F5 tras iniciar sesión).
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-crema px-5">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SAUCEDA" className="mx-auto mb-3 h-16 w-16" />
          <p className="font-display text-3xl font-semibold tracking-tight text-verde-profundo">
            SAUCEDA
          </p>
          <p className="font-cuerpo text-[11px] uppercase tracking-[0.2em] text-dorado">
            Bienes Raíces
          </p>
          <p className="mt-2 font-titular text-sm italic text-carbon/60">
            Tradición con tecnología.
          </p>
        </div>

        <form
          onSubmit={entrar}
          className="space-y-4 rounded-2xl border border-carbon/10 bg-white p-6 shadow-sm"
        >
          <h1 className="font-titular text-xl font-semibold text-verde-profundo">
            Acceso al panel
          </h1>

          {error && (
            <p className="rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
              {error}
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
              Correo
            </span>
            <input
              type="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
              Contraseña
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
            />
          </label>

          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
          >
            {entrando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
