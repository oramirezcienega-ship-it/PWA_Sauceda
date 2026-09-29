"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { numeroALetras } from "@/lib/numero-a-letras";
import { MARCA } from "@/lib/marca";
import { dinero, etiquetaTipoServicio, fechaLarga, type DatosContrato } from "@/lib/contratos";

interface Props {
  datos: DatosContrato;
  estado: string;
  /** Clase de la fuente serif de títulos (Cormorant Garamond). */
  claseTitulos?: string;
}

const ESTILOS = `
@page { size: letter; margin: 16mm 16mm 22mm 16mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #555; } }
@media print {
  body > *:not([data-contrato-root]) { display: none !important; }
  [data-contrato-barra] { display: none !important; }
  html, body { background: #fff !important; }
  [data-contrato-hoja] { box-shadow: none !important; border: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
  [data-contrato-pie] { position: fixed; bottom: -14mm; left: 0; right: 0; }
  .salto { break-before: page; }
  .no-corte { break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function ContratoDocumento({ datos: d, estado, claseTitulos = "" }: Props) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Nombre sugerido del PDF al guardar
  useEffect(() => {
    const original = document.title;
    document.title = `Contrato ${d.folio} - ${d.cliente.nombre}`.replace(/[\\/:*?"<>|]/g, "-");
    return () => {
      document.title = original;
    };
  }, [d.folio, d.cliente.nombre]);

  const totalConLetra = numeroALetras(d.total).toLowerCase();
  const servicio = etiquetaTipoServicio(d.tipoServicio).toLowerCase();

  const Clausula = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
    <p className="no-corte mb-2 text-justify">
      <strong className="text-verde-profundo">{n}. {titulo}. </strong>
      {children}
    </p>
  );

  const contenido = (
    <div data-contrato-root className="fixed inset-0 z-[100] overflow-y-auto bg-slate-100 print:static print:overflow-visible print:bg-white">
      <style>{ESTILOS}</style>

      {/* Barra (no se imprime) */}
      <div data-contrato-barra className="sticky top-0 z-10 bg-verde-profundo text-crema px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="text-xs font-cuerpo">
          <span className="font-bold">{d.folio}</span> · versión {d.version} ·{" "}
          <span className="uppercase tracking-wider text-dorado">{estado}</span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-dorado text-verde-profundo px-4 py-1.5 rounded-lg text-xs font-bold"
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div
        data-contrato-hoja
        className="mx-auto my-4 max-w-[8.5in] bg-white p-10 shadow-lg border border-carbon/10 font-cuerpo text-[10.5pt] leading-snug text-carbon"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b-2 border-verde-profundo pb-3 mb-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="SAUCEDA" className="h-11 w-11" />
            <div>
              <div className={`${claseTitulos} text-2xl font-bold text-verde-profundo leading-none tracking-wide`}>SAUCEDA</div>
              <div className="text-[8pt] uppercase tracking-[0.2em] text-dorado font-semibold mt-1">Construye · Bienes Raíces</div>
            </div>
          </div>
          <div className="text-right text-[9pt]">
            <div className="font-bold text-verde-profundo">Folio {d.folio}</div>
            <div>Orden de Trabajo: {d.ordenFolio}</div>
            <div>Cotización: {d.cotizacionFolio}</div>
          </div>
        </div>

        <h1 className={`${claseTitulos} text-center text-2xl font-bold text-verde-profundo tracking-wide mb-1`}>
          CONTRATO DE PRESTACIÓN DE SERVICIOS
        </h1>
        <div className="mx-auto h-0.5 w-24 bg-dorado mb-4" />

        {/* Declaraciones */}
        <h2 className={`${claseTitulos} text-lg font-bold text-verde-profundo mb-1`}>Declaraciones</h2>
        <p className="mb-1.5 text-justify">
          <strong>I. El Prestador:</strong> {d.prestador.razonSocial}
          {d.prestador.rfc ? `, RFC ${d.prestador.rfc}` : ""}, con domicilio en {d.prestador.domicilio || "León, Guanajuato"}, León, Gto.
        </p>
        <p className="mb-1.5 text-justify">
          <strong>II. El Cliente:</strong> {d.cliente.nombre}, con domicilio en {d.cliente.domicilio || "________________"}, teléfono{" "}
          {d.cliente.telefono || "________________"}.
        </p>
        <p className="mb-3 text-justify">
          <strong>III.</strong> Ambas partes se reconocen capacidad legal para obligarse en los términos siguientes.
        </p>

        {/* Cláusulas */}
        <h2 className={`${claseTitulos} text-lg font-bold text-verde-profundo mb-1`}>Cláusulas</h2>

        <Clausula n={1} titulo="Objeto">
          El Prestador realizará los trabajos de {servicio} en el inmueble ubicado en {d.domicilioObra}, conforme a la
          cotización {d.cotizacionFolio} (Anexo A), que forma parte integral de este contrato.
        </Clausula>
        <Clausula n={2} titulo="Alcance">{d.alcanceTecnico}</Clausula>
        <Clausula n={3} titulo="Exclusiones">
          No se incluye: {d.exclusiones || "trabajos no descritos en el Anexo A"}. Cualquier trabajo no descrito en el
          Anexo A se considera trabajo adicional.
        </Clausula>
        <Clausula n={4} titulo="Precio">
          El precio total es de {dinero(d.total)} ({totalConLetra}) {d.leyendaIva}.
        </Clausula>
        <Clausula n={5} titulo="Forma de pago">
          Anticipo de {d.anticipoPct}% ({dinero(d.anticipoMonto)}) a la firma de este contrato, y finiquito de{" "}
          {dinero(d.finiquitoMonto)} contra entrega del trabajo. Forma de pago: {d.formaPago}. Cada pago se ampara con un
          recibo emitido por el Prestador.
        </Clausula>
        <Clausula n={6} titulo="Plazo">
          Inicio estimado el {fechaLarga(d.fechaInicio)}, con una duración estimada de {d.duracionDias} días hábiles.{" "}
          {d.clausulaClima}
        </Clausula>
        <Clausula n={7} titulo="Obligaciones del Cliente">
          Permitir el acceso al área de trabajo en el horario acordado, tener disponibles agua y energía eléctrica, y
          despejar el área de objetos personales.
        </Clausula>
        <Clausula n={8} titulo="Trabajos adicionales o cambios">
          Cualquier modificación al alcance se cotiza por separado y solo se ejecuta con autorización por escrito del
          Cliente.
        </Clausula>
        <Clausula n={9} titulo="Cancelación">
          Si el Cliente cancela una vez firmado el contrato, el Prestador podrá retener del anticipo el costo del material
          adquirido y de los trabajos ya realizados, y reembolsará la diferencia.
        </Clausula>
        <Clausula n={10} titulo="Garantía">
          El Prestador otorga una garantía de {d.garantiaTexto} a partir de la fecha de entrega, sobre {d.garantiaObjeto}. La
          garantía no cubre: {d.garantiaExclusiones}. Las condiciones completas se detallan en el Certificado de Garantía
          que se entrega al concluir el trabajo.
        </Clausula>
        <Clausula n={11} titulo="Entrega-recepción">
          El trabajo se tiene por recibido cuando el Cliente firma la remisión de entrega. En ese momento se liquida el
          finiquito y se entregan el Certificado de Garantía y el recibo correspondiente.
        </Clausula>
        <Clausula n={12} titulo="Jurisdicción">
          Para la interpretación y cumplimiento de este contrato, las partes se someten a las leyes y tribunales
          competentes de León, Guanajuato.
        </Clausula>

        {/* Firmas */}
        <div className="no-corte mt-6">
          <p className="mb-8">León, Guanajuato, a ______ de ____________________ de ________.</p>
          <div className="grid grid-cols-2 gap-16 text-center text-[9.5pt]">
            <div>
              <div className="border-b border-carbon/60 mb-1 h-10" />
              <div className="font-bold">EL PRESTADOR</div>
              <div>{d.prestador.razonSocial}</div>
              <div className="text-[8pt] text-carbon/60">Nombre y firma</div>
            </div>
            <div>
              <div className="border-b border-carbon/60 mb-1 h-10" />
              <div className="font-bold">EL CLIENTE</div>
              <div>{d.cliente.nombre}</div>
              <div className="text-[8pt] text-carbon/60">Nombre y firma</div>
            </div>
          </div>
          <p className="mt-4 text-center text-[8.5pt] italic text-carbon/70">
            Se anexa copia de identificación oficial del Cliente.
          </p>
        </div>

        {/* Anexo A */}
        <div className="salto pt-2">
          <h2 className={`${claseTitulos} text-xl font-bold text-verde-profundo border-b-2 border-dorado pb-1 mb-3`}>
            Anexo A — Cotización {d.cotizacionFolio}
          </h2>
          <p className="text-[9pt] mb-2">
            Fecha de cotización: {fechaLarga(d.cotizacionFecha)} · Cliente: {d.cliente.nombre}
          </p>
          <table className="w-full text-[9pt] border-collapse">
            <thead>
              <tr className="bg-verde-profundo text-white">
                <th className="text-left px-2 py-1">Concepto</th>
                <th className="text-right px-2 py-1">Cant.</th>
                <th className="text-left px-2 py-1">Unidad</th>
                <th className="text-right px-2 py-1">P. unitario</th>
                <th className="text-right px-2 py-1">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.partidas.map((p, i) => (
                <tr key={i} className="border-b border-carbon/15 no-corte">
                  <td className="px-2 py-1">{p.descripcion}</td>
                  <td className="px-2 py-1 text-right">{p.cantidad}</td>
                  <td className="px-2 py-1">{p.unidad}</td>
                  <td className="px-2 py-1 text-right">{dinero(p.precioUnitario)}</td>
                  <td className="px-2 py-1 text-right">{dinero(p.importe)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-2 py-1 text-right font-bold">Subtotal</td>
                <td className="px-2 py-1 text-right">{dinero(d.subtotal)}</td>
              </tr>
              <tr className="bg-dorado/20">
                <td colSpan={4} className="px-2 py-1 text-right font-bold">TOTAL</td>
                <td className="px-2 py-1 text-right font-bold">{dinero(d.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1 text-[8.5pt] italic text-carbon/70">{d.leyendaIva}</p>
        </div>

        {/* Anexo B */}
        <div className="salto pt-2">
          <h2 className={`${claseTitulos} text-xl font-bold text-verde-profundo border-b-2 border-dorado pb-1 mb-3`}>
            Anexo B — Estado inicial del área de trabajo
          </h2>
          {d.fotos.length === 0 ? (
            <div>
              <p className="italic text-carbon/70 mb-8">Sin fotografías registradas al momento de la firma.</p>
              <div className="w-64 border-b border-carbon/60 mb-1" />
              <p className="text-[8.5pt]">Firma del Cliente</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {d.fotos.map((f, i) => (
                <figure key={i} className="no-corte border border-carbon/15 rounded p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.descripcion || `Foto ${i + 1}`} className="w-full h-44 object-cover rounded" />
                  <figcaption className="text-[8pt] mt-1 text-carbon/70">
                    {f.fecha ? `${fechaLarga(f.fecha)} · ` : ""}
                    {f.descripcion || `Fotografía ${i + 1}`}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pie fijo en cada hoja impresa: identidad y rúbricas */}
      <div data-contrato-pie className="hidden print:flex items-end justify-between text-[7.5pt] text-carbon/70 border-t border-carbon/20 pt-1">
        <span>
          {MARCA.web.replace("https://", "")} · +52 {MARCA.whatsappTexto} · {d.folio}
        </span>
        <span>Rúbrica cliente ______ / prestador ______</span>
      </div>
    </div>
  );

  return montado ? createPortal(contenido, document.body) : null;
}
