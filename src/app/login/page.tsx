"use client";

import { useEffect, useState } from "react";
import { iniciarSesion } from "@/app/actions/auth";
import { obtenerDesafioLogin, verificarFirmaYIniciarSesion } from "@/app/actions/biometricos";
import { esBiometriaSoportada, hexToBuffer, base64urlToBuffer, bufferToBase64 } from "@/lib/biometrics-client";

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

  const [biometriaActiva, setBiometriaActiva] = useState(false);
  const [emailBiometrico, setEmailBiometrico] = useState("");
  const [cargandoBiometrico, setCargandoBiometrico] = useState(false);

  useEffect(() => {
    async function checkBiometria() {
      const isSop = await esBiometriaSoportada();
      const activa = localStorage.getItem("biometria_activa") === "true";
      const email = localStorage.getItem("email_biometrico");
      if (isSop && activa && email) {
        setBiometriaActiva(true);
        setEmailBiometrico(email);
      }
    }
    checkBiometria();
  }, []);

  async function iniciarConBiometria() {
    if (!emailBiometrico) return;
    setError(null);
    setCargandoBiometrico(true);
    try {
      if (!navigator.credentials || !navigator.credentials.get) {
        throw new Error("Tu navegador actual no es compatible con el inicio de sesión biométrico. Por favor abre la app en Safari o Chrome.");
      }
      const resDesafio = await obtenerDesafioLogin(emailBiometrico);
      if (!resDesafio.ok || !resDesafio.challenge || !resDesafio.allowedCredentialIds) {
        throw new Error(resDesafio.error || "No se pudo obtener el desafío biométrico.");
      }

      const challengeBuffer = hexToBuffer(resDesafio.challenge);
      const options: CredentialRequestOptions = {
        publicKey: {
          challenge: challengeBuffer,
          allowCredentials: resDesafio.allowedCredentialIds.map((id) => ({
            type: "public-key",
            id: base64urlToBuffer(id),
          })),
          userVerification: "required",
          timeout: 60000,
        },
      };

      const assertion = (await navigator.credentials.get(options)) as PublicKeyCredential;
      if (!assertion) {
        throw new Error("Inicio de sesión biométrico cancelado o fallido.");
      }

      const response = assertion.response as AuthenticatorAssertionResponse;
      const credentialId = assertion.id;
      const clientDataJSONBase64 = bufferToBase64(response.clientDataJSON);
      const authenticatorDataBase64 = bufferToBase64(response.authenticatorData);
      const signatureBase64 = bufferToBase64(response.signature);

      const resLogin = await verificarFirmaYIniciarSesion(
        emailBiometrico,
        credentialId,
        clientDataJSONBase64,
        authenticatorDataBase64,
        signatureBase64
      );

      if (!resLogin.ok) {
        throw new Error(resLogin.error || "Fallo al validar biométricos.");
      }

      window.location.assign("/");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al iniciar sesión con biométricos.");
      setCargandoBiometrico(false);
    }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      const r = await iniciarSesion(correo, password);
      if (!r || !r.ok) {
        setError(r?.error || "Correo o contraseña incorrectos.");
        setEntrando(false);
        return;
      }
      // Redirección adaptativa según el rol devuelto por el servidor
      const destino = (r.rol === "asesor" || r.rol === "operaciones") ? "/dashboard" : "/";
      window.location.assign(destino);
    } catch (err: any) {
      console.error("Error al iniciar sesión:", err);
      setError(err?.message || "Error inesperado al conectar con el servidor.");
      setEntrando(false);
    }
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
            disabled={entrando || cargandoBiometrico}
            className="w-full rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
          >
            {entrando ? "Entrando…" : "Entrar"}
          </button>

          {biometriaActiva && (
            <button
              type="button"
              disabled={entrando || cargandoBiometrico}
              onClick={iniciarConBiometria}
              className="w-full flex items-center justify-center gap-2 rounded-md border border-sauce/30 bg-sauce/5 px-4 py-2.5 text-sm font-medium text-sauce transition hover:bg-sauce/10 disabled:opacity-60"
            >
              <svg className="h-5 w-5 text-sauce shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a4.978 4.978 0 003-9m-3 9h1.82m0 0a2 2 0 001.683-1L12 15h.318M12 15h5.182M12 15L8.744 8.744A9 9 0 1121 12c0 1.258-.208 2.468-.592 3.6m-3.44 2.04l-.054-.09A13.912 13.912 0 0015 11" />
              </svg>
              {cargandoBiometrico ? "Verificando..." : `Ingresar con Huella / FaceID`}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
