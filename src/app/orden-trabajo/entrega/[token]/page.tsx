import { notFound } from "next/navigation";
import { obtenerEntregaOrdenTrabajoPorToken } from "@/app/actions/ordenes-trabajo";
import { MARCA } from "@/lib/marca";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PaginaEntregaProps {
  params: {
    token: string;
  };
}

export default async function PaginaEntregaCliente({ params }: PaginaEntregaProps) {
  const { token } = params;
  const res = await obtenerEntregaOrdenTrabajoPorToken(token);

  if (!res.ok || !res.orden) {
    notFound();
  }

  const { orden, recibos, garantia, remisionFactura } = res;
  const fechaConcluida = orden.fechaConclusion
    ? new Date(orden.fechaConclusion).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

  const totalRecibos = (recibos || []).reduce((acc, r) => acc + r.monto, 0);
  const totalCotizado = orden.totalCotizado || 0;
  const saldoPendiente = Math.max(0, totalCotizado - totalRecibos);

  const fotosEntrega = (orden.fotosEvidencia || []).filter(
    (f) => f.etapa === "entrega" || !f.etapa
  );
  const fotosProceso = (orden.fotosEvidencia || []).filter(
    (f) => f.etapa === "proceso"
  );
  const fotosInicio = (orden.fotosEvidencia || []).filter(
    (f) => f.etapa === "inicio"
  );

  return (
    <main className="min-h-screen bg-slate-100/60 pb-16 pt-6 font-cuerpo antialiased text-carbon print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl px-4">
        {/* Barra superior de acción e impresión */}
        <div className="mb-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-carbon/60 uppercase tracking-wider font-titular">
              Portal Oficial de Entrega de Obra & Servicios
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(
                `Hola, tengo una consulta sobre mi orden de trabajo ${orden.folio} (${orden.titulo}).`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-2xs"
            >
              <span>📲 Contactar Asesor</span>
            </a>
          </div>
        </div>

        {/* Tarjeta Documental Principal */}
        <div className="rounded-3xl border border-carbon/10 bg-white p-6 sm:p-10 shadow-xl print:border-none print:shadow-none">
          {/* Encabezado Corporativo */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-carbon/10 pb-8">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="h-16 w-16 rounded-2xl bg-verde-profundo text-white flex items-center justify-center font-bold text-2xl shadow-sm">
                S
              </div>
              <div>
                <h1 className="font-titular text-2xl font-bold tracking-tight text-verde-profundo">
                  SAUCEDA
                </h1>
                <p className="text-[11px] font-bold tracking-widest uppercase text-sauce">
                  Construcción & Bienes Raíces
                </p>
                <p className="text-xs text-carbon/60 mt-0.5">
                  Reporte Digital de Entrega de Trabajos
                </p>
              </div>
            </div>

            <div className="text-center sm:text-right">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1 text-xs font-bold shadow-2xs mb-1.5">
                <span>✓</span>
                <span className="capitalize">{orden.estatus === "completada" ? "Trabajo Concluido y Entregado" : orden.estatus.replace("_", " ")}</span>
              </div>
              <p className="font-mono text-xs font-bold text-carbon/80">
                Folio: <span className="text-sauce">{orden.folio}</span>
              </p>
              <p className="text-[11px] text-carbon/50">
                Fecha de Entrega: {fechaConcluida}
              </p>
            </div>
          </div>

          {/* Ficha Resumen de la Orden */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 p-5 rounded-2xl bg-slate-50 border border-carbon/5">
            <div>
              <span className="text-[10px] font-bold text-carbon/50 uppercase tracking-wider block">
                Cliente / Propietario
              </span>
              <p className="font-titular font-bold text-base text-carbon mt-0.5">
                {orden.clienteNombre || "Cliente General"}
              </p>
              {orden.clienteTelefono && (
                <p className="text-xs text-carbon/60 font-mono">
                  📞 {orden.clienteTelefono}
                </p>
              )}
              {orden.clienteDireccion && (
                <p className="text-xs text-carbon/60 mt-0.5">
                  📍 {orden.clienteDireccion}
                </p>
              )}
            </div>

            <div>
              <span className="text-[10px] font-bold text-carbon/50 uppercase tracking-wider block">
                Obra / Servicio Realizado
              </span>
              <p className="font-titular font-bold text-base text-verde-profundo mt-0.5">
                {orden.titulo}
              </p>
              <p className="text-xs text-carbon/60 capitalize">
                Línea de servicio: {orden.tipoNegocio}
              </p>
              {orden.asesorEjecutorNombre && (
                <p className="text-xs text-carbon/60 mt-0.5">
                  🛠️ Responsable Técnico: <span className="font-semibold text-carbon">{orden.asesorEjecutorNombre}</span>
                </p>
              )}
            </div>
          </div>

          {/* Notas de Conclusión y Entrega Técnica */}
          {orden.notasConclusion && (
            <div className="mb-8 rounded-2xl border border-sauce/25 bg-amber-50/40 p-5">
              <div className="flex items-center gap-2 mb-2 text-sauce font-titular font-bold text-sm">
                <span>📝</span>
                <span>Acuerdos y Dictamen Final de Entrega:</span>
              </div>
              <p className="text-xs sm:text-sm text-carbon/80 leading-relaxed italic whitespace-pre-line">
                "{orden.notasConclusion}"
              </p>
            </div>
          )}

          {/* Tríada de Documentos Oficiales */}
          <div className="mb-8">
            <h3 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo mb-4 flex items-center gap-2">
              <span>📂</span> Documentos Oficiales de Entrega
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* 1. Remisión o Factura */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 flex flex-col justify-between shadow-2xs hover:border-blue-300 transition">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">🧾</span>
                    <span className="rounded-md bg-blue-200/80 px-2 py-0.5 text-[9px] font-bold text-blue-900 uppercase">
                      {remisionFactura ? remisionFactura.tipo : "Remisión"}
                    </span>
                  </div>
                  <h4 className="font-titular font-bold text-xs text-blue-950">
                    {remisionFactura ? (remisionFactura.tipo === "factura" ? "Factura Fiscal" : "Remisión de Entrega") : "Remisión / Factura"}
                  </h4>
                  <p className="text-[11px] text-carbon/60 mt-1">
                    {remisionFactura ? `Folio: ${remisionFactura.folio}` : "Documento de entrega de obra"}
                  </p>
                  {remisionFactura && (
                    <p className="font-bold text-sm text-blue-900 mt-2 font-mono">
                      ${remisionFactura.montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-blue-200/60">
                  {orden.cotizacionToken ? (
                    <Link
                      href={`/cotizacion/remision/${orden.cotizacionToken}`}
                      target="_blank"
                      className="block w-full text-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 shadow-2xs transition"
                    >
                      Consultar Remisión →
                    </Link>
                  ) : (
                    <span className="text-xs text-carbon/40 italic block text-center">Disponible con su asesor</span>
                  )}
                </div>
              </div>

              {/* 2. Póliza de Garantía */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex flex-col justify-between shadow-2xs hover:border-amber-300 transition">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">🛡️</span>
                    <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[9px] font-bold text-amber-900 uppercase">
                      Póliza Activa
                    </span>
                  </div>
                  <h4 className="font-titular font-bold text-xs text-amber-950">
                    Póliza de Garantía Oficial
                  </h4>
                  <p className="text-[11px] text-carbon/60 mt-1">
                    {garantia ? `${garantia.anosGarantia} Años de Cobertura` : "Garantía de calidad de materiales y mano de obra"}
                  </p>
                  {garantia?.fechaVencimiento && (
                    <p className="text-[11px] text-amber-900 mt-2 font-mono font-semibold">
                      Vence: {garantia.fechaVencimiento}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-amber-200/60">
                  {garantia?.token ? (
                    <Link
                      href={`/garantia/${garantia.token}`}
                      target="_blank"
                      className="block w-full text-center rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs py-2 shadow-2xs transition"
                    >
                      Descargar Póliza →
                    </Link>
                  ) : (
                    <span className="text-xs text-carbon/40 italic block text-center">Emitida por dirección</span>
                  )}
                </div>
              </div>

              {/* 3. Recibos y Liquidación */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col justify-between shadow-2xs hover:border-emerald-300 transition">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl">💳</span>
                    <span className="rounded-md bg-emerald-200/80 px-2 py-0.5 text-[9px] font-bold text-emerald-900 uppercase">
                      {saldoPendiente <= 0 ? "Liquidado" : "Pagos"}
                    </span>
                  </div>
                  <h4 className="font-titular font-bold text-xs text-emerald-950">
                    Recibos Oficiales de Pago
                  </h4>
                  <p className="text-[11px] text-carbon/60 mt-1">
                    {recibos && recibos.length > 0 ? `${recibos.length} recibo(s) registrado(s)` : "Registro de anticipos y saldo"}
                  </p>
                  <p className="font-bold text-sm text-emerald-900 mt-2 font-mono">
                    Total: ${totalRecibos.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                  </p>
                  {saldoPendiente <= 0 ? (
                    <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                      ✓ Cuenta 100% al corriente
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-700 font-bold block mt-0.5">
                      Saldo restante: ${saldoPendiente.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-emerald-200/60">
                  {recibos && recibos.length > 0 ? (
                    <Link
                      href={`/recibo/${recibos[0].token}`}
                      target="_blank"
                      className="block w-full text-center rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 shadow-2xs transition"
                    >
                      Ver Último Recibo →
                    </Link>
                  ) : (
                    <span className="text-xs text-carbon/40 italic block text-center">Sin recibos registrados</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Galería de Evidencias Fotográficas */}
          <div className="mb-8">
            <h3 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo mb-4 flex items-center gap-2">
              <span>📷</span> Evidencias Fotográficas de Obra ({orden.fotosEvidencia?.length || 0})
            </h3>

            {fotosEntrega.length > 0 && (
              <div className="mb-5">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-2">
                  Trabajo Terminado y Entregado:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {fotosEntrega.map((f, idx) => (
                    <a
                      key={idx}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative rounded-2xl overflow-hidden border border-carbon/15 bg-carbon/5 aspect-square block shadow-sm hover:shadow-md transition"
                    >
                      <img
                        src={f.url}
                        alt={f.descripcion || "Entrega de obra"}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-emerald-800/80 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5">
                        ✓ Entrega
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {fotosProceso.length > 0 && (
              <div className="mb-5">
                <span className="text-[11px] font-bold text-carbon/60 uppercase tracking-wider block mb-2">
                  Proceso de Ejecución:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {fotosProceso.map((f, idx) => (
                    <a
                      key={idx}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative rounded-2xl overflow-hidden border border-carbon/15 bg-carbon/5 aspect-square block shadow-2xs hover:shadow-md transition"
                    >
                      <img
                        src={f.url}
                        alt={f.descripcion || "Proceso de obra"}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-carbon/70 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5">
                        Proceso
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {fotosInicio.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-carbon/60 uppercase tracking-wider block mb-2">
                  Estado Inicial:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {fotosInicio.map((f, idx) => (
                    <a
                      key={idx}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative rounded-2xl overflow-hidden border border-carbon/15 bg-carbon/5 aspect-square block shadow-2xs hover:shadow-md transition"
                    >
                      <img
                        src={f.url}
                        alt={f.descripcion || "Estado inicial"}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-carbon/70 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5">
                        Inicio
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {(!orden.fotosEvidencia || orden.fotosEvidencia.length === 0) && (
              <p className="text-xs text-carbon/50 italic py-2">
                Sin fotografías registradas en este reporte.
              </p>
            )}
          </div>

          {/* Pie de Firma y Certificación */}
          <div className="border-t border-carbon/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-carbon/60">
            <div>
              <p className="font-bold text-verde-profundo font-titular">
                SAUCEDA · Tradición con Tecnología
              </p>
              <p className="text-[11px] text-carbon/50">
                Atención al Cliente: {MARCA.whatsappTexto} · {MARCA.web.replace("https://", "")}
              </p>
            </div>
            <div className="text-center sm:text-right">
              <span className="inline-block rounded-lg bg-carbon/5 px-2.5 py-1 font-mono text-[10px] text-carbon/70">
                ID Digital: {orden.id.slice(0, 8)}...{orden.id.slice(-6)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
