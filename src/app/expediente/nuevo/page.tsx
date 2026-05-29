"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioExpediente } from "@/components/FormularioExpediente";
import { useExpedientes } from "@/context/expedientes-context";
import { listarProspectosMin } from "@/app/actions/prospectos";
import type { DatosExpediente } from "@/lib/types";

/**
 * Alta de un expediente nuevo: /expediente/nuevo
 * Acepta ?prospecto=PRO-001 para enlazarlo desde el detalle de un prospecto.
 */
export default function PaginaNuevo() {
  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver al tablero
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo expediente
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Da de alta un lead de traspaso INFONAVIT.
        </p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <Suspense
            fallback={<p className="text-sm text-carbon/50">Cargando…</p>}
          >
            <Formulario />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/** Contenido que depende de los parámetros de la URL (va dentro de Suspense). */
function Formulario() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { crearExpediente } = useExpedientes();
  const [prospectos, setProspectos] = useState<
    { id: string; nombre: string }[]
  >([]);

  const prospectoInicial = searchParams.get("prospecto");

  useEffect(() => {
    listarProspectosMin().then(setProspectos).catch(() => setProspectos([]));
  }, []);

  const valorInicial: DatosExpediente | undefined = prospectoInicial
    ? {
        cliente: "",
        fraccionamiento: "",
        etapa: "nuevo-lead",
        situacion: "",
        telefono: "",
        valorEstimado: 0,
        saldoDeuda: 0,
        notas: "",
        prospectoId: prospectoInicial,
      }
    : undefined;

  return (
    <FormularioExpediente
      valorInicial={valorInicial}
      prospectos={prospectos}
      textoBoton="Crear expediente"
      onCancelar={() => router.push("/")}
      onGuardar={async (datos) => {
        const id = await crearExpediente(datos);
        router.push(`/expediente/${id}`);
      }}
    />
  );
}
