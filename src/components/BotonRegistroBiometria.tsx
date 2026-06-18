"use client";

import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";
import { obtenerDesafioRegistro, registrarBiometria } from "@/app/actions/biometricos";
import { esBiometriaSoportada, hexToBuffer, bufferToBase64 } from "@/lib/biometrics-client";

export function BotonRegistroBiometria() {
  const [soportado, setSoportado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    async function checkSoporte() {
      const isSop = await esBiometriaSoportada();
      setSoportado(isSop);
      
      if (isSop && typeof window !== "undefined") {
        const email = localStorage.getItem("email_biometrico");
        if (email) {
          setRegistrado(true);
        }
      }
    }
    checkSoporte();
  }, []);

  if (!soportado) return null;

  async function handleActivar() {
    setCargando(true);
    setMensaje(null);
    try {
      const sb = supabaseNavegador();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || !user.email) {
        throw new Error("Debes iniciar sesión primero.");
      }

      // 1. Obtener desafío del servidor
      const challengeHex = await obtenerDesafioRegistro();
      const challengeBuffer = hexToBuffer(challengeHex);

      // 2. Solicitar creación de credenciales al hardware del dispositivo
      const options: CredentialCreationOptions = {
        publicKey: {
          challenge: challengeBuffer,
          rp: {
            name: "SAUCEDA Bienes Raíces",
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(user.id),
            name: user.email,
            displayName: user.email,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      };

      const credential = (await navigator.credentials.create(options)) as PublicKeyCredential;
      if (!credential) {
        throw new Error("La creación del biométrico fue cancelada o falló.");
      }

      // 3. Obtener llave pública DER SPKI
      // @ts-ignore
      const publicKeyDerBuffer = credential.getPublicKey();
      if (!publicKeyDerBuffer) {
        throw new Error("Este dispositivo no soporta exportación estándar de llaves públicas.");
      }

      const credentialId = credential.id;
      const publicKeyBase64 = bufferToBase64(publicKeyDerBuffer);

      // 4. Enviar llave pública y credencial al servidor para almacenar
      const res = await registrarBiometria(
        navigator.userAgent || "Dispositivo Móvil",
        credentialId,
        publicKeyBase64,
        challengeHex
      );

      if (!res.ok) {
        throw new Error(res.error || "Fallo al guardar biométrico.");
      }

      // Guardar bandera en localStorage para recordar en el Login
      localStorage.setItem("biometria_activa", "true");
      localStorage.setItem("email_biometrico", user.email);
      setRegistrado(true);
      setMensaje("¡Biometría activada con éxito!");
      setTimeout(() => setMensaje(null), 3000);
    } catch (err: any) {
      console.error(err);
      setMensaje(err.message || "Error al configurar biométricos.");
    } finally {
      setCargando(false);
    }
  }

  async function handleDesactivar() {
    if (confirm("¿Deseas desactivar el inicio de sesión biométrico en este dispositivo?")) {
      localStorage.removeItem("biometria_activa");
      localStorage.removeItem("email_biometrico");
      setRegistrado(false);
      setMensaje("Biometría desactivada de este navegador.");
      setTimeout(() => setMensaje(null), 3000);
    }
  }

  return (
    <div className="w-full text-[11px]">
      {registrado ? (
        <button
          onClick={handleDesactivar}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-crema/80 hover:bg-crema/10 hover:text-crema transition w-full text-left font-medium"
        >
          <svg className="h-4 w-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="truncate">Biometría Activa (Quitar)</span>
        </button>
      ) : (
        <button
          onClick={handleActivar}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-crema/70 hover:bg-crema/10 hover:text-crema transition w-full text-left font-medium"
        >
          <svg className="h-4 w-4 text-[#C9A961] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a4.978 4.978 0 003-9m-3 9h1.82m0 0a2 2 0 001.683-1L12 15h.318M12 15h5.182M12 15L8.744 8.744A9 9 0 1121 12c0 1.258-.208 2.468-.592 3.6m-3.44 2.04l-.054-.09A13.912 13.912 0 0015 11" />
          </svg>
          <span className="truncate">{cargando ? "Configurando..." : "Activar Huella / FaceID"}</span>
        </button>
      )}
      {mensaje && (
        <div className="px-3 py-1 text-[9px] text-[#C9A961] italic leading-tight truncate animate-fadeIn">
          {mensaje}
        </div>
      )}
    </div>
  );
}
