"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { crearUsuario } from "@/app/actions/usuarios";

/** Alta de un usuario del equipo: /usuarios/nuevo */
export default function PaginaNuevoUsuario() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rol, setRol] = useState<"admin" | "asesor" | "operaciones">("asesor");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError("Correo válido y contraseña de al menos 6 caracteres.");
      return;
    }
    setError(null);
    setGuardando(true);
    const res = await crearUsuario({ email, password, nombre, rol, telefono });
    if (!res.ok) {
      setError(res.mensaje ?? "No se pudo crear el usuario.");
      setGuardando(false);
      return;
    }
    router.push("/usuarios");
  }

  const INPUT =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-md px-4 py-6">
        <Link
          href="/usuarios"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a usuarios
        </Link>
        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo usuario
        </h1>

        <form
          onSubmit={enviar}
          className="mt-6 space-y-4 rounded-xl border border-carbon/10 bg-white p-5"
        >
          {error && (
            <p className="rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
              {error}
            </p>
          )}
          <Campo etiqueta="Nombre">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del asesor"
              className={INPUT}
            />
          </Campo>
          <Campo etiqueta="Correo" requerido>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor@correo.com"
              className={INPUT}
            />
          </Campo>
          <Campo etiqueta="Contraseña" requerido>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className={`${INPUT} font-mono`}
            />
          </Campo>
          <Campo etiqueta="Teléfono / WhatsApp">
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="524771234567"
              className={INPUT}
            />
          </Campo>
          <Campo etiqueta="Rol">
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as "admin" | "asesor" | "operaciones")}
              className={INPUT}
            >
              <option value="asesor">Asesor (opera, sin gestión de usuarios)</option>
              <option value="operaciones">Operario (opera construcción/inspecciones)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </Campo>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/usuarios")}
              disabled={guardando}
              className="flex-1 rounded-md border border-carbon/15 bg-white px-4 py-2.5 text-sm text-carbon/70"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
            >
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Campo({
  etiqueta,
  requerido,
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rojo">*</span>}
      </span>
      {children}
    </label>
  );
}
